import { useReducer, useState, useEffect, useRef } from 'react'
import { View, Text, Alert } from 'react-native'

// Auth Context
import { useAuth } from '../AuthContext'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPKeyboardView from '../../ui/QPKeyboardView'

// Login subcomponents + hooks
import CredentialsForm from './login/CredentialsForm'
import TwoFactorEntry from './login/TwoFactorEntry'
import QuickLoginRow from './login/QuickLoginRow'
import LeakedPasswordModal from './login/LeakedPasswordModal'
import useBiometricSupport from '../hooks/useBiometricSupport'

// Biometric utilities
import { getSupportedBiometryType, hasBiometricCredentials, getBiometricCredentials, setBiometricCredentials, removeBiometricCredentials } from '../../api/client'

// Notifications
import { toast } from 'sonner-native'

// Routes
import { ROUTES } from '../../routes'

// The login screen is a small state machine (enter credentials → enter 2FA → done).
// Grouping those fields in one reducer keeps the multi-field transitions atomic —
// e.g. moving to the 2FA step flips showPin, hasOtp, method and clears the code together.
const initialForm = { email: '', password: '', showPin: false, hasOtp: false, method: 'pin', code: '' }

function formReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		case 'setMethod':
			// Switching method resets the entered code
			return { ...state, method: action.method, code: '' }
		case 'enterTwoFactor':
			return { ...state, showPin: true, hasOtp: action.hasOtp, method: 'pin', code: '' }
		case 'enterTwoFactorWithCreds':
			return { ...state, email: action.email, password: action.password, showPin: true, hasOtp: action.hasOtp, method: 'pin', code: '' }
		default:
			return state
	}
}

// Login Screen
const LoginScreen = ({ navigation }) => {

	// Settings Context
	const { updateSettings } = useSettings()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Auth Context
	const { login, loginWithPasskey, requestPin, clearError } = useAuth()

	// Login flow state machine
	const [form, dispatch] = useReducer(formReducer, initialForm)
	const expectedCodeLength = form.method === 'otp' ? 6 : 4

	// Independent state slices
	const [isLoading, setIsLoading] = useState(false)
	const [failedAttempts, setFailedAttempts] = useState(0)
	const [leakedModal, setLeakedModal] = useState({ visible: false, blocked: false, message: '', count: 0 })

	// Biometric support detection
	const { biometryType, hasBiometrics, setHasBiometrics } = useBiometricSupport()

	// Reset failed attempts after a 1-minute lockout
	const failedAttemptsTimerRef = useRef(null)
	useEffect(() => {
		if (failedAttempts > 5) {
			if (failedAttemptsTimerRef.current) { clearTimeout(failedAttemptsTimerRef.current) }
			failedAttemptsTimerRef.current = setTimeout(() => { setFailedAttempts(0) }, 60000)
		}
		return () => { if (failedAttemptsTimerRef.current) { clearTimeout(failedAttemptsTimerRef.current) } }
	}, [failedAttempts])

	const handleMethodToggle = (side) => {
		const newMethod = side === 'left' ? 'pin' : side === 'right' ? 'otp' : 'pin'
		if (newMethod !== form.method) { dispatch({ type: 'setMethod', method: newMethod }) }
	}

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
				} else { toast.error(String(result.error || 'Error al iniciar sesión')) }
			}

			// If login is successful and there is a security warning, show the leaked password modal
			if (result.success && result.security_warning) { setLeakedModal({ visible: true, blocked: false, message: result.security_warning.message, count: result.security_warning.count }) }

			if (result.status === 202) {
				await updateSettings('appearance', { firstTime: false })
				dispatch({ type: 'enterTwoFactorWithCreds', email: credentials.email, password: credentials.password, hasOtp: result.has_otp || false })
			}
		} catch (err) {
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

	// Handle pre-login: validate credentials, then either show the PIN step (202) or finish.
	const handlePreLogin = async () => {
		if (!form.email || !form.password) { toast.error('Por favor completa todos los campos'); return }

		try {
			clearError()
			setIsLoading(true)
			const result = await login({ email: form.email, password: form.password })
			if (!result.success) {
				// Contraseña comprometida — bloqueado (403 + action: reset_password)
				if (result.status === 403 && result.action === 'reset_password') {
					setLeakedModal({ visible: true, blocked: true, message: result.error, count: 0 })
				} else {
					toast.error(String(result.error || 'Error al iniciar sesión'))
				}
				if (result.status === 401) { setFailedAttempts(failedAttempts + 1) }
			}
			// Si el prelogin es exitoso (HTTP 202), muestra el PIN Input
			if (result.status === 202) {
				await updateSettings('appearance', { firstTime: false })
				dispatch({ type: 'enterTwoFactor', hasOtp: result.has_otp || false })
			}
			// Login directo exitoso (sin 2FA) — ofrecer biometría y verificar security_warning
			if (result.success && result.status !== 202) {
				if (result.security_warning) {
					setLeakedModal({ visible: true, blocked: false, message: result.security_warning.message, count: result.security_warning.count })
				} else {
					promptBiometricEnrollment(form.email, form.password)
				}
			}
		} catch (err) { toast.error('Ha ocurrido un error durante el inicio de sesión') }
		finally { setIsLoading(false) }
	}

	// Send all credentials (+ 2FA code) to login
	const handleLogin = async () => {
		if (!form.email || !form.password || !form.code || form.code.length !== expectedCodeLength) {
			toast.error('No es posible iniciar sesión sin completar todos los campos')
			return
		}

		try {
			clearError()
			setIsLoading(true)
			const result = await login({ email: form.email, password: form.password, two_factor_code: form.code })
			if (!result.success) {
				if (result.status === 403 && result.action === 'reset_password') {
					setLeakedModal({ visible: true, blocked: true, message: result.error, count: 0 })
				} else { toast.error(String(result.error || 'Error al iniciar sesión'), { description: typeof result.details === 'string' ? result.details : undefined }) }
				if (result.status === 401) { setFailedAttempts(failedAttempts + 1) }
			}
			if (result.success) {
				setFailedAttempts(0)
				if (result.security_warning) {
					setLeakedModal({ visible: true, blocked: false, message: result.security_warning.message, count: result.security_warning.count })
				} else {
					promptBiometricEnrollment(form.email, form.password)
				}
			}
		} catch (err) { toast.error('Ha ocurrido un error durante el inicio de sesión, por favor intenta nuevamente') }
		finally { setIsLoading(false) }
	}

	// Send a PIN request to email — returns the result so TwoFactorEntry can start its cooldown
	const handleRequestPin = async () => {
		try {
			const result = await requestPin({ email: form.email, password: form.password })
			if (!result.success) { toast.error(String(result.error || 'Error al solicitar PIN')) }
			return result
		} catch (err) {
			toast.error('Ha ocurrido un error durante la solicitud de PIN, por favor intenta nuevamente')
			return { success: false }
		}
	}

	// Handle passkey login
	const handlePasskeyLogin = async () => {
		try {
			setIsLoading(true)
			clearError()
			const result = await loginWithPasskey()
			if (!result.success && result.error) {
				toast.error(String(result.error))
			}
		} catch (err) {
			toast.error('Error al iniciar con Passkey')
		} finally { setIsLoading(false) }
	}

	// Handle restore password
	const handleRestorePassword = () => { navigation.navigate(ROUTES.RECOVER_PASSWORD_SCREEN, { email: form.email }) }

	// Dismiss leaked password modal
	const dismissLeakedModal = () => {
		const wasBlocked = leakedModal.blocked
		setLeakedModal({ visible: false, blocked: false, message: '', count: 0 })
		if (!wasBlocked) { promptBiometricEnrollment(form.email, form.password) }
	}

	// Reset password from the leaked modal
	const resetFromLeakedModal = () => {
		setLeakedModal({ visible: false, blocked: false, message: '', count: 0 })
		navigation.navigate(ROUTES.RECOVER_PASSWORD_SCREEN, { email: form.email })
	}

	// Auto-submit when all digits entered
	useEffect(() => {
		if (form.showPin && form.code.length === expectedCodeLength && !isLoading) { handleLogin() }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [form.code])

	return (
		<>
			<QPKeyboardView
				actions={
					form.showPin ? (
						<QPButton
							title="Acceder"
							onPress={handleLogin}
							disabled={!form.email || !form.password || form.code.length !== expectedCodeLength || failedAttempts > 5}
							textStyle={{ color: theme.colors.almostWhite }}
							loading={isLoading}
						/>
					) : (
						<QPButton
							title="Acceder"
							onPress={handlePreLogin}
							disabled={!form.email || !form.password || failedAttempts > 5}
							textStyle={{ color: theme.colors.almostWhite }}
							loading={isLoading}
						/>
					)
				}
			>

				<Text style={textStyles.h1}>Acceder a tu cuenta</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{form.showPin ? (form.method === 'otp' ? "Ingresa el código de tu aplicación de autenticación" : "Coloca tu PIN para acceder a tu cuenta") : "Ingresa tu correo electrónico y contraseña para acceder a tu cuenta"}</Text>

				<View style={{ flex: 1, marginVertical: 20 }}>
					{form.showPin ? (
						<TwoFactorEntry
							method={form.method}
							expectedCodeLength={expectedCodeLength}
							code={form.code}
							onChangeCode={(value) => dispatch({ type: 'set', field: 'code', value })}
							hasOtp={form.hasOtp}
							onMethodToggle={handleMethodToggle}
							onRequestPin={handleRequestPin}
							theme={theme}
						/>
					) : (
						<CredentialsForm
							email={form.email}
							password={form.password}
							onChangeEmail={(value) => dispatch({ type: 'set', field: 'email', value })}
							onChangePassword={(value) => dispatch({ type: 'set', field: 'password', value })}
							onRestorePassword={handleRestorePassword}
							theme={theme}
						/>
					)}
				</View>

				{!form.showPin && (
					<QuickLoginRow
						hasBiometrics={hasBiometrics}
						biometryType={biometryType}
						isLoading={isLoading}
						onBiometricLogin={handleBiometricLogin}
						onPasskeyLogin={handlePasskeyLogin}
						theme={theme}
					/>
				)}

				{failedAttempts > 5 && <Text style={[textStyles.h4, { color: theme.colors.danger, textAlign: 'center' }]}>Demasiados intentos, por favor espera 1 minuto para intentar nuevamente</Text>}

			</QPKeyboardView>

			<LeakedPasswordModal
				state={leakedModal}
				theme={theme}
				onReset={resetFromLeakedModal}
				onDismiss={dismissLeakedModal}
			/>
		</>
	)
}

export default LoginScreen
