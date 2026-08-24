import { View, Text, Alert } from 'react-native'
import { useReducer, useState, useEffect, useEffectEvent, useRef } from 'react'
import { useTranslation } from 'react-i18next'

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

/**
 * Login screen: credentials → optional 2FA step (emailed PIN or 6-digit TOTP) → session.
 * Drives `POST /auth/login` through AuthContext — a 202 response opens the 2FA step
 * (`requestPin` re-sends the email PIN). Also supports passkey login and biometric
 * quick login with credentials from Keychain `com.qvapay.biometrics`; enrollment is
 * offered after a successful manual login.
 * Client-side throttle mirrors the backend: 60s lockout after 5 failed attempts.
 * HIBP leaked-password results (warning or forced reset) surface in LeakedPasswordModal.
 */
const LoginScreen = ({ navigation }) => {

	// Idioma activo
	const { t } = useTranslation()

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
					toast.error(t('auth.login.toasts.invalidCredentials'), { description: t('auth.login.toasts.loginManually') })
				} else { toast.error(String(result.error || t('auth.login.toasts.loginError'))) }
			}

			// If login is successful and there is a security warning, show the leaked password modal
			if (result.success && result.security_warning) { setLeakedModal({ visible: true, blocked: false, message: result.security_warning.message, count: result.security_warning.count }) }

			if (result.status === 202) {
				await updateSettings('appearance', { firstTime: false })
				dispatch({ type: 'enterTwoFactorWithCreds', email: credentials.email, password: credentials.password, hasOtp: result.has_otp || false })
			}
		} catch (err) {
			toast.error(t('auth.login.toasts.biometricError'))
		} finally { setIsLoading(false) }
	}

	// Prompt biometric enrollment after successful login
	const promptBiometricEnrollment = async (loginEmail, loginPassword) => {

		const type = await getSupportedBiometryType()
		if (!type) return
		const has = await hasBiometricCredentials()
		if (has) return

		// 'Face ID' / 'Touch ID' son marcas y no se traducen; solo la huella es clave
		const biometricLabel = type === 'FaceID' ? 'Face ID' : type === 'TouchID' ? 'Touch ID' : t('auth.login.biometrics.fingerprint')
		Alert.alert(
			t('auth.login.alerts.enableBiometric.title', { label: biometricLabel }),
			t('auth.login.alerts.enableBiometric.body', { label: biometricLabel }),
			[
				{ text: t('common.actions.notNow'), style: 'cancel' },
				{
					text: t('auth.login.alerts.enableBiometric.confirm'),
					onPress: async () => {
						const saved = await setBiometricCredentials(loginEmail, loginPassword)
						if (saved) {
							await updateSettings('security', { biometricsEnabled: true })
							toast.success(t('auth.login.toasts.biometricEnabled', { label: biometricLabel }))
						}
					}
				}
			]
		)
	}

	// Handle pre-login: validate credentials, then either show the PIN step (202) or finish.
	const handlePreLogin = async () => {
		if (!form.email || !form.password) { toast.error(t('auth.login.toasts.completeAllFields')); return }

		try {
			clearError()
			setIsLoading(true)
			const result = await login({ email: form.email, password: form.password })
			if (!result.success) {
				// Contraseña comprometida — bloqueado (403 + action: reset_password)
				if (result.status === 403 && result.action === 'reset_password') {
					setLeakedModal({ visible: true, blocked: true, message: result.error, count: 0 })
				} else {
					toast.error(String(result.error || t('auth.login.toasts.loginError')))
				}
				if (result.status === 401) { setFailedAttempts(prev => prev + 1) }
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
		} catch (err) { toast.error(t('auth.login.toasts.loginUnexpectedError')) }
		finally { setIsLoading(false) }
	}

	// Send all credentials (+ 2FA code) to login
	const handleLogin = async () => {
		if (!form.email || !form.password || !form.code || form.code.length !== expectedCodeLength) {
			toast.error(t('auth.login.toasts.completeAllFields2fa'))
			return
		}

		try {
			clearError()
			setIsLoading(true)
			const result = await login({ email: form.email, password: form.password, two_factor_code: form.code })
			if (!result.success) {
				if (result.status === 403 && result.action === 'reset_password') {
					setLeakedModal({ visible: true, blocked: true, message: result.error, count: 0 })
				} else { toast.error(String(result.error || t('auth.login.toasts.loginError')), { description: typeof result.details === 'string' ? result.details : undefined }) }
				if (result.status === 401) { setFailedAttempts(prev => prev + 1) }
			}
			if (result.success) {
				setFailedAttempts(0)
				if (result.security_warning) {
					setLeakedModal({ visible: true, blocked: false, message: result.security_warning.message, count: result.security_warning.count })
				} else {
					promptBiometricEnrollment(form.email, form.password)
				}
			}
		} catch (err) { toast.error(t('auth.login.toasts.loginUnexpectedErrorRetry')) }
		finally { setIsLoading(false) }
	}

	// Send a PIN request to email — returns the result so TwoFactorEntry can start its cooldown
	const handleRequestPin = async () => {
		try {
			const result = await requestPin({ email: form.email, password: form.password })
			if (!result.success) { toast.error(String(result.error || t('auth.login.toasts.requestPinError'))) }
			return result
		} catch (err) {
			toast.error(t('auth.login.toasts.requestPinUnexpectedError'))
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
			toast.error(t('auth.login.toasts.passkeyError'))
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

	// Auto-submit when all digits entered (Effect Event: reads the latest
	// handler/flags without re-running the effect on every state change)
	const onCodeComplete = useEffectEvent(() => { if (form.showPin && form.code.length === expectedCodeLength && !isLoading) { handleLogin() } })
	useEffect(() => { onCodeComplete() }, [form.code])

	return (
		<>
			<QPKeyboardView
				actions={
					form.showPin ? (
						<QPButton
							title={t('auth.login.submit')}
							onPress={handleLogin}
							disabled={!form.email || !form.password || form.code.length !== expectedCodeLength || failedAttempts > 5}
							textStyle={{ color: theme.colors.almostWhite }}
							loading={isLoading}
						/>
					) : (
						<QPButton
							title={t('auth.login.submit')}
							onPress={handlePreLogin}
							disabled={!form.email || !form.password || failedAttempts > 5}
							textStyle={{ color: theme.colors.almostWhite }}
							loading={isLoading}
						/>
					)
				}
			>

				<Text style={textStyles.h1}>{t('auth.login.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{form.showPin ? (form.method === 'otp' ? t('auth.login.subtitleOtp') : t('auth.login.subtitlePin')) : t('auth.login.subtitleCredentials')}</Text>

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

				{failedAttempts > 5 && <Text style={[textStyles.h4, { color: theme.colors.danger, textAlign: 'center' }]}>{t('auth.login.lockout')}</Text>}

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
