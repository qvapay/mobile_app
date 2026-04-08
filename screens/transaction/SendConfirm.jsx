import { useState, useRef, useEffect } from 'react'
import { View, Text, TextInput, StyleSheet } from 'react-native'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPKeyboardView from '../../ui/QPKeyboardView'
import QPButton from '../../ui/particles/QPButton'
import QPSwitch from '../../ui/particles/QPSwitch'
import ProfileContainerHorizontal from '../../ui/ProfileContainerHorizontal'

// API
import { userApi } from '../../api/userApi'
import { transferApi } from '../../api/transferApi'
import { withdrawApi } from '../../api/withdrawApi'

// Routes
import { ROUTES } from '../../routes'

// Toast
import { toast } from 'sonner-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Confirm Screen for Send instructions
// Shows transaction details and allows user to confirm before sending
const SendConfirm = ({ navigation, route }) => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	// Params from route
	const { send_amount, user_uuid, description = '' } = route.params || {}

	// States
	const [recipientUser, setRecipientUser] = useState(null)
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingUser, setIsLoadingUser] = useState(true)

	// PIN/OTP states
	const [showPinStep, setShowPinStep] = useState(false)
	const [sendingPin, setSendingPin] = useState(false)
	const [twoFactorMethod, setTwoFactorMethod] = useState('pin')
	const hasOTP = !!user?.two_factor_secret
	const codeLength = twoFactorMethod === 'pin' ? 4 : 6
	const [pin, setPin] = useState('')
	const pinInputsRef = useRef([])
	const [focusedInputIndex, setFocusedInputIndex] = useState(null)
	const scrollViewRef = useRef(null)

	// Fetch recipient user data
	useState(() => {
		const fetchRecipientUser = async () => {
			if (!user_uuid) {
				setIsLoadingUser(false)
				return
			}
			try {
				setIsLoadingUser(true)
				const result = await userApi.searchUser(user_uuid)
				if (result.success && result.data.length > 0) {
					setRecipientUser(result.data[0])
				} else {
					toast.error('Error', { description: 'No se pudo encontrar el usuario destinatario' })
					navigation.goBack()
				}
			} catch (error) {
				toast.error('Error', { description: 'Error al cargar los datos del destinatario' })
				navigation.goBack()
			} finally { setIsLoadingUser(false) }
		}
		fetchRecipientUser()
	}, [user_uuid, navigation])

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
		} catch (error) {
			toast.error('Error al solicitar el PIN')
		} finally { setSendingPin(false) }
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
		if (pin.length === codeLength && !isLoading) {
			executeTransaction()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pin])

	// Auto-scroll to PIN section when it appears
	useEffect(() => {
		if (showPinStep) {
			setTimeout(() => {
				scrollViewRef.current?.scrollToEnd({ animated: true })
				pinInputsRef.current[0]?.focus()
			}, 100)
		}
	}, [showPinStep])

	// Handle PIN input focus/blur
	const handlePinFocus = (index) => {
		setFocusedInputIndex(index)
		setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
	}
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

	// Execute the actual transaction
	const executeTransaction = async () => {

		if (!pin || pin.length !== codeLength) {
			toast.error(twoFactorMethod === 'pin' ? 'Ingresa un PIN de 4 dígitos' : 'Ingresa un código OTP de 6 dígitos')
			return
		}

		try {
			setIsLoading(true)
			const result = await transferApi.transferMoney({
				amount: send_amount,
				description: description,
				to: recipientUser.uuid,
				pin: pin
			})

			if (result.success) {
				navigation.navigate(ROUTES.SEND_SUCCESS, { amount: send_amount, recipient: recipientUser, description: description })
			} else {
				toast.error('Error en la transacción', { description: result.error || 'No se pudo completar la transacción' })
			}
		} catch (error) {
			toast.error('Error', { description: error.message || 'Error inesperado al procesar la transacción' })
		} finally { setIsLoading(false) }
	}

	// Loading state — global loading bar handles the indicator
	if (isLoadingUser) { return <View style={containerStyles.subContainer} /> }

	// Show error if no recipient user found
	if (!recipientUser) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<FontAwesome6 name="user-slash" size={64} color={theme.colors.tertiaryText} iconStyle="solid" />
				<Text style={[textStyles.h4, { color: theme.colors.primaryText, marginTop: 20, textAlign: 'center' }]}>
					Usuario no encontrado
				</Text>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 10, textAlign: 'center' }]}>
					No se pudo encontrar el usuario destinatario
				</Text>
				<QPButton
					title="Volver"
					onPress={() => navigation.goBack()}
					style={{ marginTop: 30, width: '80%' }}
					textStyle={{ color: theme.colors.buttonText }}
				/>
			</View>
		)
	}

	return (
		<QPKeyboardView
			scrollViewRef={scrollViewRef}
			actionsContainerStyle={{ flexDirection: 'row', gap: 8 }}
			actions={
				<>
					<QPButton
						title=""
						onPress={() => navigation.goBack()}
						disabled={isLoading}
						style={{ width: 56, minHeight: 56, borderRadius: 28, paddingHorizontal: 0, backgroundColor: theme.colors.danger }}
						textStyle={{ color: theme.colors.primaryText }}
						icon="xmark"
						iconColor={theme.colors.primaryText}
						iconStyle="solid"
					/>

					{showPinStep ? (
						<QPButton
							title="Confirmar Envío"
							onPress={executeTransaction}
							loading={isLoading}
							disabled={isLoading || !pin || pin.length < codeLength}
							style={{ flex: 1, minHeight: 56 }}
							textStyle={{ color: theme.colors.buttonText }}
							icon="check"
							iconColor={theme.colors.buttonText}
							iconStyle="solid"
						/>
					) : (
						<QPButton
							title="Continuar"
							onPress={() => { setShowPinStep(true); setPin('') }}
							style={{ flex: 1, minHeight: 56 }}
							textStyle={{ color: theme.colors.buttonText }}
							icon="arrow-right"
							iconColor={theme.colors.buttonText}
							iconStyle="solid"
						/>
					)}
				</>
			}
		>

			<View>

				{/* Amount */}
				<View style={{ alignItems: 'center', paddingVertical: 20 }}>
					<Text style={[textStyles.amount, { fontSize: theme.typography.fontSize.display }]}>
						${send_amount}
					</Text>
				</View>

				{/* Recipient Card */}
				<View style={containerStyles.card}>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 15 }]}>
						Destinatario
					</Text>

					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
						<ProfileContainerHorizontal user={recipientUser} />
					</View>
				</View>

				{/* Message Card */}
				{description && (
					<View style={containerStyles.card}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 10 }]}>
							Mensaje
						</Text>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText, lineHeight: 20 }]}>
							"{description}"
						</Text>
					</View>
				)}

				{/* Transaction Details */}
				<View style={containerStyles.card}>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 15 }]}>
						Detalles de la transacción
					</Text>

					<View style={{ gap: 12 }}>
						<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
								Comisión
							</Text>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>
								$0.00 QUSD
							</Text>
						</View>

						<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
								Total a enviar
							</Text>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
								${send_amount} QUSD
							</Text>
						</View>
					</View>
				</View>

				{/* PIN/OTP Step */}
				{showPinStep && (
					<View style={[containerStyles.card, { marginTop: 0 }]}>

						<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
								{twoFactorMethod === 'pin' ? 'Ingresa tu PIN' : 'Ingresa el código OTP'}
							</Text>
							{twoFactorMethod === 'pin' && (
								<Text
									onPress={handleRequestPin}
									style={[textStyles.h6, { color: theme.colors.primary, opacity: sendingPin ? 0.5 : 1 }]}
									disabled={sendingPin}
								>
									{sendingPin ? 'Enviando...' : 'Solicitar PIN'}
								</Text>
							)}
						</View>

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

						<View style={styles.pinContainer}>
							{Array.from({ length: codeLength }, (_, index) => (
								<TextInput
									key={`${twoFactorMethod}-${index}`}
									ref={(ref) => { pinInputsRef.current[index] = ref }}
									style={[styles.pinInput, codeLength === 6 && styles.pinInputSmall, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText, borderColor: focusedInputIndex === index ? theme.colors.primary : theme.colors.border, borderWidth: 0.5, fontSize: codeLength === 6 ? theme.typography.fontSize.xl : theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.bold }]}
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
	)
}

const styles = StyleSheet.create({
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

export default SendConfirm
