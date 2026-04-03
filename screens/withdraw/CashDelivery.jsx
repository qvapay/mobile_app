import { useEffect, useMemo, useState, useRef } from 'react'
import { StyleSheet, Text, View, Pressable, TextInput } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// UI
import QPKeyboardView from '../../ui/QPKeyboardView'
import QPButton from '../../ui/particles/QPButton'
import QPSwitch from '../../ui/particles/QPSwitch'
import QPInput from '../../ui/particles/QPInput'

// API
import apiClient from '../../api/client'
import { withdrawApi } from '../../api/withdrawApi'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// User Context
import { useAuth } from '../../auth/AuthContext'

// Toast
import { toast } from 'sonner-native'

const USDCASH_TICK = 'USDCASH'

const CashDelivery = ({ navigation }) => {

	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Coin state
	const [coin, setCoin] = useState(null)
	const [loadingCoin, setLoadingCoin] = useState(true)

	// Amount state
	const [amountQUSD, setAmountQUSD] = useState('')
	const [netAmount, setNetAmount] = useState('')
	const [balance] = useState(user?.balance || 0)

	// Working data form
	const [workingForm, setWorkingForm] = useState({})

	// Map visibility - show when any address-like field has content
	const [showMap, setShowMap] = useState(false)

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

	// Fetch USDCASH coin on mount
	useEffect(() => {
		const fetchCoin = async () => {
			try {
				setLoadingCoin(true)
				const response = await apiClient.get('/coins/v2?enabled_out=true')
				const usdCash = response.data?.find(c => c.tick === USDCASH_TICK)
				if (usdCash) {
					setCoin(usdCash)
				} else {
					toast.error('Servicio no disponible en este momento')
				}
			} catch {
				toast.error('Error al cargar el servicio')
			} finally {
				setLoadingCoin(false)
			}
		}
		fetchCoin()
	}, [])

	// Fee calculation
	const calculateFee = (amount, c) => {
		if (!c) return 0
		const feePercent = Number(c.fee_out) || 0
		if (Array.isArray(c.fee_out_fixed) && c.fee_out_fixed.length >= 2) {
			const threshold = Number(c.fee_out_fixed[0]) || 0
			const fixedAmount = Number(c.fee_out_fixed[1]) || 0
			if (amount < threshold) return fixedAmount
			return Math.round((amount * feePercent) / 100 * 100) / 100
		}
		const feeFixed = Number(c.fee_out_fixed) || 0
		return Math.round(((amount * feePercent) / 100 + feeFixed) * 100) / 100
	}

	const feeAmount = useMemo(() => {
		if (!coin || !amountQUSD) return 0
		const amount = Number(amountQUSD)
		if (isNaN(amount)) return 0
		return calculateFee(amount, coin)
	}, [coin, amountQUSD])

	// Handle QUSD amount change
	const handleChangeQUSD = (value) => {
		setAmountQUSD(value)
		const num = Number(value)
		if (!isNaN(num) && coin) {
			const fee = calculateFee(num, coin)
			const net = num - fee
			setNetAmount(net > 0 ? String(Math.round(net * 100) / 100) : '')
		} else {
			setNetAmount('')
		}
	}

	// Handle net amount change (reverse calc)
	const handleChangeNetAmount = (value) => {
		setNetAmount(value)
		const num = Number(value)
		if (!isNaN(num) && coin) {
			const feePercent = Number(coin.fee_out) || 0
			let requiredQUSD
			if (Array.isArray(coin.fee_out_fixed) && coin.fee_out_fixed.length >= 2) {
				const threshold = Number(coin.fee_out_fixed[0]) || 0
				const fixedAmount = Number(coin.fee_out_fixed[1]) || 0
				const withPercentageFee = num / (1 - feePercent / 100)
				if (withPercentageFee >= threshold) requiredQUSD = withPercentageFee
				else requiredQUSD = num + fixedAmount
			} else {
				const feeFixed = Number(coin.fee_out_fixed) || 0
				if (feePercent > 0) requiredQUSD = (num + feeFixed) / (1 - feePercent / 100)
				else requiredQUSD = num + feeFixed
			}
			setAmountQUSD(requiredQUSD ? String(Math.round(requiredQUSD * 100) / 100) : '')
		} else {
			setAmountQUSD('')
		}
	}

	// Working data fields from coin
	const workingFields = useMemo(() => {
		if (!coin || !coin.working_data) return []
		try {
			const raw = typeof coin.working_data === 'string' ? JSON.parse(coin.working_data) : coin.working_data
			return Array.isArray(raw) ? raw : []
		} catch { return [] }
	}, [coin])

	const keyFromFieldName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

	// Check if any address-like field has content to show map
	useEffect(() => {
		const addressKeywords = ['direcci', 'address', 'calle', 'lugar', 'ubicaci']
		const hasAddress = workingFields.some(field => {
			const key = keyFromFieldName(field.name)
			const value = (workingForm[key] ?? '').toString().trim()
			const isAddressField = addressKeywords.some(kw => field.name.toLowerCase().includes(kw))
			return isAddressField && value.length > 3
		})
		setShowMap(hasAddress)
	}, [workingForm, workingFields])

	// Form validation
	const isFormValid = useMemo(() => {
		if (!coin) return false
		const amount = Number(amountQUSD)
		if (!amount || isNaN(amount)) return false
		return workingFields.every((field) => {
			const key = keyFromFieldName(field.name)
			const value = (workingForm[key] ?? '').toString().trim()
			return value.length > 0
		})
	}, [coin, amountQUSD, workingFields, workingForm])

	const formatBalance = (b) => {
		if (!b) return '0.00'
		return parseFloat(b).toFixed(2)
	}

	// Request PIN via email
	const handleRequestPin = async () => {
		try {
			setSendingPin(true)
			const result = await withdrawApi.requestPin()
			if (result.success) {
				toast.success('PIN enviado', { description: 'Revisa tu correo electrónico' })
			} else {
				toast.error(result.error || 'No se pudo enviar el PIN')
			}
		} catch {
			toast.error('Error al solicitar el PIN')
		} finally { setSendingPin(false) }
	}

	// Submit withdraw
	const handleWithdraw = async () => {
		if (!pin || pin.length !== codeLength) {
			toast.error(twoFactorMethod === 'pin' ? 'Ingresa un PIN de 4 dígitos' : 'Ingresa un código OTP de 6 dígitos')
			return
		}
		try {
			setSendingWithdraw(true)
			const details = {}
			for (const field of workingFields) {
				const key = keyFromFieldName(field.name)
				details[field.name] = workingForm[key] || ''
			}
			const result = await withdrawApi.withdraw(amountQUSD, USDCASH_TICK, details, pin)
			if (result.success) {
				toast.success('Envío procesado', { description: `Se enviarán $${netAmount} USD en efectivo` })
				setShowPinStep(false)
				setPin('')
				setAmountQUSD('')
				setNetAmount('')
				setWorkingForm({})
				navigation.goBack()
			} else {
				toast.error(result.error || 'No se pudo completar el envío')
			}
		} catch {
			toast.error('Error al procesar el envío')
		} finally { setSendingWithdraw(false) }
	}

	// PIN/OTP toggle
	const handleMethodToggle = (side) => {
		const method = side === 'left' ? 'pin' : 'otp'
		if (method !== twoFactorMethod) {
			setTwoFactorMethod(method)
			setPin('')
			pinInputsRef.current = new Array(method === 'pin' ? 4 : 6).fill(null)
			setTimeout(() => { pinInputsRef.current[0]?.focus() }, 0)
		}
	}

	// PIN input handlers
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
		if (numericText && index < codeLength - 1) pinInputsRef.current[index + 1]?.focus()
	}

	// Auto-submit when all digits entered
	useEffect(() => {
		if (pin.length === codeLength && !sendingWithdraw) handleWithdraw()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pin])

	const handlePinFocus = (index) => setFocusedInputIndex(index)
	const handlePinBlur = () => setFocusedInputIndex(null)
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

	if (loadingCoin) {
		return (
			<View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>Cargando...</Text>
			</View>
		)
	}

	if (!coin) {
		return (
			<View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
				<FontAwesome6 name="circle-exclamation" size={48} color={theme.colors.tertiaryText} iconStyle="solid" />
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginTop: 16, textAlign: 'center' }]}>
					El servicio de envío de efectivo{'\n'}no está disponible en este momento
				</Text>
				<QPButton title="Volver" onPress={() => navigation.goBack()} style={{ marginTop: 24 }} />
			</View>
		)
	}

	return (
		<QPKeyboardView
			actions={
				showPinStep ? (
					<QPButton
						title={`Enviar $${amountQUSD} QUSD`}
						onPress={handleWithdraw}
						disabled={!isFormValid || !pin || pin.length < codeLength}
						loading={sendingWithdraw}
						icon="paper-plane"
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

				{/* Amount Card */}
				<View style={[styles.swapCard, { backgroundColor: theme.colors.primary + '18', borderColor: theme.colors.primary }]}>

					{/* QUSD input */}
					<View style={{ paddingVertical: 2 }}>
						<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>Enviar</Text>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
								<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>Balance:</Text>
								<Text style={[textStyles.h7, { color: theme.colors.primary, fontWeight: '600' }]}>
									{formatBalance(balance)} QUSD
								</Text>
							</View>
						</View>
						<View style={{ borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
							<View style={{ flex: 1 }}>
								<TextInput
									value={amountQUSD}
									onChangeText={handleChangeQUSD}
									placeholder="0.00"
									placeholderTextColor={theme.colors.placeholder}
									keyboardType="numeric"
									style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold, padding: 0, margin: 0 }]}
								/>
							</View>
							<View style={[styles.currencyBadge, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>QUSD</Text>
							</View>
						</View>
					</View>

					{/* Divider */}
					<View style={{ alignItems: 'center', justifyContent: 'center' }}>
						<View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
							<FontAwesome6 name="arrow-down" size={10} color={theme.colors.primary} iconStyle="solid" />
						</View>
					</View>

					{/* Net amount (USD received) */}
					<View style={{ paddingTop: 2 }}>
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>Recibir en efectivo</Text>
						<View style={{ borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
							<View style={{ flex: 1 }}>
								<TextInput
									value={netAmount}
									onChangeText={handleChangeNetAmount}
									placeholder="0.00"
									placeholderTextColor={theme.colors.placeholder}
									keyboardType="numeric"
									style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold, padding: 0, margin: 0 }]}
								/>
							</View>
							<View style={[styles.currencyBadge, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
								<FontAwesome6 name="dollar-sign" size={14} color={theme.colors.success} iconStyle="solid" />
								<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 6 }]}>USD</Text>
							</View>
						</View>
						{feeAmount > 0 && (
							<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
								<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>Comisión:</Text>
								<Text style={[textStyles.h7, { color: theme.colors.warning, fontWeight: '600' }]}>
									${formatBalance(feeAmount)} QUSD
								</Text>
							</View>
						)}
					</View>
				</View>

				{/* Working Data Fields */}
				{workingFields.length > 0 && (
					<View style={{ marginTop: 20 }}>
						<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 10 }]}>Datos de entrega:</Text>
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

				{/* Map Preview */}
				{showMap && (
					<View style={[styles.mapPreview, { backgroundColor: theme.colors.elevation }]}>
						{/* Decorative map grid */}
						<View style={styles.mapGrid}>
							{Array.from({ length: 5 }, (_, i) => (
								<View key={`mh-${i}`} style={[styles.mapGridLineH, { top: `${(i + 1) * 16}%`, backgroundColor: theme.colors.primary + '15' }]} />
							))}
							{Array.from({ length: 7 }, (_, i) => (
								<View key={`mv-${i}`} style={[styles.mapGridLineV, { left: `${(i + 1) * 12.5}%`, backgroundColor: theme.colors.primary + '15' }]} />
							))}
						</View>
						{/* Location marker */}
						<View style={[styles.mapMarker, { backgroundColor: theme.colors.primary }]}>
							<FontAwesome6 name="location-dot" size={20} color="#FFFFFF" iconStyle="solid" />
						</View>
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, position: 'absolute', bottom: 8, left: 12 }]}>
							La Habana, Cuba
						</Text>
						{/* Decorative car */}
						<View style={{ position: 'absolute', top: '30%', left: '25%', transform: [{ rotate: '30deg' }] }}>
							<FontAwesome6 name="car-side" size={14} color={theme.colors.primary + '88'} iconStyle="solid" />
						</View>
					</View>
				)}

				{/* PIN/OTP Step */}
				{showPinStep && (
					<View style={{ marginTop: 30 }}>
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
									style={[
										styles.pinInput,
										codeLength === 6 && styles.pinInputSmall,
										{
											fontSize: codeLength === 6 ? theme.typography.fontSize.xl : theme.typography.fontSize.xxl,
											fontFamily: theme.typography.fontFamily.bold,
											backgroundColor: theme.colors.surface,
											color: theme.colors.primaryText,
											borderColor: focusedInputIndex === index ? theme.colors.primary : theme.colors.border,
											borderWidth: 0.5,
										},
									]}
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
									placeholder={focusedInputIndex === index ? '' : '0'}
									placeholderTextColor={theme.colors.tertiaryText}
								/>
							))}
						</View>
					</View>
				)}
			</View>
		</QPKeyboardView>
	)
}

const styles = StyleSheet.create({
	centered: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 20,
	},
	header: {
		alignItems: 'center',
		marginBottom: 20,
	},
	headerIcon: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: 'center',
		justifyContent: 'center',
	},
	swapCard: {
		borderRadius: 16,
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderWidth: 2,
	},
	currencyBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
		borderWidth: 0.5,
	},
	mapPreview: {
		marginTop: 16,
		height: 120,
		borderRadius: 12,
		overflow: 'hidden',
		position: 'relative',
		alignItems: 'center',
		justifyContent: 'center',
	},
	mapGrid: {
		...StyleSheet.absoluteFillObject,
	},
	mapGridLineH: {
		position: 'absolute',
		left: 0,
		right: 0,
		height: 1,
	},
	mapGridLineV: {
		position: 'absolute',
		top: 0,
		bottom: 0,
		width: 1,
	},
	mapMarker: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: 'center',
		justifyContent: 'center',
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
		textAlign: 'center',
	},
	pinInputSmall: {
		height: 54,
		borderRadius: 10,
	},
})

export default CashDelivery
