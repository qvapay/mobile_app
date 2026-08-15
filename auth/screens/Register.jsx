import { usePreventRemove } from '@react-navigation/native'
import { useState, useRef, useEffect, useEffectEvent, useLayoutEffect, useReducer } from 'react'
import { Linking } from 'react-native'

// Routes
import { ROUTES } from '../../routes'

// Auth Context
import { useAuth } from '../AuthContext'
import usePinCountdown from '../hooks/usePinCountdown'

// API — el wizard autentica en silencio tras verificar el email y solo
// completa la sesión (flip de isAuthenticated) al final del flow
import { authApi } from '../../api/authApi'
import { userApi } from '../../api/userApi'
import { setAuthToken } from '../../api/client'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Step transitions (direction-aware, shared with Onboard)
import useStepTransitions from '../../hooks/useStepTransitions'

// Push notifications (OneSignal permission + flags de prompts)
import usePushPrompt from '../../hooks/usePushPrompt'

// Nudge de KYC (gracia post-sesión para el banner del Home)
import { markKycSessionStarted } from '../../hooks/useKycPrompt'

// UI
import QPKeyboardView from '../../ui/QPKeyboardView'
import QPStepDots from '../../ui/particles/QPStepDots'

// Pantallas del wizard + acciones por paso
import {
	NameStep,
	EmailStep,
	PasswordStep,
	EmailPinStep,
	PhoneStep,
	PhoneCodeStep,
	KycStep,
	PushStep,
	StepActions,
} from './register/RegisterSteps'

// Países (dial code para el paso del código de teléfono)
import { countries } from '../../labels/countries'

// Notifications
import { toast } from 'sonner-native'

// Un dato por pantalla, estilo fintech: el orden es el del flow
const STEPS = ['name', 'email', 'password', 'emailPin', 'phone', 'phoneCode', 'kyc', 'push']

// Email validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The account-creation fields are one logical form
const initialForm = { name: '', lastname: '', email: '', password: '', invite: '', phone: '', country: 'CU' }

function formReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/**
 * Register Screen — step-by-step wizard, one field per screen (name → email → password →
 * email PIN → phone → phone code → push prompt), with direction-aware transitions.
 * Verifying the emailed PIN via login opens a *silent* session: the token goes to the
 * Keychain without flipping `isAuthenticated`, so later steps (phone verification) can
 * call authenticated endpoints before `completeSession()` finishes the flow into MainStack.
 * The phone verification code arrives via Telegram, not SMS.
 * Back-navigation is intercepted with `usePreventRemove` to step backwards instead of exiting.
 * Cada pantalla del wizard vive en `register/RegisterSteps.jsx`; aquí queda la máquina
 * de estados y los handlers.
 */
const RegisterScreen = ({ navigation }) => {

	// Auth Context
	const { register, clearError, completeSession } = useAuth()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Wizard position + direction-aware transitions
	const [step, setStep] = useState(0)
	const { direction, makeStepEnter } = useStepTransitions()
	const stepKey = STEPS[step]

	// Dots del wizard en el header nativo (mismo borde tope que Onboard).
	// native-stack INVOCA headerTitle-como-función en vez de montarla como
	// componente, así que el elemento QPStepDots conserva identidad entre
	// setOptions y la píldora anima de paso a paso sin remontarse
	useLayoutEffect(() => {
		navigation.setOptions({
			headerTitle: () => <QPStepDots count={STEPS.length} activeIndex={step} />,
		})
	}, [navigation, step])

	// Form state
	const [form, dispatch] = useReducer(formReducer, initialForm)
	const { name, lastname, email, password, invite, phone, country } = form
	const setField = (field) => (value) => dispatch({ type: 'set', field, value })

	// Verification codes (email PIN + Telegram phone code)
	const [emailPin, setEmailPin] = useState('')
	const [phoneCode, setPhoneCode] = useState('')

	// UI state
	const [isLoading, setIsLoading] = useState(false)
	const [finishing, setFinishing] = useState(false)
	const [showInvite, setShowInvite] = useState(false)
	// El usuario ya abrió la sesión de Didit en el navegador — el primario del
	// paso KYC pasa de "Verificar identidad" a "Continuar"
	const [kycOpened, setKycOpened] = useState(false)

	// La sesión silenciosa (accessToken + me) vive aquí entre la verificación del
	// email y el final del flow — nunca se renderiza
	const sessionRef = useRef(null)
	const verifyingRef = useRef(false)
	const finishingRef = useRef(false)
	const lastnameInputRef = useRef(null)

	// Resend countdown for the phone code
	const { label: countdownLabel, isDisabled: resendDisabled, start: startCountdown } = usePinCountdown()

	// Push notifications — si el permiso ya está concedido el paso se omite
	const { isPushEnabled, enablePush, dismissOnboardPrompt } = usePushPrompt()

	// Derived validation
	const nameValid = name.trim().length >= 2 && lastname.trim().length >= 2
	const emailValid = EMAIL_REGEX.test(email.trim())
	const passwordRules = [
		{ ok: password.length >= 8 && password.length <= 20, label: 'Entre 8 y 20 caracteres' },
		{ ok: /[A-Z]/.test(password) && /[a-z]/.test(password), label: 'Mayúsculas y minúsculas' },
		{ ok: /\d/.test(password), label: 'Al menos un número' },
		{ ok: /[!@#$%^&*(),.?":{}|<>]/.test(password), label: 'Un carácter especial (!@#$%…)' },
	]
	const passwordValid = passwordRules.every(r => r.ok)
	const countryData = countries.find(c => c.code === country)

	// Navegación interna del wizard
	const goTo = (index) => {
		direction.value = index > step ? 1 : -1
		setStep(index)
	}

	// El chevron nativo del header (y el swipe/hardware back) navega DENTRO del
	// wizard: email/password retroceden un paso, phoneCode vuelve al teléfono y
	// phone (ya autenticado) entra a la app. En name y emailPin se permite salir.
	// beforeRemove + preventDefault desincroniza el stack en native-stack (la
	// pantalla ya salió nativamente) — usePreventRemove bloquea el pop nativo.
	// finishing libera el bloqueo para que el flip a MainStack pueda desmontar la pantalla
	const backIntercepted = !finishing && ['email', 'password', 'phone', 'phoneCode', 'kyc', 'push'].includes(stepKey)
	usePreventRemove(backIntercepted, () => {
		if (stepKey === 'email' || stepKey === 'password') goTo(step - 1)
		else if (stepKey === 'phone') goToKycStep()
		else if (stepKey === 'phoneCode') goTo(STEPS.indexOf('phone'))
		else if (stepKey === 'kyc') goToPushOrFinish()
		else if (stepKey === 'push') finish()
	})

	// Atrás visible del split-button (además del chevron del header) — solo en
	// los pasos donde retroceder es realmente retroceder: email/password vuelven
	// un paso y phoneCode vuelve al teléfono. En emailPin ya no hay vuelta atrás
	// (la cuenta existe) y en phone/push el "atrás" del header es en realidad
	// avanzar, así que el slot queda cerrado
	const canGoBack = ['email', 'password', 'phoneCode'].includes(stepKey)
	const wizardBack = () => {
		if (stepKey === 'phoneCode') goTo(STEPS.indexOf('phone'))
		else if (canGoBack) goTo(step - 1)
	}

	// Crear la cuenta (fin del tramo de datos)
	const handleRegister = async () => {
		try {
			clearError()
			setIsLoading(true)
			const result = await register({
				name: name.trim(),
				lastname: lastname.trim(),
				email: email.trim(),
				password,
				invite: invite.trim() || undefined,
				terms: true
			})
			if (result.success) {
				goTo(STEPS.indexOf('emailPin'))
			} else {
				toast.error(result.error || 'No se pudo completar el registro')
			}
		} catch (err) {
			toast.error('Error de conexión, por favor intenta de nuevo')
		} finally { setIsLoading(false) }
	}

	// El login con el PIN del correo verifica el email Y devuelve la sesión en una
	// sola llamada (backend: login con two_factor_code == pin activa emailVerified).
	// La sesión se guarda en silencio; isAuthenticated no flipea hasta finish().
	const handleVerifyEmailPin = async () => {
		if (verifyingRef.current) return
		verifyingRef.current = true
		setIsLoading(true)
		try {
			const result = await authApi.login({ email: email.trim(), password, two_factor_code: emailPin })
			if (result.success && result.accessToken) {
				sessionRef.current = { accessToken: result.accessToken, me: result.me }
				await setAuthToken(result.accessToken)
				goTo(STEPS.indexOf('phone'))
			} else {
				toast.error(result.error || 'Código incorrecto, inténtalo de nuevo')
				setEmailPin('')
			}
		} catch (err) {
			toast.error('Error de conexión durante la verificación')
		} finally {
			setIsLoading(false)
			verifyingRef.current = false
		}
	}

	// Enviar (o reenviar) el código de teléfono vía Telegram
	const handleSendPhoneCode = async (isResend = false) => {
		if (phone.trim().length < 7) {
			toast.error('El número debe tener al menos 7 dígitos')
			return
		}
		setIsLoading(true)
		try {
			const result = await userApi.verifyPhone({ phone: phone.trim(), country, verify: false })
			if (result.success) {
				toast.success('Código enviado por Telegram')
				startCountdown(60)
				if (!isResend) { goTo(STEPS.indexOf('phoneCode')) }
			} else {
				const errorMsg = result.error?.error || result.error?.message || result.error || 'No se pudo enviar el código'
				toast.error(String(errorMsg))
			}
		} catch (err) {
			toast.error('No se pudo enviar el código')
		} finally { setIsLoading(false) }
	}

	// Verificar el código de teléfono y entrar
	const handleVerifyPhoneCode = async () => {
		if (verifyingRef.current) return
		verifyingRef.current = true
		setIsLoading(true)
		try {
			const result = await userApi.verifyPhone({ phone: phone.trim(), country, code: phoneCode, verify: true })
			if (result.success) {
				toast.success('Teléfono verificado correctamente')
				goToKycStep()
			} else {
				const errorMsg = result.error?.error || result.error?.message || result.error || 'Código incorrecto'
				toast.error(String(errorMsg))
				setPhoneCode('')
			}
		} catch (err) {
			toast.error('Error de conexión durante la verificación')
		} finally {
			setIsLoading(false)
			verifyingRef.current = false
		}
	}

	// Tras el teléfono (verificado u omitido) viene la verificación de
	// identidad — la sesión silenciosa permite pedir la URL de Didit aquí
	const goToKycStep = () => { goTo(STEPS.indexOf('kyc')) }

	// Tras el KYC (iniciado u omitido) viene la invitación a las push;
	// si el permiso ya está concedido no hay nada que pedir y se entra directo
	const goToPushOrFinish = () => {
		if (isPushEnabled) { finish() } else { goTo(STEPS.indexOf('push')) }
	}

	// Abre la sesión de verificación de Didit en el navegador. Los códigos del
	// backend se mapean a avanzar (400 ya verificado, 409 en revisión, 403
	// rechazado/max intentos — nada accionable en el wizard) o a reintentar
	const handleStartKyc = async () => {
		setIsLoading(true)
		try {
			const resp = await userApi.requestKYCSession()
			if (resp.success && resp.data) {
				setKycOpened(true)
				markKycSessionStarted()
				await Linking.openURL(resp.data)
			} else if (resp.status === 409 || resp.status === 400) {
				if (resp.status === 409) toast.info('Tu verificación está en revisión')
				goToPushOrFinish()
			} else if (resp.status === 403) {
				toast.error(String(resp.error || 'No se pudo iniciar la verificación'))
				goToPushOrFinish()
			} else {
				toast.error(String(resp.error || 'No se pudo iniciar la verificación'))
			}
		} catch {
			toast.error('Error de conexión, por favor intenta de nuevo')
		} finally { setIsLoading(false) }
	}

	// Activar las push y entrar — dismissOnboardPrompt evita que Onboard u otros
	// flows vuelvan a mostrar la misma invitación
	const handleEnablePush = async () => {
		setIsLoading(true)
		try {
			await enablePush()
			await dismissOnboardPrompt()
		} catch { /* push enable failed */ }
		finish()
	}

	// Declinar la invitación — se marca como mostrada y se entra a la app
	const handleSkipPush = async () => {
		try { await dismissOnboardPrompt() } catch { /* storage write failed */ }
		finish()
	}

	// Completar la sesión guardada → isAuthenticated flipea y la app entra sola
	// a MainStack (useAppNavigation reconcilia). Sin sesión, fallback a Login.
	const finish = async () => {
		if (finishingRef.current) return
		finishingRef.current = true
		if (!sessionRef.current) {
			navigation.navigate(ROUTES.LOGIN_SCREEN)
			return
		}
		setFinishing(true)
		setIsLoading(true)
		try {
			await completeSession({ ...sessionRef.current, email: email.trim() })
		} catch {
			// No dejar la pantalla muerta: liberar el lock para poder reintentar
			finishingRef.current = false
			setFinishing(false)
			setIsLoading(false)
			toast.error('No se pudo completar el registro, intenta de nuevo')
		}
	}

	// Auto-submit del PIN de email al completar los 4 dígitos (Effect Event:
	// lee el handler/step más recientes sin re-disparar el efecto)
	const onEmailPinComplete = useEffectEvent(() => { if (stepKey === 'emailPin' && emailPin.length === 4) { handleVerifyEmailPin() } })
	useEffect(() => { onEmailPinComplete() }, [emailPin])

	// Auto-submit del código de teléfono al completar los 6 dígitos
	const onPhoneCodeComplete = useEffectEvent(() => { if (stepKey === 'phoneCode' && phoneCode.length === 6) { handleVerifyPhoneCode() } })
	useEffect(() => { onPhoneCodeComplete() }, [phoneCode])

	// Props que comparten todas las pantallas del wizard
	const stepProps = { theme, textStyles, makeStepEnter }

	return (
		<QPKeyboardView
			scrollViewProps={{ contentContainerStyle: { flexGrow: 1, paddingTop: 16 } }}
			actions={
				<StepActions
					stepKey={stepKey}
					theme={theme}
					isLoading={isLoading}
					valid={{ name: nameValid, email: emailValid, password: passwordValid }}
					emailPin={emailPin}
					phone={phone}
					phoneCode={phoneCode}
					resendDisabled={resendDisabled}
					countdownLabel={countdownLabel}
					canGoBack={canGoBack}
					onBack={wizardBack}
					onNameNext={() => goTo(STEPS.indexOf('email'))}
					onEmailNext={() => goTo(STEPS.indexOf('password'))}
					onRegister={handleRegister}
					onVerifyEmailPin={handleVerifyEmailPin}
					onSendPhoneCode={handleSendPhoneCode}
					onVerifyPhoneCode={handleVerifyPhoneCode}
					kycOpened={kycOpened}
					onStartKyc={handleStartKyc}
					onSkipPhone={goToKycStep}
					onKycContinue={goToPushOrFinish}
					onEnablePush={handleEnablePush}
					onSkipPush={handleSkipPush}
				/>
			}
		>

			{/* ¿Cómo te llamas? */}
			{stepKey === 'name' && (
				<NameStep {...stepProps} name={name} lastname={lastname} setField={setField} nameValid={nameValid} lastnameInputRef={lastnameInputRef} onNext={() => goTo(STEPS.indexOf('email'))} onLogin={() => navigation.navigate(ROUTES.LOGIN_SCREEN)} />
			)}

			{/* Tu correo electrónico */}
			{stepKey === 'email' && (
				<EmailStep {...stepProps} email={email} invite={invite} setField={setField} emailValid={emailValid} showInvite={showInvite} onShowInvite={() => setShowInvite(true)} onNext={() => goTo(STEPS.indexOf('password'))} />
			)}

			{/* Crea tu contraseña */}
			{stepKey === 'password' && (
				<PasswordStep {...stepProps} password={password} setField={setField} passwordRules={passwordRules} />
			)}

			{/* Revisa tu correo */}
			{stepKey === 'emailPin' && (
				<EmailPinStep {...stepProps} email={email} emailPin={emailPin} setEmailPin={setEmailPin} isLoading={isLoading} />
			)}

			{/* Añade tu teléfono */}
			{stepKey === 'phone' && (
				<PhoneStep {...stepProps} country={country} phone={phone} setField={setField} />
			)}

			{/* Código de verificación del teléfono */}
			{stepKey === 'phoneCode' && (
				<PhoneCodeStep {...stepProps} dialCode={countryData?.dial_code} phone={phone} phoneCode={phoneCode} setPhoneCode={setPhoneCode} isLoading={isLoading} />
			)}

			{/* Verificación de identidad (Didit en el navegador) */}
			{stepKey === 'kyc' && (
				<KycStep {...stepProps} kycOpened={kycOpened} />
			)}

			{/* Invitación a las notificaciones push */}
			{stepKey === 'push' && (
				<PushStep {...stepProps} />
			)}

		</QPKeyboardView>
	)
}

export default RegisterScreen
