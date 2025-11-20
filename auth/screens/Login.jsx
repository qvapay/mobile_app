import { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, TextInput } from 'react-native'

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

// Notifications
import Toast from 'react-native-toast-message'

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

	// Handle pre-login, we set the loading to true, clear the error and call the login function
	// If login is successful (HTTP response 202), we set the loading to false and show the PIN Input
	// If login is not successful (HTTP response 401), we set the loading to false and show an error message
	const handlePreLogin = async () => {

		if (!email || !password) { Toast.show({ type: 'error', text1: 'Por favor completa todos los campos' }); return }

		try {
			clearError()
			setIsLoading(true)
			const result = await login({ email, password })
			if (!result.success) {
				Toast.show({ type: 'error', text1: result.error })
				if (result.status === 401) { setFailedAttempts(failedAttempts + 1) }
			}
			// Si el prelogin es exitoso (HTTP 202), muestra el PIN Input
			if (result.status === 202) {
				await updateSettings('appearance', { firstTime: false })
				setShowPin(true)
			}
		} catch (error) { Toast.show({ type: 'error', text1: 'Ha ocurrido un error durante el inicio de sesión' }) }
		
		finally { setIsLoading(false) }
	}

	// Send all credentials to login
	const handleLogin = async () => {

		if (!email || !password || !twoFactorCode || twoFactorCode.length !== 4) {
			Toast.show({ type: 'error', text1: 'No es posible iniciar sesión sin completar todos los campos' })
			return
		}

		try {
			clearError()
			setIsLoading(true)
			const result = await login({ email, password, two_factor_code: twoFactorCode })
			if (!result.success) {
				Toast.show({ type: 'error', text1: result.error, text2: result.details })
				if (result.status === 401) {
					console.log('Failed attempts:', failedAttempts)
					setFailedAttempts(failedAttempts + 1)
				}
			}
			if (result.success && result.status === 202) { setFailedAttempts(0) }
		} catch (error) { Toast.show({ type: 'error', text1: 'Ha ocurrido un error durante el inicio de sesión, por favor intenta nuevamente' }) }
		finally { setIsLoading(false) }
	}

	// Send a PIN request to email
	const handleRequestPin = async () => {
		try {
			setRequestingPIN(true)
			const result = await requestPin({ email, password })
			if (!result.success) { Toast.show({ type: 'error', text1: result.error }) }
			if (result.success) {
				setCountdown(60)
				setIsButtonDisabled(true)
				setRequestPINLabel('01:00')
			}
		} catch (error) { Toast.show({ type: 'error', text1: 'Ha ocurrido un error durante la solicitud de PIN, por favor intenta nuevamente' }) }
		finally { setRequestingPIN(false) }
	}

	// Handle restore password
	const handleRestorePassword = () => { navigation.navigate(ROUTES.RECOVER_PASSWORD_SCREEN, { email }) }

	// Handle PIN input change
	const handlePinChange = (text, index) => {
		// Only allow numeric input
		const numericText = text.replace(/[^0-9]/g, '')

		// Update the PIN code
		const newPin = twoFactorCode.split('')
		newPin[index] = numericText
		const updatedPin = newPin.join('')
		setTwoFactorCode(updatedPin)

		// Auto-focus next input if digit entered
		if (numericText && index < 3) { pinInputsRef.current[index + 1]?.focus() }
	}

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
		<KeyboardAvoidingView style={containerStyles.subContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
			<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

					<Text style={textStyles.h1}>Acceder a tu cuenta</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{showPin ? "Coloca tu PIN o 2FA para acceder a tu cuenta" : "Ingresa tu correo electrónico y contraseña para acceder a tu cuenta"}</Text>

					<View style={styles.formContainer}>
						{
							showPin ? (
								<>
									<View style={styles.pinContainer}>
										{[0, 1, 2, 3].map((index) => (
											<TextInput
												key={index}
												ref={(ref) => pinInputsRef.current[index] = ref}
												style={[styles.pinInput, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText }]}
												value={twoFactorCode[index] || ''}
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
									<QPButton
										title={requestPINLabel}
										onPress={handleRequestPin}
										loading={requestingPIN}
										disabled={isButtonDisabled}
										style={{ backgroundColor: null }}
										textStyle={{ color: theme.colors.primary }}
									/>
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
									/>

									<QPInput
										placeholder="Contraseña"
										value={password}
										onChangeText={setPassword}
										secureTextEntry
										prefixIconName="lock"
										suffixIconName="eye"
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

					{failedAttempts > 5 && <Text style={[textStyles.h4, { color: theme.colors.danger, textAlign: 'center' }]}>Demasiados intentos, por favor espera 1 minuto para intentar nuevamente</Text>}

					<View style={containerStyles.bottomButtonContainer}>
						{
							showPin ? (
								<QPButton
									title="Acceder"
									onPress={handleLogin}
									disabled={!email || !password || !twoFactorCode || twoFactorCode.length !== 4 || failedAttempts > 5}
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
					</View>

				</ScrollView>
			</TouchableWithoutFeedback>
		</KeyboardAvoidingView>
	)
}

const styles = StyleSheet.create({
	formContainer: {
		flex: 1,
		marginVertical: 20
	},
	pinContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 20,
		paddingHorizontal: 20,
	},
	pinInput: {
		width: 60,
		height: 60,
		borderRadius: 12,
		fontSize: 24,
		fontWeight: 'bold',
		textAlign: 'center'
	}
})

export default LoginScreen