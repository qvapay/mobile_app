import { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, {
	interpolateColor,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPCodeInput from '../../../ui/particles/QPCodeInput'
import QPPressable from '../../../ui/particles/QPPressable'
import QPSplitButton from '../../../ui/particles/QPSplitButton'

// Phone input (chip de país + input, compartido con Settings y recargas)
import QPPhoneInput from '../../../ui/QPPhoneInput'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Regla de contraseña con check animado
const PasswordRule = ({ ok, label, theme }) => {
	const progress = useSharedValue(ok ? 1 : 0)
	useEffect(() => {
		progress.value = withTiming(ok ? 1 : 0, { duration: 220 })
	}, [ok, progress])
	const circleStyle = useAnimatedStyle(() => ({
		backgroundColor: interpolateColor(progress.value, [0, 1], ['transparent', theme.colors.successFill]),
		borderColor: interpolateColor(progress.value, [0, 1], [theme.colors.border, theme.colors.successFill]),
	}))
	return (
		<View style={styles.ruleRow}>
			<Animated.View style={[styles.ruleCircle, circleStyle]}>
				{ok && <FontAwesome6 name="check" size={10} color={theme.colors.successFillText} iconStyle="solid" />}
			</Animated.View>
			<Text style={{ color: ok ? theme.colors.primaryText : theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>
				{label}
			</Text>
		</View>
	)
}

// ¿Cómo te llamas?
export const NameStep = ({ theme, textStyles, makeStepEnter, name, lastname, setField, nameValid, lastnameInputRef, onNext, onLogin }) => (
	<View key="step-name" style={styles.stepContainer}>
		<Animated.View entering={makeStepEnter(0)}>
			<Text style={textStyles.h1}>¿Cómo te llamas?</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(50)}>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Tal y como aparece en tu documento de identidad</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(110)} style={styles.fieldsBlock}>
			<QPInput
				placeholder="Nombre"
				value={name}
				onChangeText={setField('name')}
				autoCapitalize="words"
				prefixIconName="user"
				textContentType="givenName"
				autoComplete="name"
				autoFocus
				returnKeyType="next"
				onSubmitEditing={() => lastnameInputRef.current?.focus()}
			/>
			<QPInput
				ref={lastnameInputRef}
				placeholder="Apellidos"
				value={lastname}
				onChangeText={setField('lastname')}
				autoCapitalize="words"
				prefixIconName="user"
				textContentType="familyName"
				autoComplete="name-family"
				returnKeyType="done"
				onSubmitEditing={() => { if (nameValid) onNext() }}
			/>
		</Animated.View>
		<Animated.View entering={makeStepEnter(170)} style={styles.loginLink}>
			<Text style={{ textAlign: 'center', color: theme.colors.primaryText }}>
				¿Ya tienes una cuenta?{' '}
				<Text style={{ color: theme.colors.primary }} onPress={onLogin}>
					Inicia sesión
				</Text>
			</Text>
		</Animated.View>
	</View>
)

// Tu correo electrónico
export const EmailStep = ({ theme, textStyles, makeStepEnter, email, invite, setField, emailValid, showInvite, onShowInvite, onNext }) => (
	<View key="step-email" style={styles.stepContainer}>
		<Animated.View entering={makeStepEnter(0)}>
			<Text style={textStyles.h1}>Tu correo electrónico</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(50)}>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Te enviaremos un código para verificarlo</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(110)} style={styles.fieldsBlock}>
			<QPInput
				placeholder="tucorreo@gmail.com"
				value={email}
				onChangeText={setField('email')}
				keyboardType="email-address"
				autoCapitalize="none"
				autoCorrect={false}
				prefixIconName="envelope"
				textContentType="emailAddress"
				autoComplete="email"
				autoFocus
				returnKeyType="done"
				onSubmitEditing={() => { if (emailValid) onNext() }}
			/>
			{showInvite ? (
				<QPInput
					placeholder="Código de invitación"
					value={invite}
					onChangeText={setField('invite')}
					autoCapitalize="none"
					prefixIconName="gift"
				/>
			) : (
				<QPPressable variant="opacity" onPress={onShowInvite} style={styles.inviteLink}>
					<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
						¿Tienes un código de invitación?
					</Text>
				</QPPressable>
			)}
		</Animated.View>
	</View>
)

// Crea tu contraseña
export const PasswordStep = ({ theme, textStyles, makeStepEnter, password, setField, passwordRules }) => (
	<View key="step-password" style={styles.stepContainer}>
		<Animated.View entering={makeStepEnter(0)}>
			<Text style={textStyles.h1}>Crea tu contraseña</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(50)}>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Protege tu cuenta con una contraseña fuerte</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(110)} style={styles.fieldsBlock}>
			<QPInput
				placeholder="Contraseña"
				value={password}
				onChangeText={setField('password')}
				secureTextEntry
				prefixIconName="lock"
				suffixIconName="eye"
				textContentType="newPassword"
				autoComplete="password-new"
				autoFocus
			/>
		</Animated.View>
		<Animated.View entering={makeStepEnter(160)} style={styles.rulesBlock}>
			{passwordRules.map((rule) => (
				<PasswordRule key={rule.label} ok={rule.ok} label={rule.label} theme={theme} />
			))}
		</Animated.View>
	</View>
)

// Revisa tu correo
export const EmailPinStep = ({ theme, textStyles, makeStepEnter, email, emailPin, setEmailPin, isLoading }) => (
	<View key="step-emailPin" style={styles.stepContainer}>
		<Animated.View entering={makeStepEnter(0)} style={styles.iconBlock}>
			<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
				<FontAwesome6 name="envelope-open-text" size={34} color={theme.colors.primary} iconStyle="solid" />
			</View>
		</Animated.View>
		<Animated.View entering={makeStepEnter(50)}>
			<Text style={[textStyles.h1, styles.centeredText]}>Revisa tu correo</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(100)}>
			<Text style={[textStyles.h3, styles.centeredText, { color: theme.colors.secondaryText }]}>
				Enviamos un código de 4 dígitos a{'\n'}
				<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }}>{email.trim()}</Text>
			</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(160)} style={styles.fieldsBlock}>
			<QPCodeInput length={4} code={emailPin} onChangeCode={setEmailPin} autoFocus disabled={isLoading} />
		</Animated.View>
		<Animated.View entering={makeStepEnter(220)}>
			<Text style={[styles.centeredText, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
				¿No lo encuentras? Revisa tu carpeta de spam
			</Text>
		</Animated.View>
	</View>
)

// Añade tu teléfono
export const PhoneStep = ({ theme, textStyles, makeStepEnter, country, phone, setField }) => (
	<View key="step-phone" style={styles.stepContainer}>
		<Animated.View entering={makeStepEnter(0)}>
			<Text style={textStyles.h1}>Añade tu teléfono</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(50)}>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Opcional — te ayuda a recuperar tu cuenta y a que tus contactos te encuentren</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(110)} style={styles.fieldsBlock}>
			<QPPhoneInput
				country={country}
				onChangeCountry={setField('country')}
				value={phone}
				onChangeText={setField('phone')}
				autoFocus
			/>
		</Animated.View>
		<Animated.View entering={makeStepEnter(170)} style={styles.infoRow}>
			<FontAwesome6 name="paper-plane" size={14} color={theme.colors.primary} iconStyle="solid" />
			<Text style={{ flex: 1, color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>
				Te enviaremos el código de verificación por Telegram o WhatsApp
			</Text>
		</Animated.View>
	</View>
)

// Código de verificación del teléfono
export const PhoneCodeStep = ({ theme, textStyles, makeStepEnter, dialCode, phone, phoneCode, setPhoneCode, isLoading }) => (
	<View key="step-phoneCode" style={styles.stepContainer}>
		<Animated.View entering={makeStepEnter(0)} style={styles.iconBlock}>
			<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
				<FontAwesome6 name="paper-plane" size={32} color={theme.colors.primary} iconStyle="solid" />
			</View>
		</Animated.View>
		<Animated.View entering={makeStepEnter(50)}>
			<Text style={[textStyles.h1, styles.centeredText]}>Revisa Telegram o WhatsApp</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(100)}>
			<Text style={[textStyles.h3, styles.centeredText, { color: theme.colors.secondaryText }]}>
				Enviamos un código de 6 dígitos a{'\n'}
				<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }}>{dialCode} {phone.trim()}</Text>
			</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(160)} style={styles.fieldsBlock}>
			<QPCodeInput length={6} code={phoneCode} onChangeCode={setPhoneCode} autoFocus disabled={isLoading} />
		</Animated.View>
	</View>
)

// Verificación de identidad — la sesión de Didit se abre en el navegador; al
// volver, el primario pasa a "Continuar" (kycOpened)
export const KycStep = ({ theme, textStyles, makeStepEnter, kycOpened }) => (
	<View key="step-kyc" style={styles.stepContainer}>
		<Animated.View entering={makeStepEnter(0)} style={styles.iconBlock}>
			<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
				<FontAwesome6 name="shield-halved" size={34} color={theme.colors.primary} iconStyle="solid" />
			</View>
		</Animated.View>
		<Animated.View entering={makeStepEnter(50)}>
			<Text style={[textStyles.h1, styles.centeredText]}>Verifica tu identidad</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(100)}>
			<Text style={[textStyles.h3, styles.centeredText, { color: theme.colors.secondaryText }]}>
				{kycOpened
					? 'Cuando termines la verificación en el navegador, vuelve aquí y continúa. Te avisaremos en cuanto esté aprobada.'
					: 'Es rápido y seguro: una foto de tu documento y una selfie. Con tu cuenta verificada desbloqueas todo QvaPay.'}
			</Text>
		</Animated.View>
		{!kycOpened && (
			<Animated.View entering={makeStepEnter(160)} style={styles.kycBenefits}>
				{['P2P y cuenta de ahorro', 'Límites de envío y retiro más altos', 'Retiros procesados al instante'].map((benefit) => (
					<View key={benefit} style={styles.ruleRow}>
						<FontAwesome6 name="circle-check" size={16} color={theme.colors.successText} iconStyle="solid" />
						<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>
							{benefit}
						</Text>
					</View>
				))}
			</Animated.View>
		)}
	</View>
)

// Invitación a las notificaciones push
export const PushStep = ({ theme, textStyles, makeStepEnter }) => (
	<View key="step-push" style={styles.stepContainer}>
		<Animated.View entering={makeStepEnter(0)} style={styles.iconBlock}>
			<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
				<FontAwesome6 name="bell" size={34} color={theme.colors.primary} iconStyle="solid" />
			</View>
		</Animated.View>
		<Animated.View entering={makeStepEnter(50)}>
			<Text style={[textStyles.h1, styles.centeredText]}>No te pierdas ningún pago</Text>
		</Animated.View>
		<Animated.View entering={makeStepEnter(100)}>
			<Text style={[textStyles.h3, styles.centeredText, { color: theme.colors.secondaryText }]}>
				Activa las notificaciones para saber al instante cuando recibes dinero, cuando tus ofertas P2P tienen respuesta y más
			</Text>
		</Animated.View>
	</View>
)

// Botones de acción del paso actual (van al slot `actions` del QPKeyboardView).
// `valid` agrupa las validaciones derivadas: { name, email, password }.
// El QPSplitButton se renderiza UNA sola vez fuera del switch de extras: así
// persiste entre pasos y la apertura/cierre del Atrás (y el fade del label)
// se anima de verdad en vez de remontarse ya en su estado final.
export const StepActions = ({
	stepKey, theme, isLoading, valid,
	emailPin, phone, phoneCode,
	resendDisabled, countdownLabel,
	canGoBack, onBack,
	onNameNext, onEmailNext, onRegister, onVerifyEmailPin,
	onSendPhoneCode, onVerifyPhoneCode, onSkipPhone,
	kycOpened, onStartKyc, onKycContinue,
	onEnablePush, onSkipPush,
}) => {
	// Config del botón primario por paso
	const primary = {
		name: { title: 'Continuar', onPress: onNameNext, disabled: !valid.name },
		email: { title: 'Continuar', onPress: onEmailNext, disabled: !valid.email },
		password: { title: 'Crear cuenta', onPress: onRegister, disabled: !valid.password, loading: isLoading },
		emailPin: { title: 'Verificar', onPress: onVerifyEmailPin, disabled: emailPin.length !== 4, loading: isLoading },
		phone: { title: 'Enviar código', onPress: () => onSendPhoneCode(false), disabled: phone.trim().length < 7, loading: isLoading },
		phoneCode: { title: 'Verificar teléfono', onPress: onVerifyPhoneCode, disabled: phoneCode.length !== 6, loading: isLoading },
		kyc: kycOpened
			? { title: 'Continuar', onPress: onKycContinue }
			: { title: 'Verificar identidad', onPress: onStartKyc, loading: isLoading },
		push: { title: 'Activar notificaciones', onPress: onEnablePush, loading: isLoading },
	}[stepKey]

	if (!primary) return null

	const skipLinkText = { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }

	return (
		<>
			{stepKey === 'password' && (
				<Text style={[styles.legalText, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>
					Al crear tu cuenta aceptas los Términos y Condiciones y la Política de Privacidad de QvaPay
				</Text>
			)}

			<QPSplitButton
				title={primary.title}
				onPress={primary.onPress}
				disabled={primary.disabled}
				loading={primary.loading}
				showBack={canGoBack}
				onBack={onBack}
				check={stepKey === 'push'}
			/>

			{stepKey === 'phone' && (
				<QPPressable variant="opacity" onPress={onSkipPhone} style={styles.skipLink}>
					<Text style={skipLinkText}>Ahora no</Text>
				</QPPressable>
			)}

			{stepKey === 'phoneCode' && (
				<>
					<QPButton
						title={resendDisabled ? countdownLabel : 'Reenviar código'}
						onPress={() => onSendPhoneCode(true)}
						disabled={resendDisabled}
						style={{ backgroundColor: theme.colors.surface }}
						textStyle={{ color: theme.colors.primaryText }}
					/>
					<QPPressable variant="opacity" onPress={onSkipPhone} style={styles.skipLink}>
						<Text style={skipLinkText}>Omitir por ahora</Text>
					</QPPressable>
				</>
			)}

			{stepKey === 'kyc' && !kycOpened && (
				<QPPressable variant="opacity" onPress={onKycContinue} style={styles.skipLink}>
					<Text style={skipLinkText}>Ahora no</Text>
				</QPPressable>
			)}

			{stepKey === 'push' && (
				<QPPressable variant="opacity" onPress={onSkipPush} style={styles.skipLink}>
					<Text style={skipLinkText}>Ahora no</Text>
				</QPPressable>
			)}
		</>
	)
}

const styles = StyleSheet.create({
	infoRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		marginTop: 8,
	},
	stepContainer: {
		flex: 1,
	},
	fieldsBlock: {
		marginTop: 24,
	},
	rulesBlock: {
		marginTop: 16,
		gap: 10,
	},
	ruleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
	},
	ruleCircle: {
		width: 18,
		height: 18,
		borderRadius: 9,
		borderWidth: 1.5,
		alignItems: 'center',
		justifyContent: 'center',
	},
	iconBlock: {
		alignItems: 'center',
		paddingVertical: 24,
	},
	kycBenefits: {
		marginTop: 24,
		gap: 12,
		alignSelf: 'center',
	},
	iconCircle: {
		width: 80,
		height: 80,
		borderRadius: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
	centeredText: {
		textAlign: 'center',
	},
	inviteLink: {
		alignSelf: 'flex-start',
		paddingVertical: 10,
		paddingHorizontal: 4,
	},
	skipLink: {
		alignItems: 'center',
		paddingVertical: 8,
	},
	legalText: {
		textAlign: 'center',
		paddingHorizontal: 10,
	},
	loginLink: {
		marginTop: 24,
	},
})
