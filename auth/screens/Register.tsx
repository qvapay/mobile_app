import { useLayoutEffect } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../types/navigation'

// Routes
import { ROUTES } from '../../routes'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Máquina de estados del wizard (pasos, formulario, sesión silenciosa, handlers)
import useRegisterFlow, { STEPS } from './register/useRegisterFlow'

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

/**
 * Register Screen — step-by-step wizard, one field per screen (name → email → password →
 * email PIN → phone → phone code → push prompt), with direction-aware transitions.
 * Verifying the emailed PIN via login opens a *silent* session: the token goes to the
 * Keychain without flipping `isAuthenticated`, so later steps (phone verification) can
 * call authenticated endpoints before `completeSession()` finishes the flow into MainStack.
 * The phone verification code arrives via Telegram, not SMS.
 * Back-navigation is intercepted with `usePreventRemove` to step backwards instead of exiting.
 * Cada pantalla del wizard vive en `register/RegisterSteps.tsx` y la máquina de
 * estados con sus handlers en `register/useRegisterFlow.ts`; aquí queda la composición.
 */
const RegisterScreen = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'Register'>) => {

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const {
		step, stepKey, makeStepEnter, goTo, canGoBack, wizardBack,
		name, lastname, email, password, invite, phone, country, setField, countryData,
		emailPin, setEmailPin, phoneCode, setPhoneCode,
		nameValid, emailValid, passwordRules, passwordValid,
		isLoading, showInvite, setShowInvite, kycOpened, lastnameInputRef,
		resendDisabled, countdownLabel,
		handleRegister, handleVerifyEmailPin, handleSendPhoneCode, handleVerifyPhoneCode,
		handleStartKyc, handleEnablePush, handleSkipPush, goToKycStep, goToPushOrFinish,
	} = useRegisterFlow(navigation)

	// Dots del wizard en el header nativo (mismo borde tope que Onboard).
	// native-stack INVOCA headerTitle-como-función en vez de montarla como
	// componente, así que el elemento QPStepDots conserva identidad entre
	// setOptions y la píldora anima de paso a paso sin remontarse
	useLayoutEffect(() => {
		navigation.setOptions({
			headerTitle: () => <QPStepDots count={STEPS.length} activeIndex={step} />,
		})
	}, [navigation, step])

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
