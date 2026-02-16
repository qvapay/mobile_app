import { useState, useRef } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'
import ProfileContainerHorizontal from '../../ui/ProfileContainerHorizontal'

// API
import { userApi } from '../../api/userApi'
import { transferApi } from '../../api/transferApi'
import { withdrawApi } from '../../api/withdrawApi'

// Routes
import { ROUTES } from '../../routes'

// Toast
import Toast from 'react-native-toast-message'

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
	const insets = useSafeAreaInsets()

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
					Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo encontrar el usuario destinatario' })
					navigation.goBack()
				}
			} catch (error) {
				Toast.show({ type: 'error', text1: 'Error', text2: 'Error al cargar los datos del destinatario' })
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
				Toast.show({ type: 'success', text1: 'PIN enviado', text2: 'Revisa tu correo electrónico' })
			} else {
				Toast.show({ type: 'error', text1: result.error || 'No se pudo enviar el PIN' })
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error al solicitar el PIN' })
		} finally { setSendingPin(false) }
	}

	// Switch between PIN and OTP
	const handleMethodChange = (method) => {
		setTwoFactorMethod(method)
		setPin('')
		pinInputsRef.current = new Array(method === 'pin' ? 4 : 6).fill(null)
		setTimeout(() => { pinInputsRef.current[0]?.focus() }, 0)
	}

	// Handle PIN input change
	const handlePinChange = (text, index) => {
		const numericText = text.replace(/[^0-9]/g, '')
		const newPin = pin.split('')
		newPin[index] = numericText
		const updatedPin = newPin.join('')
		setPin(updatedPin)
		if (numericText && index < codeLength - 1) { pinInputsRef.current[index + 1]?.focus() }
	}

	// Handle PIN input focus/blur
	const handlePinFocus = (index) => { setFocusedInputIndex(index) }
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
			Toast.show({ type: 'error', text1: twoFactorMethod === 'pin' ? 'Ingresa un PIN de 4 dígitos' : 'Ingresa un código OTP de 6 dígitos' })
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
				Toast.show({ type: 'error', text1: 'Error en la transacción', text2: result.error || 'No se pudo completar la transacción' })
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error', text2: error.message || 'Error inesperado al procesar la transacción' })
		} finally { setIsLoading(false) }
	}

	// Show loading while fetching user data
	if (isLoadingUser) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

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
		<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>

			<ScrollView style={{ flex: 1, gap: 10, paddingTop: 10 }} showsVerticalScrollIndicator={false}>

				{/* Amount Card */}
				<View style={containerStyles.card}>
					<View style={{ alignItems: 'center' }}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 8 }]}>
							Monto a enviar
						</Text>
						<Text style={textStyles.amount}>
							${send_amount}
						</Text>
						<Text style={[textStyles.h6, { color: theme.colors.primary, marginTop: 4 }]}>
							QUSD
						</Text>
					</View>
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
					<View style={{ marginTop: 10 }}>

						{/* PIN/OTP Toggle - only show if user has OTP */}
						{hasOTP && (
							<View style={[styles.methodToggle, { borderColor: theme.colors.elevation }]}>
								<Pressable
									onPress={() => handleMethodChange('pin')}
									style={[styles.methodToggleButton, styles.methodToggleLeft, twoFactorMethod === 'pin' && { backgroundColor: theme.colors.primary }]}
								>
									<Text style={[textStyles.h6, { color: twoFactorMethod === 'pin' ? theme.colors.buttonText : theme.colors.secondaryText, fontWeight: '600' }]}>PIN</Text>
								</Pressable>
								<Pressable
									onPress={() => handleMethodChange('otp')}
									style={[styles.methodToggleButton, styles.methodToggleRight, { borderLeftWidth: 1, borderLeftColor: theme.colors.elevation }, twoFactorMethod === 'otp' && { backgroundColor: theme.colors.primary }]}
								>
									<Text style={[textStyles.h6, { color: twoFactorMethod === 'otp' ? theme.colors.buttonText : theme.colors.secondaryText, fontWeight: '600' }]}>OTP</Text>
								</Pressable>
							</View>
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

				{/* Security Notice */}
				<View style={{
					backgroundColor: theme.colors.elevation,
					borderRadius: 12,
					padding: 16,
					marginTop: 10,
					marginBottom: 20,
					borderLeftWidth: 4,
					borderLeftColor: theme.colors.primary
				}}>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
						<FontAwesome6 name="shield-halved" size={20} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.h6, { color: theme.colors.primaryText, flex: 1 }]}>
							Esta transacción es segura y será procesada inmediatamente
						</Text>
					</View>
				</View>

			</ScrollView>

			{/* Action Buttons - Outside ScrollView */}
			<View style={[containerStyles.bottomButtonContainer, { paddingBottom: insets.bottom + 16 }]}>
				{showPinStep ? (
					<QPButton
						title="Confirmar Envío"
						onPress={executeTransaction}
						loading={isLoading}
						disabled={isLoading || !pin || pin.length < codeLength}
						textStyle={{ color: theme.colors.buttonText }}
					/>
				) : (
					<QPButton
						title="Continuar"
						onPress={() => { setShowPinStep(true); setPin('') }}
						textStyle={{ color: theme.colors.buttonText }}
					/>
				)}

				<QPButton
					title="Cancelar"
					onPress={() => navigation.goBack()}
					disabled={isLoading}
					style={{ backgroundColor: theme.colors.danger }}
					textStyle={{ color: theme.colors.primaryText }}
				/>
			</View>

		</View>
	)
}

const styles = StyleSheet.create({
	methodToggle: {
		flexDirection: 'row',
		borderRadius: 10,
		borderWidth: 1,
		overflow: 'hidden',
	},
	methodToggleButton: {
		flex: 1,
		paddingVertical: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	methodToggleLeft: {
		borderTopLeftRadius: 9,
		borderBottomLeftRadius: 9,
	},
	methodToggleRight: {
		borderTopRightRadius: 9,
		borderBottomRightRadius: 9,
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
		justifyContent: 'space-between',
		marginVertical: 20,
		paddingHorizontal: 20,
		gap: 8,
	},
	pinInput: {
		flex: 1,
		height: 60,
		borderRadius: 12,
		borderWidth: 1,
		fontSize: 24,
		fontWeight: 'bold',
		textAlign: 'center',
	},
	pinInputSmall: {
		height: 54,
		borderRadius: 10,
		fontSize: 20,
	},
})

export default SendConfirm
