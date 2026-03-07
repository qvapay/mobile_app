import { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TextInput, Alert, Pressable, ActivityIndicator, Modal } from 'react-native'

// Auth Context
import { useAuth } from '../AuthContext'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'
import QPSwitch from '../../ui/particles/QPSwitch'

// Biometric utilities
import { getSupportedBiometryType, hasBiometricCredentials, getBiometricCredentials, setBiometricCredentials, removeBiometricCredentials } from '../../api/client'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import FaceIDIcon from '../../ui/particles/FaceIDIcon'
import QPKeyboardView from '../../ui/QPKeyboardView'

// Notifications
import { toast } from 'sonner-native'

// Routes
import { ROUTES } from '../../routes'

// Login Screen
const LoginScreen = ({ navigation }) => {

	// Settings Context
	const { updateSettings } = useSettings()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Auth Context
	const { login, requestPin, error, clearError } = useAuth()

	// States
	const [isLoading, setIsLoading] = useState(false)
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [twoFactorCode, setTwoFactorCode] = useState('')
	const [failedAttempts, setFailedAttempts] = useState(0)

	// PIN inputs refs
	const pinInputsRef = useRef([])
	const [focusedInputIndex, setFocusedInputIndex] = useState(null)

	// Show PIN Input
	const [showPin, setShowPin] = useState(false)
	const [requestPINLabel, setRequestPINLabel] = useState('Solicitar PIN')
	const [requestingPIN, setRequestingPIN] = useState(false)

	// OTP/PIN toggle
	const [hasOtp, setHasOtp] = useState(false)
	const [twoFactorMethod, setTwoFactorMethod] = useState('pin') // 'pin' | 'otp'
	const expectedCodeLength = twoFactorMethod === 'otp' ? 6 : 4

	// Biometric states
	const [biometryType, setBiometryType] = useState(null)
	const [hasBiometrics, setHasBiometrics] = useState(false)

	// Leaked password modal states
	const [leakedModal, setLeakedModal] = useState({ visible: false, blocked: false, message: '', count: 0 })

	// Countdown timer states
	const [countdown, setCountdown] = useState(0)
	const [isButtonDisabled, setIsButtonDisabled] = useState(false)
	const countdownRef = useRef(null)

	// Clear failed attempts
	useEffect(() => {
		if (failedAttempts > 5) {
			// If a timer is already running, clear it first
			if (countdownRef.current) { clearTimeout(countdownRef.current) }
			// Set a timer to reset failedAttempts after 1 minute (60000 ms)
			countdownRef.current = setTimeout(() => {
				setFailedAttempts(0)
			}, 60000)
		}
	}, [failedAttempts])

	// Countdown timer effect
	useEffect(() => {
		if (countdown > 0) {
			countdownRef.current = setTimeout(() => { setCountdown(prev => prev - 1) }, 1000)
			// Update button label with formatted time
			const minutes = Math.floor(countdown / 60)
			const seconds = countdown % 60
			const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
			setRequestPINLabel(timeString)
		} else if (countdown === 0 && isButtonDisabled) {
			setIsButtonDisabled(false)
			setRequestPINLabel('Solicitar PIN')
		}
		return () => { if (countdownRef.current) { clearTimeout(countdownRef.current) } }
	}, [countdown, isButtonDisabled])

	// Reset PIN/OTP inputs when switching method
	const resetPinInputs = () => {
		setTwoFactorCode('')
		setFocusedInputIndex(null)
		pinInputsRef.current = []
	}

	const handleMethodToggle = (side) => {
		const newMethod = side === 'left' ? 'pin' : side === 'right' ? 'otp' : 'pin'
		if (newMethod !== twoFactorMethod) {
			setTwoFactorMethod(newMethod)
			resetPinInputs()
		}
	}

	// Detect biometric support on mount
	useEffect(() => {
		const checkBiometrics = async () => {
			try {
				const type = await getSupportedBiometryType()
				const has = await hasBiometricCredentials()
				setBiometryType(type)
				setHasBiometrics(has)
			} catch (error) {
				// Biometric detection failed silently
			}
		}
		checkBiometrics()
	}, [])

	// Biometric login handler
	const handleBiometricLogin = async () => {

		try {

			const credentials = await getBiometricCredentials()
			if (!credentials) return // user cancelled

			setIsLoading(true)
			clearError()
			const result = await login({ email: credentials.email, password: credentials.password })

			if (!result.success) {
				if (result.status === 403 && result.action === 'reset_password') {
					setLeakedModal({ visible: true, blocked: true, message: result.error, count: 0 })
				} else if (result.status === 401) {
					await removeBiometricCredentials()
					setHasBiometrics(false)
					await updateSettings('security', { biometricsEnabled: false })
					toast.error('Credenciales inválidas', { description: 'Inicia sesión manualmente' })
				} else { toast.error(result.error) }
			}

			// If login is successful and there is a security warning, show the leaked password modal
			if (result.success && result.security_warning) { setLeakedModal({ visible: true, blocked: false, message: result.security_warning.message, count: result.security_warning.count }) }

			if (result.status === 202) {
				setEmail(credentials.email)
				setPassword(credentials.password)
				setHasOtp(result.has_otp || false)
				setTwoFactorMethod('pin')
				await updateSettings('appearance', { firstTime: false })
				setShowPin(true)
			}
		} catch (error) {
			toast.error('Error al acceder con biometría')
		} finally { setIsLoading(false) }
	}

	// Prompt biometric enrollment after successful login
	const promptBiometricEnrollment = async (loginEmail, loginPassword) => {
		const type = await getSupportedBiometryType()
		if (!type) return
		const has = await hasBiometricCredentials()
		if (has) return

		const biometricLabel = type === 'FaceID' ? 'Face ID' : type === 'TouchID' ? 'Touch ID' : 'Huella Digital'
		Alert.alert(
			`Activar ${biometricLabel}`,
			`¿Deseas usar ${biometricLabel} para acceder a tu cuenta en el futuro?`,
			[
				{ text: 'Ahora no', style: 'cancel' },
				{
					text: 'Activar',
					onPress: async () => {
						const saved = await setBiometricCredentials(loginEmail, loginPassword)
						if (saved) {
							await updateSettings('security', { biometricsEnabled: true })
							toast.success(`${biometricLabel} activado`)
						}
					}
				}
			]
		)
	}

	// Handle pre-login, we set the loading to true, clear the error and call the login function
	// If login is successful (HTTP response 202), we set the loading to false and show the PIN Input
	// If login is not successful (HTTP response 401), we set the loading to false and show an error message
	const handlePreLogin = async () => {

		if (!email || !password) { toast.error('Por favor completa todos los campos'); return }

		try {
			clearError()
			setIsLoading(true)
			const result = await login({ email, password })
			if (!result.success) {
				// Contraseña comprometida — bloqueado (403 + action: reset_password)
				if (result.status === 403 && result.action === 'reset_password') {
					setLeakedModal({ visible: true, blocked: true, message: result.error, count: 0 })
				} else {
					toast.error(result.error)
				}
				if (result.status === 401) { setFailedAttempts(failedAttempts + 1) }
			}
			// Si el prelogin es exitoso (HTTP 202), muestra el PIN Input
			if (result.status === 202) {
				setHasOtp(result.has_otp || false)
				setTwoFactorMethod('pin')
				await updateSettings('appearance', { firstTime: false })
				setShowPin(true)
			}
			// Login directo exitoso (sin 2FA) — ofrecer biometría y verificar security_warning
			if (result.success && result.status !== 202) {
				if (result.security_warning) {
					setLeakedModal({ visible: true, blocked: false, message: result.security_warning.message, count: result.security_warning.count })
				} else {
					promptBiometricEnrollment(email, password)
				}
			}
		} catch (error) { toast.error('Ha ocurrido un error durante el inicio de sesión') }

		finally { setIsLoading(false) }
	}

	// Send all credentials to login
	const handleLogin = async () => {

		if (!email || !password || !twoFactorCode || twoFactorCode.length !== expectedCodeLength) {
			toast.error('No es posible iniciar sesión sin completar todos los campos')
			return
		}

		try {
			clearError()
			setIsLoading(true)
			const result = await login({ email, password, two_factor_code: twoFactorCode })
			if (!result.success) {
				if (result.status === 403 && result.action === 'reset_password') {
					setLeakedModal({ visible: true, blocked: true, message: result.error, count: 0 })
				} else {
					toast.error(result.error, { description: result.details })
				}
				if (result.status === 401) {
					setFailedAttempts(failedAttempts + 1)
				}
			}
			if (result.success) {
				setFailedAttempts(0)
				if (result.security_warning) {
					setLeakedModal({ visible: true, blocked: false, message: result.security_warning.message, count: result.security_warning.count })
				} else {
					promptBiometricEnrollment(email, password)
				}
			}
		} catch (error) { toast.error('Ha ocurrido un error durante el inicio de sesión, por favor intenta nuevamente') }
		finally { setIsLoading(false) }
	}

	// Send a PIN request to email
	const handleRequestPin = async () => {
		try {
			setRequestingPIN(true)
			const result = await requestPin({ email, password })
			if (!result.success) { toast.error(result.error) }
			if (result.success) {
				setCountdown(60)
				setIsButtonDisabled(true)
				setRequestPINLabel('01:00')
			}
		} catch (error) { toast.error('Ha ocurrido un error durante la solicitud de PIN, por favor intenta nuevamente') }
		finally { setRequestingPIN(false) }
	}

	// Handle restore password
	const handleRestorePassword = () => { navigation.navigate(ROUTES.RECOVER_PASSWORD_SCREEN, { email }) }

	// Dismiss leaked password modal
	const dismissLeakedModal = () => {
		const wasBlocked = leakedModal.blocked
		setLeakedModal({ visible: false, blocked: false, message: '', count: 0 })
		if (!wasBlocked) { promptBiometricEnrollment(email, password) }
	}

	// Handle PIN input change (supports paste of full code)
	const handlePinChange = (text, index) => {
		const numericText = text.replace(/[^0-9]/g, '')

		// Paste: multiple digits received at once
		if (numericText.length > 1) {
			const digits = numericText.slice(0, expectedCodeLength).split('')
			const newPin = twoFactorCode.split('')
			digits.forEach((d, i) => { if (index + i < expectedCodeLength) newPin[index + i] = d })
			setTwoFactorCode(newPin.join(''))
			const focusIdx = Math.min(index + digits.length, expectedCodeLength - 1)
			pinInputsRef.current[focusIdx]?.focus()
			return
		}

		// Single digit
		const newPin = twoFactorCode.split('')
		newPin[index] = numericText
		setTwoFactorCode(newPin.join(''))

		if (numericText && index < expectedCodeLength - 1) { pinInputsRef.current[index + 1]?.focus() }
	}

	// Auto-submit when all digits entered
	useEffect(() => {
		if (showPin && twoFactorCode.length === expectedCodeLength && !isLoading) { handleLogin() }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [twoFactorCode])

	// Handle PIN input focus
	const handlePinFocus = (index) => { setFocusedInputIndex(index) }

	// Handle PIN input blur
	const handlePinBlur = () => { setFocusedInputIndex(null) }

	// Handle PIN backspace
	const handlePinKeyPress = (e, index) => {
		if (e.nativeEvent.key === 'Backspace') {
			if (twoFactorCode[index]) {
				// If current input has content, clear it
				const newPin = twoFactorCode.split('')
				newPin[index] = ''
				setTwoFactorCode(newPin.join(''))
			} else if (index > 0) {
				// If current input is empty, go to previous input and clear it
				const newPin = twoFactorCode.split('')
				newPin[index - 1] = ''
				setTwoFactorCode(newPin.join(''))
				pinInputsRef.current[index - 1]?.focus()
			}
		}
	}

	return (
		<>
			<QPKeyboardView
				actions={
					showPin ? (
						<QPButton
							title="Acceder"
							onPress={handleLogin}
							disabled={!email || !password || !twoFactorCode || twoFactorCode.length !== expectedCodeLength || failedAttempts > 5}
							textStyle={{ color: theme.colors.almostWhite }}
							loading={isLoading}
						/>
					) : (
						<QPButton
							title="Acceder"
							onPress={handlePreLogin}
							disabled={!email || !password || failedAttempts > 5}
							textStyle={{ color: theme.colors.almostWhite }}
							loading={isLoading}
						/>
					)
				}
			>

				<Text style={textStyles.h1}>Acceder a tu cuenta</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{showPin ? (twoFactorMethod === 'otp' ? "Ingresa el código de tu aplicación de autenticación" : "Coloca tu PIN para acceder a tu cuenta") : "Ingresa tu correo electrónico y contraseña para acceder a tu cuenta"}</Text>

				<View style={styles.formContainer}>
					{
						showPin ? (
							<>
								{hasOtp && (
									<QPSwitch
										value={twoFactorMethod === 'pin' ? 'left' : twoFactorMethod === 'otp' ? 'right' : null}
										leftText="PIN"
										rightText="OTP"
										leftColor={theme.colors.primary}
										rightColor={theme.colors.primary}
										onChange={handleMethodToggle}
										style={{ marginBottom: 20 }}
									/>
								)}
								<View style={styles.pinContainer}>
									{Array.from({ length: expectedCodeLength }).map((_, index) => (
										<TextInput
											key={`${twoFactorMethod}-${index}`}
											ref={(ref) => pinInputsRef.current[index] = ref}
											style={[twoFactorMethod === 'otp' ? styles.pinInputSmall : styles.pinInput, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText, fontSize: twoFactorMethod === 'otp' ? theme.typography.fontSize.xl : theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.bold }]}
											value={twoFactorCode[index] || ''}
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
								{twoFactorMethod === 'pin' && (
									<QPButton
										title={requestPINLabel}
										onPress={handleRequestPin}
										loading={requestingPIN}
										disabled={isButtonDisabled}
										style={{ backgroundColor: null }}
										textStyle={{ color: theme.colors.primary }}
									/>
								)}
							</>
						) : (
							<>
								<QPInput
									placeholder="tucorreo@gmail.com"
									value={email}
									onChangeText={setEmail}
									keyboardType="email-address"
									autoCapitalize="none"
									prefixIconName="envelope"
									textContentType="emailAddress"
									autoComplete="email"
								/>

								<QPInput
									placeholder="Contraseña"
									value={password}
									onChangeText={setPassword}
									secureTextEntry
									prefixIconName="lock"
									suffixIconName="eye"
									textContentType="password"
									autoComplete="password"
								/>

								<QPButton
									title="Restablecer contraseña"
									style={{ backgroundColor: null }}
									textStyle={{ color: theme.colors.primary }}
									onPress={handleRestorePassword}
								/>
							</>
						)
					}
				</View>

				{!showPin && hasBiometrics && biometryType && (
					<Pressable
						onPress={handleBiometricLogin}
						disabled={isLoading}
						style={({ pressed }) => [
							styles.biometricButton,
							{ backgroundColor: theme.colors.surface, opacity: pressed ? 0.7 : isLoading ? 0.5 : 1 }
						]}
					>
						{isLoading ? (
							<ActivityIndicator size="small" color={theme.colors.primary} />
						) : biometryType === 'FaceID' ? (
							<FaceIDIcon size={30} color={theme.colors.primary} />
						) : (
							<FontAwesome6 name="fingerprint" size={28} color={theme.colors.primary} iconStyle="solid" />
						)}
					</Pressable>
				)}

				{failedAttempts > 5 && <Text style={[textStyles.h4, { color: theme.colors.danger, textAlign: 'center' }]}>Demasiados intentos, por favor espera 1 minuto para intentar nuevamente</Text>}

			</QPKeyboardView>

			{/* Leaked Password Modal */}
			<Modal visible={leakedModal.visible} transparent animationType="fade" onRequestClose={leakedModal.blocked ? undefined : dismissLeakedModal}>
				<View style={styles.modalOverlay}>
					<View style={[styles.leakedModalContainer, { backgroundColor: theme.colors.surface }]}>
						<FontAwesome6 name="shield-halved" size={40} color={leakedModal.blocked ? theme.colors.danger : theme.colors.warning} iconStyle="solid" style={{ alignSelf: 'center', marginBottom: 16 }} />
						<Text style={[textStyles.h3, { textAlign: 'center', marginBottom: 8 }]}>
							{leakedModal.blocked ? 'Contraseña Comprometida' : 'Alerta de Seguridad'}
						</Text>
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 8 }]}>
							{leakedModal.message}
						</Text>
						{leakedModal.count > 0 && (
							<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textAlign: 'center', marginBottom: 16 }]}>
								Esta contraseña ha sido vista en {leakedModal.count.toLocaleString()} filtración{leakedModal.count > 1 ? 'es' : ''} de datos.
							</Text>
						)}
						<QPButton
							title={leakedModal.blocked ? 'Restablecer Contraseña' : 'Cambiar contraseña'}
							onPress={() => {
								setLeakedModal({ visible: false, blocked: false, message: '', count: 0 })
								navigation.navigate(ROUTES.RECOVER_PASSWORD_SCREEN, { email })
							}}
							style={{ backgroundColor: leakedModal.blocked ? theme.colors.danger : theme.colors.primary, marginBottom: 8 }}
							textStyle={{ color: theme.colors.almostWhite }}
						/>
						{!leakedModal.blocked && (
							<QPButton
								title="Ahora no"
								onPress={dismissLeakedModal}
								style={{ backgroundColor: 'transparent' }}
								textStyle={{ color: theme.colors.secondaryText }}
							/>
						)}
					</View>
				</View>
			</Modal>
		</>
	)
}

const styles = StyleSheet.create({
	formContainer: {
		flex: 1,
		marginVertical: 20
	},
	pinContainer: {
		flexDirection: 'row',
		gap: 8,
		marginBottom: 20,
	},
	pinInput: {
		flex: 1,
		height: 60,
		borderRadius: 12,
		textAlign: 'center'
	},
	pinInputSmall: {
		flex: 1,
		height: 46,
		borderRadius: 10,
		textAlign: 'center'
	},
	biometricButton: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: 'center',
		justifyContent: 'center',
		alignSelf: 'center',
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	leakedModalContainer: {
		width: '100%',
		borderRadius: 16,
		padding: 24,
	}
})

export default LoginScreen
