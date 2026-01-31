import { useEffect, useMemo, useState, useRef } from 'react'
import { StyleSheet, Text, View, Pressable, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

// Helper
import { adjustNumber } from '../../helpers'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPCoin from '../../ui/particles/QPCoin'
import QPInput from '../../ui/particles/QPInput'

// API
import apiClient from '../../api/client'
import { withdrawApi } from '../../api/withdrawApi'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// User Context
import { useAuth } from '../../auth/AuthContext'

// Toast
import Toast from 'react-native-toast-message'

// Withdraw balance to certain coin
const Withdraw = ({ navigation }) => {

	// Contexts
	const { user } = useAuth()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	// States
	const [amountQUSD, setAmountQUSD] = useState('')
	const [amountCoin, setAmountCoin] = useState('')
	const [netAmount, setNetAmount] = useState('')
	const [availableCoins, setAvailableCoins] = useState([])
	const [selectedCoin, setSelectedCoin] = useState(null)
	const [showCoinPicker, setShowCoinPicker] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [coinSearch, setCoinSearch] = useState('')
	const [workingForm, setWorkingForm] = useState({})
	const [showCoinSearch, setShowCoinSearch] = useState(false)
	const [balance, setBalance] = useState(user?.balance || 0)
	const [currency, setCurrency] = useState('QUSD')

	// States for pending withdraw
	const [pendingWithdraw, setPendingWithdraw] = useState(false)
	const [sendingPreWithdraw, setSendingPreWithdraw] = useState(false)
	const [sendingWithdraw, setSendingWithdraw] = useState(false)

	// PIN
	const [pin, setPin] = useState('')
	const pinInputsRef = useRef([])
	const [focusedInputIndex, setFocusedInputIndex] = useState(null)

	// Fetch available coins enabled_out
	useEffect(() => {
		const fetchCoins = async () => {
			try {
				setIsLoading(true)
				const response = await apiClient.get('/coins/v2?enabled_out=true')
				setAvailableCoins(response.data)
			} catch (error) { console.warn('Error fetching enabled_out coins', error) }
			finally { setIsLoading(false) }
		}
		fetchCoins()
	}, [])

	// Price helpers
	const coinPrice = useMemo(() => {
		if (!selectedCoin) { return null }
		const price = Number(selectedCoin.price)
		return isNaN(price) ? null : price
	}, [selectedCoin])

	// Calculate fee amount
	const feeAmount = useMemo(() => {
		if (!selectedCoin || !amountQUSD) return 0
		const amount = Number(amountQUSD)
		if (isNaN(amount)) return 0
		const feePercent = Number(selectedCoin.fee_out) || 0
		let feeFixed = 0
		let useFixedFee = false
		if (Array.isArray(selectedCoin.fee_out_fixed) && selectedCoin.fee_out_fixed.length >= 2) {
			const threshold = Number(selectedCoin.fee_out_fixed[0]) || 0
			const fixedAmount = Number(selectedCoin.fee_out_fixed[1]) || 0
			if (amount < threshold) {
				feeFixed = fixedAmount
				useFixedFee = true
			}
		} else { feeFixed = Number(selectedCoin.fee_out_fixed) || 0 }
		if (useFixedFee) { return feeFixed }
		else { return (amount * feePercent) / 100 }
	}, [selectedCoin, amountQUSD])

	// Helper function to calculate fee
	const calculateFee = (amount, coin) => {
		if (!coin) return 0
		const feePercent = Number(coin.fee_out) || 0
		// Check if fee_out_fixed is an array [threshold, fixed_amount]
		if (Array.isArray(coin.fee_out_fixed) && coin.fee_out_fixed.length >= 2) {
			const threshold = Number(coin.fee_out_fixed[0]) || 0
			const fixedAmount = Number(coin.fee_out_fixed[1]) || 0

			// If amount is below threshold, use fixed fee
			if (amount < threshold) {
				return fixedAmount
			} else {
				const percentageFee = (amount * feePercent) / 100
				return Math.round(percentageFee * 100) / 100 // Round to 2 decimal places
			}
		} else {
			// If fee_out_fixed is not an array, treat it as a simple fixed fee
			const feeFixed = Number(coin.fee_out_fixed) || 0
			const percentageFee = (amount * feePercent) / 100
			return Math.round((percentageFee + feeFixed) * 100) / 100 // Round to 2 decimal places
		}
	}

	// Handlers for amount changes (bidirectional)
	const handleChangeQUSD = (value) => {
		setAmountQUSD(value)
		const num = Number(value)
		if (coinPrice && !isNaN(num) && selectedCoin) {
			// Calculate net amount after fees
			const totalFee = calculateFee(num, selectedCoin)
			const calculatedNetAmount = num - totalFee

			// Update netAmount state
			setNetAmount(calculatedNetAmount ? String(Math.round(calculatedNetAmount * 100) / 100) : '')

			// Convert net amount to coin amount with better precision
			const converted = calculatedNetAmount / coinPrice

			// Smart rounding: if the result is very close to a whole number, round to it
			const nearestInteger = Math.round(converted)
			const difference = Math.abs(converted - nearestInteger)

			// If the difference is very small (less than or equal to 0.01), use the rounded integer value
			const finalAmount = difference <= 0.01 ? nearestInteger : Math.round(converted * 1000000) / 1000000

			setAmountCoin(finalAmount ? String(finalAmount) : '')
		} else {
			setNetAmount('')
			setAmountCoin('')
		}
	}

	// Handle change net amount (user wants to receive this net amount in dollars)
	const handleChangeNetAmount = (value) => {
		setNetAmount(value)
		const num = Number(value)
		if (coinPrice && !isNaN(num) && selectedCoin) {
			// Calculate required QUSD amount to achieve this net amount after fees
			const feePercent = Number(selectedCoin?.fee_out) || 0
			let requiredQUSD

			// Check if fee_out_fixed is an array [threshold, fixed_amount]
			if (Array.isArray(selectedCoin?.fee_out_fixed) && selectedCoin.fee_out_fixed.length >= 2) {
				const threshold = Number(selectedCoin.fee_out_fixed[0]) || 0
				const fixedAmount = Number(selectedCoin.fee_out_fixed[1]) || 0

				// We need to solve: netAmount = requiredQUSD - fee
				// where fee = fixedAmount if requiredQUSD < threshold, else fee = requiredQUSD * feePercent/100

				// First, try with percentage fee
				const withPercentageFee = num / (1 - feePercent / 100)

				if (withPercentageFee >= threshold) { requiredQUSD = withPercentageFee }
				else { requiredQUSD = num + fixedAmount }
			} else {
				// Simple case: percentage + fixed fee
				const feeFixed = Number(selectedCoin?.fee_out_fixed) || 0
				if (feePercent > 0) { requiredQUSD = (num + feeFixed) / (1 - feePercent / 100) }
				else { requiredQUSD = num + feeFixed }
			}

			setAmountQUSD(requiredQUSD ? String(Math.round(requiredQUSD * 100) / 100) : '')

			// Convert net amount to coin amount with better precision
			const converted = num / coinPrice

			// Smart rounding: if the result is very close to a whole number, round to it
			const nearestInteger = Math.round(converted)
			const difference = Math.abs(converted - nearestInteger)

			// If the difference is very small (less than or equal to 0.01), use the rounded integer value
			const finalAmount = difference <= 0.01 ? nearestInteger : Math.round(converted * 1000000) / 1000000

			setAmountCoin(finalAmount ? String(finalAmount) : '')
		} else {
			setAmountQUSD('')
			setAmountCoin('')
		}
	}

	// Working data parsing
	const workingFields = useMemo(() => {
		if (!selectedCoin || !selectedCoin.working_data) { return [] }
		try {
			const raw = typeof selectedCoin.working_data === 'string' ? JSON.parse(selectedCoin.working_data) : selectedCoin.working_data
			if (Array.isArray(raw)) { return raw }
			return []
		} catch (e) {
			console.warn('Invalid working_data JSON for coin', selectedCoin?.tick)
			return []
		}
	}, [selectedCoin])

	const keyFromFieldName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

	const isFormValid = useMemo(() => {
		if (!selectedCoin) { return false }
		const amount = Number(amountQUSD)
		if (!amount || isNaN(amount)) { return false }
		return workingFields.every((field) => {
			const key = keyFromFieldName(field.name)
			const value = (workingForm[key] ?? '').toString().trim()
			return value.length > 0
		})
	}, [selectedCoin, amountQUSD, workingFields, workingForm])

	const handleCoinSelect = (coin) => {
		setSelectedCoin(coin)
		setShowCoinPicker(false)
		// Recompute bottom amount when selecting coin (with fees)
		if (amountQUSD) {
			const price = Number(coin.price)
			if (!isNaN(price)) {
				// Calculate net amount after fees using the helper function
				const totalFee = calculateFee(Number(amountQUSD), coin)
				const calculatedNetAmount = Number(amountQUSD) - totalFee
				setNetAmount(calculatedNetAmount ? String(Math.round(calculatedNetAmount * 100) / 100) : '')
				const converted = calculatedNetAmount / price
				// Smart rounding: if the result is very close to a whole number, round to it
				const nearestInteger = Math.round(converted)
				const difference = Math.abs(converted - nearestInteger)
				// If the difference is very small (less than or equal to 0.01), use the rounded integer value
				const finalAmount = difference <= 0.01 ? nearestInteger : Math.round(converted * 1000000) / 1000000
				setAmountCoin(finalAmount ? String(finalAmount) : '')
			}
		}
		// Reset form for new coin
		setWorkingForm({})
	}

	// Format balance for display
	const formatBalance = (balance) => {
		if (!balance) return '0.00'
		return parseFloat(balance).toFixed(2)
	}

	// Send withdraw request to API without PIN
	const handlePreWithdraw = async () => {
		try {
			setPendingWithdraw(true)
			setSendingPreWithdraw(true)
			setPin('')

			// Send request to API
			const result = await withdrawApi.preWithdraw(amountQUSD, selectedCoin.tick, workingForm)

			if (!result.success) {
				console.error('Pre-withdraw error:', result.error)
				// TODO: Show error toast/message to user
				setPendingWithdraw(false)
			}
			// If successful, the PIN input will be shown and user will receive email

		} catch (error) { console.error('Error processing withdrawal:', error); setPendingWithdraw(false) }
		finally { setSendingPreWithdraw(false) }
	}

	// Send withdraw request to API with PIN
	const handleWithdraw = async () => {

		if (!pin || pin.length !== 4) {
			Toast.show({ type: 'error', text1: 'El PIN es requerido' })
			return
		}

		try {
			setSendingWithdraw(true)

			// Send request to API with PIN
			const result = await withdrawApi.withdraw(amountQUSD, selectedCoin.tick, workingForm, pin)

			if (result.success) {
				// TODO: Show success message and navigate back or to transactions
				console.log('Withdrawal successful:', result.data)
				// Reset form and navigate
				setPendingWithdraw(false)
				setPin('')
				setAmountQUSD('')
				setAmountCoin('')
				setNetAmount('')
				setWorkingForm({})
				// Optionally navigate to transactions or home
			} else {
				console.error('Withdraw error:', result.error)
				// TODO: Show error toast/message to user
			}

		} catch (error) { console.error('Error processing withdrawal:', error) }
		finally { setSendingWithdraw(false) }
	}

	// Handle PIN input change
	const handlePinChange = (text, index) => {
		const numericText = text.replace(/[^0-9]/g, '')
		const newPin = pin.split('')
		newPin[index] = numericText
		const updatedPin = newPin.join('')
		setPin(updatedPin)
		if (numericText && index < 3) { pinInputsRef.current[index + 1]?.focus() }
	}

	// Handle PIN input focus
	const handlePinFocus = (index) => { setFocusedInputIndex(index) }

	// Handle PIN input blur
	const handlePinBlur = () => { setFocusedInputIndex(null) }

	// Handle PIN backspace
	const handlePinKeyPress = (e, index) => {
		if (e.nativeEvent.key === 'Backspace') {
			if (pin[index]) {
				// If current input has content, clear it
				const newPin = pin.split('')
				newPin[index] = ''
				setPin(newPin.join(''))
			} else if (index > 0) {
				// If current input is empty, go to previous input and clear it
				const newPin = pin.split('')
				newPin[index - 1] = ''
				setPin(newPin.join(''))
				pinInputsRef.current[index - 1]?.focus()
			}
		}
	}

	return (
		<KeyboardAvoidingView style={containerStyles.subContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
			<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				<ScrollView contentContainerStyle={[containerStyles.scrollContainer]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
					<View style={{ flex: 1 }}>

						{/* Swap Card */}
						<View style={{ backgroundColor: theme.colors.primary + '18', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 2, borderColor: theme.colors.primary }}>

							{/* QUSD amount input */}
							<View style={{ paddingVertical: 2 }}>

								<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
									<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>Extraer</Text>
									<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
										<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>
											Balance:
										</Text>
										<Text style={[textStyles.h7, { color: theme.colors.primary, fontWeight: '600' }]}>
											{formatBalance(balance)} {currency}
										</Text>
									</View>
								</View>

								{/* Single row container with dark background */}
								<View style={{ borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
									{/* Left side - Amount input */}
									<View style={{ flex: 1 }}>
										<TextInput
											value={amountQUSD}
											onChangeText={handleChangeQUSD}
											placeholder="0.00"
											placeholderTextColor={theme.colors.placeholder}
											keyboardType="numeric"
											style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: 32, fontWeight: '600', padding: 0, margin: 0 }]}
										/>
									</View>
									{/* Right side - Static QUSD display */}
									<View style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
										<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
											<QPCoin coin="qusd" size={20} />
											<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>QUSD</Text>
										</View>
									</View>
								</View>
							</View>

							{/* Divider with arrows */}
							<View style={{ alignItems: 'center', justifyContent: 'center' }}>
								<View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
									<FontAwesome6 name="up-down" size={10} color={theme.colors.primary} iconStyle="solid" />
								</View>
							</View>

							{/* Coin amount and selector */}
							<View style={{ paddingTop: 2 }}>
								<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>Recibir</Text>
								{/* Single row container with dark background */}
								<View style={{ borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
									{/* Left side - Amount and available balance */}
									<View style={{ flex: 1 }}>
										<TextInput
											value={netAmount}
											onChangeText={handleChangeNetAmount}
											placeholder="0.00"
											placeholderTextColor={theme.colors.placeholder}
											keyboardType="numeric"
											style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: 32, fontWeight: '600', padding: 0, margin: 0 }]}
											editable={!!selectedCoin}
										/>
									</View>
									{/* Right side - Currency selector button */}
									<Pressable style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]} onPress={() => setShowCoinPicker(true)} >
										{selectedCoin ? (
											<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
												<QPCoin coin={selectedCoin.logo} size={20} />
												<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{selectedCoin.tick}</Text>
												<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
											</View>
										) : (
											<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
												<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>Moneda</Text>
												<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
											</View>
										)}
									</Pressable>
								</View>
								{selectedCoin && amountCoin && !selectedCoin.stable && (
									<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
										<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}></Text>
										<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
											<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>
												Aproximado:
											</Text>
											<Text style={[textStyles.h7, { color: theme.colors.primary, fontWeight: '600' }]}>
												{formatBalance(amountCoin)} {selectedCoin.tick}
											</Text>
										</View>
									</View>
								)}
							</View>
						</View>

						{/* Dynamic Working Data Inputs */}
						{selectedCoin && workingFields.length > 0 && (
							<View style={{ marginTop: 20 }}>
								<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 10 }]}>Datos de su cuenta:</Text>
								{workingFields.map((field) => {
									const key = keyFromFieldName(field.name)
									return (
										<QPInput
											key={key}
											value={workingForm[key] || ''}
											onChangeText={(text) => setWorkingForm((prev) => ({ ...prev, [key]: text }))}
											placeholder={field.name}
											keyboardType={field.type === 'number' ? 'numeric' : 'default'}
											style={{ marginVertical: 6 }}
											prefixIconName="id-card"
										/>
									)
								})}

								{/** PIN input */}
								{pendingWithdraw && (
									<View style={{ marginTop: 30 }}>
										<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center' }]}>Hemos enviado un código a tu correo electrónico para verificar tu identidad.</Text>
										<Text style={[textStyles.h5, { color: theme.colors.secondaryText, textAlign: 'center' }]}>Ingresa el código para continuar:</Text>
										<View style={styles.pinContainer}>
											{[0, 1, 2, 3].map((index) => (
												<TextInput
													key={index}
													ref={(ref) => pinInputsRef.current[index] = ref}
													style={[styles.pinInput, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText, borderColor: focusedInputIndex === index ? theme.colors.primary : theme.colors.border, borderWidth: 0.5 }]}
													value={pin[index] || ''}
													onChangeText={(text) => handlePinChange(text, index)}
													onFocus={() => handlePinFocus(index)}
													onBlur={handlePinBlur}
													onKeyPress={(e) => handlePinKeyPress(e, index)}
													keyboardType="numeric"
													maxLength={1}
													secureTextEntry
													textAlign="center"
													selectTextOnFocus
													placeholder={focusedInputIndex === index ? "" : "0"}
													placeholderTextColor={theme.colors.tertiaryText}
												/>
											))}
										</View>
									</View>
								)}

							</View>
						)}
					</View>

					{/* Bottom Button */}
					<View style={[containerStyles.bottomButtonContainer, { paddingBottom: insets.bottom + 16 }]}>

						{pendingWithdraw ? (
							<QPButton
								title={`Extraer ${amountQUSD} ${currency}`}
								onPress={() => { handleWithdraw() }}
								disabled={!isFormValid || !pin}
								icon="arrow-right"
								iconStyle="solid"
								iconColor={theme.colors.almostWhite}
								textStyle={{ color: theme.colors.almostWhite }}
							/>
						) : (
							<QPButton
								title="Continuar"
								onPress={() => { handlePreWithdraw() }}
								disabled={!isFormValid}
								icon="arrow-right"
								iconStyle="solid"
								iconColor={theme.colors.almostWhite}
								textStyle={{ color: theme.colors.almostWhite }}
							/>
						)}
					</View>

					<Modal visible={showCoinPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCoinPicker(false)}>
						<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>

							<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
								<Text style={textStyles.h4}>Seleccionar Moneda</Text>
								<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
									<Pressable onPress={() => setShowCoinSearch(!showCoinSearch)}>
										<FontAwesome6 name="magnifying-glass" size={18} color={showCoinSearch ? theme.colors.primary : theme.colors.primaryText} iconStyle="solid" />
									</Pressable>
									<Pressable onPress={() => setShowCoinPicker(false)} style={styles.closeButton}>
										<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
									</Pressable>
								</View>
							</View>

							{showCoinSearch && (
								<View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
									<QPInput
										value={coinSearch}
										onChangeText={setCoinSearch}
										placeholder="Buscar moneda..."
										prefixIconName="magnifying-glass"
										style={styles.searchInput}
									/>
								</View>
							)}

							<ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true}>

								{isLoading ? (
									<View style={styles.loadingContainer}>
										<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>Cargando monedas...</Text>
									</View>
								) : availableCoins.length > 0 ? (availableCoins
									.filter((coin) =>
										coin.name.toLowerCase().includes(coinSearch.toLowerCase()) ||
										coin.tick.toLowerCase().includes(coinSearch.toLowerCase())
									)
									.map((coin) => (
										<Pressable key={coin.id} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]} onPress={() => handleCoinSelect(coin)}>

											<QPCoin coin={coin.logo} size={40} />

											<View style={{ marginLeft: 12, flex: 1 }}>
												<Text style={textStyles.h4}>{coin.name}</Text>
												<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Mín: ${adjustNumber(coin.min_out)} | Precio: ${adjustNumber(coin.price)}</Text>
											</View>

											<View style={{ alignItems: 'flex-end', gap: 4 }}>
												{coin.network && (
													<View style={[styles.networkBadge, { backgroundColor: theme.colors.primary }]}>
														<Text style={[textStyles.h7, { color: theme.colors.buttonText }]}>{coin.network}</Text>
													</View>
												)}
												{coin.fee_out && (
													<Text style={[textStyles.h7, { color: theme.colors.buttonText }]}>{coin.fee_out}%</Text>
												)}
											</View>

										</Pressable>
									))
								) : (
									<View style={styles.loadingContainer}>
										<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>No hay monedas disponibles</Text>
									</View>
								)}

							</ScrollView>
						</SafeAreaView>
					</Modal>

				</ScrollView>
			</TouchableWithoutFeedback>
		</KeyboardAvoidingView>
	)
}

const styles = StyleSheet.create({
	currencyButton: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
		borderWidth: 0.5
	},
	// Modal styles (reused from Add.jsx for consistency)
	modalContainer: { flex: 1 },
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 15,
		borderBottomWidth: 0.5
	},
	closeButton: { padding: 5 },
	coinList: { flex: 1 },
	coinListContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
	coinItem: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 15,
		borderRadius: 10,
		marginBottom: 10,
		borderWidth: 0.5,
		borderColor: 'rgba(255, 255, 255, 0.2)',
	},
	networkBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		marginLeft: 8,
	},
	loadingContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		padding: 40,
	},
	pinContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginVertical: 20,
		paddingHorizontal: 20,
	},
	pinInput: {
		width: 60,
		height: 60,
		borderRadius: 12,
		borderWidth: 1,
		fontSize: 24,
		fontWeight: 'bold',
		textAlign: 'center',
	},
})

export default Withdraw