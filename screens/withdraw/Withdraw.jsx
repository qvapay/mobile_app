import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { StyleSheet, Text, View, Pressable, Modal, ScrollView, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// UI
import QPKeyboardView from '../../ui/QPKeyboardView'
import QPButton from '../../ui/particles/QPButton'
import QPSwitch from '../../ui/particles/QPSwitch'
import QPCoin from '../../ui/particles/QPCoin'
import QPInput from '../../ui/particles/QPInput'
import QPCoinRow from '../../ui/QPCoinRow'

// API
import apiClient from '../../api/client'
import { withdrawApi } from '../../api/withdrawApi'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// User Context
import { useAuth } from '../../auth/AuthContext'

// AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage'

// Toast
import Toast from 'react-native-toast-message'

// Quick coin pills for withdraw
const DEFAULT_WITHDRAW_COINS = [
	{ tick: 'BANK_CUP', label: 'CUP' },
	{ tick: 'BANK_MLC', label: 'MLC' },
	{ tick: 'CLASICA', label: 'Clásica' },
	{ tick: 'ETECSA', label: 'ETECSA' },
]
const RECENT_WITHDRAW_KEY = 'qp_recent_withdraw_coins'
const MAX_QUICK_PILLS = 3

// Withdraw balance to certain coin
const Withdraw = ({ navigation }) => {

	// Contexts
	const { user } = useAuth()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
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

	// Recent coins for quick pills
	const [recentCoins, setRecentCoins] = useState([])

	useEffect(() => {
		AsyncStorage.getItem(RECENT_WITHDRAW_KEY).then((stored) => {
			if (stored) {
				try {
					const parsed = JSON.parse(stored)
					if (Array.isArray(parsed)) { setRecentCoins(parsed.slice(0, MAX_QUICK_PILLS)) }
				} catch (e) { /* ignore */ }
			}
		})
	}, [])

	const saveRecentCoin = useCallback((coinTick) => {
		setRecentCoins((prev) => {
			const updated = [coinTick, ...prev.filter((t) => t !== coinTick)].slice(0, MAX_QUICK_PILLS)
			AsyncStorage.setItem(RECENT_WITHDRAW_KEY, JSON.stringify(updated))
			return updated
		})
	}, [])

	const quickCoinPills = useMemo(() => {
		if (!availableCoins.length) return []
		const pills = []
		for (const tick of recentCoins) {
			if (pills.length >= MAX_QUICK_PILLS) break
			const coinData = availableCoins.find((c) => c.tick === tick)
			if (coinData) { pills.push({ tick, label: coinData.name, coinData }) }
		}
		for (const pc of DEFAULT_WITHDRAW_COINS) {
			if (pills.length >= MAX_QUICK_PILLS) break
			if (!pills.some((p) => p.tick === pc.tick)) {
				const coinData = availableCoins.find((c) => c.tick === pc.tick)
				if (coinData) { pills.push({ tick: pc.tick, label: pc.label, coinData }) }
			}
		}
		return pills
	}, [recentCoins, availableCoins])

	// PIN/OTP step
	const [showPinStep, setShowPinStep] = useState(false)
	const [sendingPin, setSendingPin] = useState(false)
	const [sendingWithdraw, setSendingWithdraw] = useState(false)
	const [twoFactorMethod, setTwoFactorMethod] = useState('pin')
	const hasOTP = !!user?.two_factor_secret
	const codeLength = twoFactorMethod === 'pin' ? 4 : 6
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
			} catch (error) { /* error fetching coins */ }
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
				return Math.round(percentageFee * 100) / 100
			}
		} else {
			const feeFixed = Number(coin.fee_out_fixed) || 0
			const percentageFee = (amount * feePercent) / 100
			return Math.round((percentageFee + feeFixed) * 100) / 100
		}
	}

	// Handlers for amount changes (bidirectional)
	const handleChangeQUSD = (value) => {
		setAmountQUSD(value)
		const num = Number(value)
		if (coinPrice && !isNaN(num) && selectedCoin) {
			const totalFee = calculateFee(num, selectedCoin)
			const calculatedNetAmount = num - totalFee
			setNetAmount(calculatedNetAmount ? String(Math.round(calculatedNetAmount * 100) / 100) : '')
			const converted = calculatedNetAmount / coinPrice
			const nearestInteger = Math.round(converted)
			const difference = Math.abs(converted - nearestInteger)
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
			const feePercent = Number(selectedCoin?.fee_out) || 0
			let requiredQUSD

			if (Array.isArray(selectedCoin?.fee_out_fixed) && selectedCoin.fee_out_fixed.length >= 2) {
				const threshold = Number(selectedCoin.fee_out_fixed[0]) || 0
				const fixedAmount = Number(selectedCoin.fee_out_fixed[1]) || 0
				const withPercentageFee = num / (1 - feePercent / 100)
				if (withPercentageFee >= threshold) { requiredQUSD = withPercentageFee }
				else { requiredQUSD = num + fixedAmount }
			} else {
				const feeFixed = Number(selectedCoin?.fee_out_fixed) || 0
				if (feePercent > 0) { requiredQUSD = (num + feeFixed) / (1 - feePercent / 100) }
				else { requiredQUSD = num + feeFixed }
			}

			setAmountQUSD(requiredQUSD ? String(Math.round(requiredQUSD * 100) / 100) : '')
			const converted = num / coinPrice
			const nearestInteger = Math.round(converted)
			const difference = Math.abs(converted - nearestInteger)
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
			// invalid working_data JSON
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
		saveRecentCoin(coin.tick)
		setSelectedCoin(coin)
		setShowCoinPicker(false)
		if (amountQUSD) {
			const price = Number(coin.price)
			if (!isNaN(price)) {
				const totalFee = calculateFee(Number(amountQUSD), coin)
				const calculatedNetAmount = Number(amountQUSD) - totalFee
				setNetAmount(calculatedNetAmount ? String(Math.round(calculatedNetAmount * 100) / 100) : '')
				const converted = calculatedNetAmount / price
				const nearestInteger = Math.round(converted)
				const difference = Math.abs(converted - nearestInteger)
				const finalAmount = difference <= 0.01 ? nearestInteger : Math.round(converted * 1000000) / 1000000
				setAmountCoin(finalAmount ? String(finalAmount) : '')
			}
		}
		setWorkingForm({})
	}

	// Format balance for display
	const formatBalance = (balance) => {
		if (!balance) return '0.00'
		return parseFloat(balance).toFixed(2)
	}

	// Request PIN via email
	const handleRequestPin = async () => {
		try {
			setSendingPin(true)
			const result = await withdrawApi.requestPin()
			if (result.success) {
				Toast.show({ type: 'success', text1: 'PIN enviado', text2: 'Revisa tu correo electrónico' })
			} else {
				Toast.show({ type: 'error', text1: result.error || 'No se pudo enviar el PIN' })
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error al solicitar el PIN' })
		} finally { setSendingPin(false) }
	}

	// Submit withdraw with PIN
	const handleWithdraw = async () => {
		if (!pin || pin.length !== codeLength) {
			Toast.show({ type: 'error', text1: twoFactorMethod === 'pin' ? 'Ingresa un PIN de 4 dígitos' : 'Ingresa un código OTP de 6 dígitos' })
			return
		}

		try {
			setSendingWithdraw(true)
			// Build details with original field names from working_data
			const details = {}
			for (const field of workingFields) {
				const key = keyFromFieldName(field.name)
				details[field.name] = workingForm[key] || ''
			}
			const result = await withdrawApi.withdraw(amountQUSD, selectedCoin.tick, details, pin)

			if (result.success) {
				Toast.show({ type: 'success', text1: 'Extracción procesada', text2: `Se han extraído $${amountQUSD} QUSD` })
				setShowPinStep(false)
				setPin('')
				setAmountQUSD('')
				setAmountCoin('')
				setNetAmount('')
				setWorkingForm({})
				navigation.goBack()
			} else {
				Toast.show({ type: 'error', text1: result.error || 'No se pudo completar la extracción' })
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error al procesar la extracción' })
		} finally { setSendingWithdraw(false) }
	}

	// Switch between PIN and OTP
	const handleMethodToggle = (side) => {
		const method = side === 'left' ? 'pin' : 'otp'
		if (method !== twoFactorMethod) {
			setTwoFactorMethod(method)
			setPin('')
			pinInputsRef.current = new Array(method === 'pin' ? 4 : 6).fill(null)
			setTimeout(() => { pinInputsRef.current[0]?.focus() }, 0)
		}
	}

	// Handle PIN input change
	const handlePinChange = (text, index) => {
		const numericText = text.replace(/[^0-9]/g, '')

		if (numericText.length > 1) {
			const digits = numericText.slice(0, codeLength).split('')
			const newPin = pin.split('')
			digits.forEach((d, i) => { if (index + i < codeLength) newPin[index + i] = d })
			setPin(newPin.join(''))
			const focusIdx = Math.min(index + digits.length, codeLength - 1)
			pinInputsRef.current[focusIdx]?.focus()
			return
		}

		const newPin = pin.split('')
		newPin[index] = numericText
		setPin(newPin.join(''))
		if (numericText && index < codeLength - 1) { pinInputsRef.current[index + 1]?.focus() }
	}

	// Auto-submit when all digits entered
	useEffect(() => {
		if (pin.length === codeLength && !sendingWithdraw) {
			handleWithdraw()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pin])

	// Handle PIN input focus
	const handlePinFocus = (index) => { setFocusedInputIndex(index) }

	// Handle PIN input blur
	const handlePinBlur = () => { setFocusedInputIndex(null) }

	// Handle PIN backspace
	const handlePinKeyPress = (e, index) => {
		if (e.nativeEvent.key === 'Backspace') {
			if (pin[index]) {
				const newPin = pin.split('')
				newPin[index] = ''
				setPin(newPin.join(''))
			} else if (index > 0) {
				const newPin = pin.split('')
				newPin[index - 1] = ''
				setPin(newPin.join(''))
				pinInputsRef.current[index - 1]?.focus()
			}
		}
	}

	return (
		<>
			<QPKeyboardView
				actions={
					showPinStep ? (
						<QPButton
							title={`Extraer $${amountQUSD} ${currency}`}
							onPress={handleWithdraw}
							disabled={!isFormValid || !pin || pin.length < codeLength}
							loading={sendingWithdraw}
							icon="arrow-right"
							iconStyle="solid"
							iconColor={theme.colors.almostWhite}
							textStyle={{ color: theme.colors.almostWhite }}
						/>
					) : (
						<QPButton
							title="Continuar"
							onPress={() => { setShowPinStep(true); setPin('') }}
							disabled={!isFormValid}
							icon="arrow-right"
							iconStyle="solid"
							iconColor={theme.colors.almostWhite}
							textStyle={{ color: theme.colors.almostWhite }}
						/>
					)
				}

			>
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
						</View>
					)}

					{/* PIN/OTP Step */}
					{showPinStep && (
						<View style={{ marginTop: 30 }}>

							{/* PIN/OTP Toggle - only show if user has OTP */}
							{hasOTP && (
								<QPSwitch
									value={twoFactorMethod === 'pin' ? 'left' : 'right'}
									leftText="PIN"
									rightText="OTP"
									leftColor={theme.colors.primary}
									rightColor={theme.colors.primary}
									onChange={handleMethodToggle}
								/>
							)}

							{/* Request PIN button - only in PIN mode */}
							{twoFactorMethod === 'pin' && (
								<Pressable
									onPress={handleRequestPin}
									disabled={sendingPin}
									style={[styles.requestPinButton, { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary, marginTop: hasOTP ? 16 : 0 }]}
								>
									<FontAwesome6 name="envelope" size={16} color={theme.colors.primary} iconStyle="solid" />
									<Text style={[textStyles.h6, { color: theme.colors.primary, marginLeft: 8 }]}>
										{sendingPin ? 'Enviando...' : 'Recibir PIN por correo'}
									</Text>
								</Pressable>
							)}

							<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 20 }]}>
								{twoFactorMethod === 'pin' ? 'Ingresa el PIN de 4 dígitos:' : 'Ingresa tu código OTP:'}
							</Text>
							<View style={styles.pinContainer}>
								{Array.from({ length: codeLength }, (_, index) => (
									<TextInput
										key={`${twoFactorMethod}-${index}`}
										ref={(ref) => pinInputsRef.current[index] = ref}
										style={[styles.pinInput, codeLength === 6 && styles.pinInputSmall, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText, borderColor: focusedInputIndex === index ? theme.colors.primary : theme.colors.border, borderWidth: 0.5 }]}
										value={pin[index] || ''}
										onChangeText={(text) => handlePinChange(text, index)}
										onFocus={() => handlePinFocus(index)}
										onBlur={handlePinBlur}
										onKeyPress={(e) => handlePinKeyPress(e, index)}
										keyboardType="numeric"
										secureTextEntry
										textAlign="center"
										selectTextOnFocus
										textContentType="oneTimeCode"
										autoComplete="sms-otp"
										placeholder={focusedInputIndex === index ? "" : "0"}
										placeholderTextColor={theme.colors.tertiaryText}
									/>
								))}
							</View>
						</View>
					)}
				</View>
			</QPKeyboardView>

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

					{quickCoinPills.length > 0 && (
						<View style={styles.quickCoinPills}>
							{quickCoinPills.map((pill) => (
								<Pressable
									key={pill.tick}
									style={[styles.quickCoinPill, {
										backgroundColor: selectedCoin?.tick === pill.tick ? theme.colors.primary : theme.colors.surface,
										borderColor: selectedCoin?.tick === pill.tick ? theme.colors.primary : theme.colors.border,
									}]}
									onPress={() => handleCoinSelect(pill.coinData)}
								>
									<QPCoin coin={pill.coinData.logo} size={16} />
									<Text style={[textStyles.caption, { fontWeight: '600', color: selectedCoin?.tick === pill.tick ? theme.colors.almostWhite : theme.colors.primaryText, }]}>{pill.label}</Text>
								</Pressable>
							))}
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
								<Pressable key={coin.id} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.elevation }]} onPress={() => handleCoinSelect(coin)}>
									<QPCoinRow coin={coin} amount={amountQUSD} direction="out" />
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
		</>
	)
}

const styles = StyleSheet.create({
	currencyButton: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
		borderWidth: 0.5
	},
	// Quick coin pills
	quickCoinPills: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		paddingHorizontal: 20,
		paddingVertical: 10,
		justifyContent: 'center',
	},
	quickCoinPill: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 16,
		borderWidth: 0.5,
	},
	// Modal styles
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
	coinListContent: { paddingHorizontal: 10, paddingBottom: 20 },
	coinItem: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		marginBottom: 4,
		borderWidth: 1,
	},
	loadingContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		padding: 40,
	},
	requestPinButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		padding: 14,
		borderRadius: 12,
		borderWidth: 1,
	},
	pinContainer: {
		flexDirection: 'row',
		marginVertical: 20,
		gap: 8,
	},
	pinInput: {
		flex: 1,
		height: 60,
		borderRadius: 12,
		borderWidth: 1,
		fontSize: 24,
		fontFamily: 'Rubik-Bold',
		textAlign: 'center',
	},
	pinInputSmall: {
		height: 54,
		borderRadius: 10,
		fontSize: 20,
	},
})

export default Withdraw
