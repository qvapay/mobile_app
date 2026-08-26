import { usePreventRemove } from '@react-navigation/native'
import { useState, useRef, useEffect, useEffectEvent, useLayoutEffect, useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextInput } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../types/navigation'
import type { Me } from '../../types/domain'

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

// Flujo de verificación de identidad nativo (SDK embebido, fallback a navegador)
import useKycVerification from '../../hooks/useKycVerification'

// Atribución de instalación (Android Install Referrer): código del referidor
// y source de adquisición capturados en el primer arranque
import { getStoredAttribution, mapSourceToEnum } from '../../helpers/installReferrer'
import type { InstallAttribution } from '../../helpers/installReferrer'

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
import type { StepKey } from './register/RegisterSteps'

// Países (dial code para el paso del código de teléfono)
import { countries } from '../../labels/countries'

// Notifications
import { toast } from 'sonner-native'

// Un dato por pantalla, estilo fintech: el orden es el del flow
const STEPS: readonly StepKey[] = ['name', 'email', 'password', 'emailPin', 'phone', 'phoneCode', 'kyc', 'push']

// Email validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Campos de alta de cuenta: un único form lógico repartido entre pasos. */
type RegisterForm = {
	name: string
	lastname: string
	email: string
	password: string
	invite: string
	phone: string
	country: string
}

type RegisterFormAction = { type: 'set', field: string, value: string }

// The account-creation fields are one logical form
const initialForm: RegisterForm = { name: '', lastname: '', email: '', password: '', invite: '', phone: '', country: 'CU' }

function formReducer(state: RegisterForm, action: RegisterFormAction): RegisterForm {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value } as RegisterForm
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
const RegisterScreen = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'Register'>) => {

	// Idioma activo
	const { t } = useTranslation()

	// Auth Context
	const { register, clearError, completeSession } = useAuth()

	// Verificación de identidad nativa (paso kyc del wizard)
	const { launchKyc } = useKycVerification()

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
	const setField = (field: string) => (value: string) => dispatch({ type: 'set', field, value })

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
	const sessionRef = useRef<{ accessToken: string, me: Me } | null>(null)
	const verifyingRef = useRef(false)
	const finishingRef = useRef(false)
	const lastnameInputRef = useRef<TextInput | null>(null)

	// Atribución de instalación: si el referrer de Play trajo un código de
	// invitación, se aplica solo (visible para el usuario); el utm_source viaja
	// como `source` al crear la cuenta
	const attributionRef = useRef<InstallAttribution | null>(null)
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const attribution = await getStoredAttribution()
			if (cancelled || !attribution) return
			attributionRef.current = attribution
			if (attribution.invite) {
				dispatch({ type: 'set', field: 'invite', value: attribution.invite })
				setShowInvite(true)
			}
		})()
		return () => { cancelled = true }
	}, [])

	// Resend countdown for the phone code
	const { label: countdownLabel, isDisabled: resendDisabled, start: startCountdown } = usePinCountdown()

	// Push notifications — si el permiso ya está concedido el paso se omite
	const { isPushEnabled, enablePush, dismissOnboardPrompt } = usePushPrompt()

	// Derived validation
	const nameValid = name.trim().length >= 2 && lastname.trim().length >= 2
	const emailValid = EMAIL_REGEX.test(email.trim())
	const passwordRules = [
		{ ok: password.length >= 8 && password.length <= 20, label: t('auth.register.password.rules.length') },
		{ ok: /[A-Z]/.test(password) && /[a-z]/.test(password), label: t('auth.register.password.rules.cases') },
		{ ok: /\d/.test(password), label: t('auth.register.password.rules.number') },
		{ ok: /[!@#$%^&*(),.?":{}|<>]/.test(password), label: t('auth.register.password.rules.special') },
	]
	const passwordValid = passwordRules.every(r => r.ok)
	const countryData = countries.find(c => c.code === country)

	// Navegación interna del wizard
	const goTo = (index: number) => {
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
				source: mapSourceToEnum(attributionRef.current?.utmSource),
				terms: true
			})
			if (result.success) {
				goTo(STEPS.indexOf('emailPin'))
			} else {
				toast.error(result.error || t('auth.register.toasts.registerFailed'))
			}
		} catch (err) {
			toast.error(t('auth.register.toasts.connectionError'))
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
				// `me` es opcional en LoginResult (el brazo 202 comparte forma con el
				// 200), pero un 200 con accessToken SIEMPRE lo trae: cast local
				sessionRef.current = { accessToken: result.accessToken, me: result.me as Me }
				await setAuthToken(result.accessToken)
				goTo(STEPS.indexOf('phone'))
			} else {
				// La condición compuesta de arriba no estrecha a la rama de fallo:
				// `error` solo existe ahí, así que se lee con cast local
				toast.error((result as { error?: string }).error || t('auth.register.toasts.wrongPin'))
				setEmailPin('')
			}
		} catch (err) {
			toast.error(t('auth.register.toasts.verificationConnectionError'))
		} finally {
			setIsLoading(false)
			verifyingRef.current = false
		}
	}

	// Enviar (o reenviar) el código de teléfono vía Telegram
	const handleSendPhoneCode = async (isResend = false) => {
		if (phone.trim().length < 7) {
			toast.error(t('auth.register.toasts.phoneTooShort'))
			return
		}
		setIsLoading(true)
		try {
			const result = await userApi.verifyPhone({ phone: phone.trim(), country, verify: false })
			if (result.success) {
				toast.success(t('auth.register.toasts.codeSentTelegram'))
				startCountdown(60)
				if (!isResend) { goTo(STEPS.indexOf('phoneCode')) }
			} else {
				// OJO: `error` de userApi SIEMPRE es un string; los accesos `.error`/
				// `.message` son ramas muertas de una forma vieja del backend. Se
				// preservan tal cual con casts locales (bug latente, no se toca aquí)
				const errorMsg = (result.error as unknown as { error?: string })?.error || (result.error as unknown as { message?: string })?.message || result.error || t('auth.register.toasts.codeSendFailed')
				toast.error(String(errorMsg))
			}
		} catch (err) {
			toast.error(t('auth.register.toasts.codeSendFailed'))
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
				toast.success(t('auth.register.toasts.phoneVerified'))
				goToKycStep()
			} else {
				// Mismo caso que en handleSendPhoneCode: `.error`/`.message` son ramas
				// muertas sobre un string — casts locales para conservar el runtime
				const errorMsg = (result.error as unknown as { error?: string })?.error || (result.error as unknown as { message?: string })?.message || result.error || t('auth.register.toasts.wrongCode')
				toast.error(String(errorMsg))
				setPhoneCode('')
			}
		} catch (err) {
			toast.error(t('auth.register.toasts.verificationConnectionError'))
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

	// Lanza el flujo de verificación NATIVO (useKycVerification). Un resultado
	// terminal avanza el wizard (aprobada/en revisión — nada más que hacer aquí);
	// cancelar se queda en el paso con el "Ahora no" disponible; solo el fallback
	// a navegador conserva el estado kycOpened de la vuelta manual
	const handleStartKyc = async () => {
		setIsLoading(true)
		try {
			const resp = await launchKyc()

			if (resp.kind === 'native') {
				if (resp.outcome === 'approved') {
					toast.success(t('auth.register.toasts.kycApproved'))
					goToPushOrFinish()
				} else if (resp.outcome === 'pending' || resp.outcome === 'declined') {
					// declined también se comunica como revisión (política: la revisión
					// manual la resuelve el equipo, no es un rechazo terminal en el alta)
					toast.info(t('auth.register.toasts.kycInReview'))
					goToPushOrFinish()
				}
				// cancelled: sin ruido, el paso sigue ofreciendo verificar o "Ahora no"
			} else if (resp.kind === 'browser') {
				setKycOpened(true)
			} else if (resp.kind === 'request-error') {
				// 400 ya verificado, 409 en revisión, 403 rechazado — nada accionable
				if (resp.status === 409 || resp.status === 400) {
					if (resp.status === 409) toast.info(t('auth.register.toasts.kycInReview'))
					goToPushOrFinish()
				} else if (resp.status === 403) {
					toast.error(String(resp.message || t('auth.register.toasts.kycStartFailed')))
					goToPushOrFinish()
				} else {
					toast.error(String(resp.message || t('auth.register.toasts.kycStartFailed')))
				}
			} else {
				// sdk-error: reintentable desde el propio paso
				toast.error(String(resp.message || t('auth.register.toasts.kycStartFailed')))
			}
		} catch {
			toast.error(t('auth.register.toasts.connectionError'))
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
			toast.error(t('auth.register.toasts.finishFailed'))
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
