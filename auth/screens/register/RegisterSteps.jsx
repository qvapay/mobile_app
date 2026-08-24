import { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
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
export const NameStep = ({ theme, textStyles, makeStepEnter, name, lastname, setField, nameValid, lastnameInputRef, onNext, onLogin }) => {
	const { t } = useTranslation()
	return (
		<View key="step-name" style={styles.stepContainer}>
			<Animated.View entering={makeStepEnter(0)}>
				<Text style={textStyles.h1}>{t('auth.register.name.title')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(50)}>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('auth.register.name.subtitle')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(110)} style={styles.fieldsBlock}>
				<QPInput
					placeholder={t('auth.register.name.firstNamePlaceholder')}
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
					placeholder={t('auth.register.name.lastNamePlaceholder')}
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
					{t('auth.register.name.haveAccount')}{' '}
					<Text style={{ color: theme.colors.primary }} onPress={onLogin}>
						{t('auth.register.name.logIn')}
					</Text>
				</Text>
			</Animated.View>
		</View>
	)
}

// Tu correo electrónico
export const EmailStep = ({ theme, textStyles, makeStepEnter, email, invite, setField, emailValid, showInvite, onShowInvite, onNext }) => {
	const { t } = useTranslation()
	return (
		<View key="step-email" style={styles.stepContainer}>
			<Animated.View entering={makeStepEnter(0)}>
				<Text style={textStyles.h1}>{t('auth.register.email.title')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(50)}>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('auth.register.email.subtitle')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(110)} style={styles.fieldsBlock}>
				<QPInput
					placeholder={t('auth.fields.emailExamplePlaceholder')}
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
						placeholder={t('auth.register.email.invitePlaceholder')}
						value={invite}
						onChangeText={setField('invite')}
						autoCapitalize="none"
						prefixIconName="gift"
					/>
				) : (
					<QPPressable variant="opacity" onPress={onShowInvite} style={styles.inviteLink}>
						<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
							{t('auth.register.email.haveInvite')}
						</Text>
					</QPPressable>
				)}
			</Animated.View>
		</View>
	)
}

// Crea tu contraseña
export const PasswordStep = ({ theme, textStyles, makeStepEnter, password, setField, passwordRules }) => {
	const { t } = useTranslation()
	return (
		<View key="step-password" style={styles.stepContainer}>
			<Animated.View entering={makeStepEnter(0)}>
				<Text style={textStyles.h1}>{t('auth.register.password.title')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(50)}>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('auth.register.password.subtitle')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(110)} style={styles.fieldsBlock}>
				<QPInput
					placeholder={t('auth.fields.passwordPlaceholder')}
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
}

// Revisa tu correo
export const EmailPinStep = ({ theme, textStyles, makeStepEnter, email, emailPin, setEmailPin, isLoading }) => {
	const { t } = useTranslation()
	return (
		<View key="step-emailPin" style={styles.stepContainer}>
			<Animated.View entering={makeStepEnter(0)} style={styles.iconBlock}>
				<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
					<FontAwesome6 name="envelope-open-text" size={34} color={theme.colors.primary} iconStyle="solid" />
				</View>
			</Animated.View>
			<Animated.View entering={makeStepEnter(50)}>
				<Text style={[textStyles.h1, styles.centeredText]}>{t('auth.register.emailPin.title')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(100)}>
				<Text style={[textStyles.h3, styles.centeredText, { color: theme.colors.secondaryText }]}>
					{t('auth.register.emailPin.sentTo')}{'\n'}
					<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }}>{email.trim()}</Text>
				</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(160)} style={styles.fieldsBlock}>
				<QPCodeInput length={4} code={emailPin} onChangeCode={setEmailPin} autoFocus disabled={isLoading} />
			</Animated.View>
			<Animated.View entering={makeStepEnter(220)}>
				<Text style={[styles.centeredText, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
					{t('auth.register.emailPin.spamHint')}
				</Text>
			</Animated.View>
		</View>
	)
}

// Añade tu teléfono
export const PhoneStep = ({ theme, textStyles, makeStepEnter, country, phone, setField }) => {
	const { t } = useTranslation()
	return (
		<View key="step-phone" style={styles.stepContainer}>
			<Animated.View entering={makeStepEnter(0)}>
				<Text style={textStyles.h1}>{t('auth.register.phone.title')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(50)}>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('auth.register.phone.subtitle')}</Text>
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
					{t('auth.register.phone.channelHint')}
				</Text>
			</Animated.View>
		</View>
	)
}

// Código de verificación del teléfono
export const PhoneCodeStep = ({ theme, textStyles, makeStepEnter, dialCode, phone, phoneCode, setPhoneCode, isLoading }) => {
	const { t } = useTranslation()
	return (
		<View key="step-phoneCode" style={styles.stepContainer}>
			<Animated.View entering={makeStepEnter(0)} style={styles.iconBlock}>
				<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
					<FontAwesome6 name="paper-plane" size={32} color={theme.colors.primary} iconStyle="solid" />
				</View>
			</Animated.View>
			<Animated.View entering={makeStepEnter(50)}>
				<Text style={[textStyles.h1, styles.centeredText]}>{t('auth.register.phoneCode.title')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(100)}>
				<Text style={[textStyles.h3, styles.centeredText, { color: theme.colors.secondaryText }]}>
					{t('auth.register.phoneCode.sentTo')}{'\n'}
					<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }}>{dialCode} {phone.trim()}</Text>
				</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(160)} style={styles.fieldsBlock}>
				<QPCodeInput length={6} code={phoneCode} onChangeCode={setPhoneCode} autoFocus disabled={isLoading} />
			</Animated.View>
		</View>
	)
}

// Verificación de identidad — la sesión de Didit se abre en el navegador; al
// volver, el primario pasa a "Continuar" (kycOpened)
export const KycStep = ({ theme, textStyles, makeStepEnter, kycOpened }) => {
	const { t } = useTranslation()
	return (
		<View key="step-kyc" style={styles.stepContainer}>
			<Animated.View entering={makeStepEnter(0)} style={styles.iconBlock}>
				<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
					<FontAwesome6 name="shield-halved" size={34} color={theme.colors.primary} iconStyle="solid" />
				</View>
			</Animated.View>
			<Animated.View entering={makeStepEnter(50)}>
				<Text style={[textStyles.h1, styles.centeredText]}>{t('auth.register.kyc.title')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(100)}>
				<Text style={[textStyles.h3, styles.centeredText, { color: theme.colors.secondaryText }]}>
					{kycOpened
						? t('auth.register.kyc.subtitleOpened')
						: t('auth.register.kyc.subtitleIntro')}
				</Text>
			</Animated.View>
			{!kycOpened && (
				<Animated.View entering={makeStepEnter(160)} style={styles.kycBenefits}>
					{[t('auth.register.kyc.benefits.p2pSavings'), t('auth.register.kyc.benefits.higherLimits'), t('auth.register.kyc.benefits.instantWithdrawals')].map((benefit) => (
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
}

// Invitación a las notificaciones push
export const PushStep = ({ theme, textStyles, makeStepEnter }) => {
	const { t } = useTranslation()
	return (
		<View key="step-push" style={styles.stepContainer}>
			<Animated.View entering={makeStepEnter(0)} style={styles.iconBlock}>
				<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
					<FontAwesome6 name="bell" size={34} color={theme.colors.primary} iconStyle="solid" />
				</View>
			</Animated.View>
			<Animated.View entering={makeStepEnter(50)}>
				<Text style={[textStyles.h1, styles.centeredText]}>{t('auth.register.push.title')}</Text>
			</Animated.View>
			<Animated.View entering={makeStepEnter(100)}>
				<Text style={[textStyles.h3, styles.centeredText, { color: theme.colors.secondaryText }]}>
					{t('auth.register.push.subtitle')}
				</Text>
			</Animated.View>
		</View>
	)
}

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
	const { t } = useTranslation()

	// Config del botón primario por paso
	const primary = {
		name: { title: t('common.actions.continue'), onPress: onNameNext, disabled: !valid.name },
		email: { title: t('common.actions.continue'), onPress: onEmailNext, disabled: !valid.email },
		password: { title: t('auth.register.actions.createAccount'), onPress: onRegister, disabled: !valid.password, loading: isLoading },
		emailPin: { title: t('auth.register.actions.verify'), onPress: onVerifyEmailPin, disabled: emailPin.length !== 4, loading: isLoading },
		phone: { title: t('auth.register.actions.sendCode'), onPress: () => onSendPhoneCode(false), disabled: phone.trim().length < 7, loading: isLoading },
		phoneCode: { title: t('auth.register.actions.verifyPhone'), onPress: onVerifyPhoneCode, disabled: phoneCode.length !== 6, loading: isLoading },
		kyc: kycOpened
			? { title: t('common.actions.continue'), onPress: onKycContinue }
			: { title: t('auth.register.actions.verifyIdentity'), onPress: onStartKyc, loading: isLoading },
		push: { title: t('auth.register.actions.enablePush'), onPress: onEnablePush, loading: isLoading },
	}[stepKey]

	if (!primary) return null

	const skipLinkText = { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }

	return (
		<>
			{stepKey === 'password' && (
				<Text style={[styles.legalText, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>
					{t('auth.register.actions.legal')}
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
					<Text style={skipLinkText}>{t('common.actions.notNow')}</Text>
				</QPPressable>
			)}

			{stepKey === 'phoneCode' && (
				<>
					<QPButton
						title={resendDisabled ? countdownLabel : t('auth.register.actions.resendCode')}
						onPress={() => onSendPhoneCode(true)}
						disabled={resendDisabled}
						style={{ backgroundColor: theme.colors.surface }}
						textStyle={{ color: theme.colors.primaryText }}
					/>
					<QPPressable variant="opacity" onPress={onSkipPhone} style={styles.skipLink}>
						<Text style={skipLinkText}>{t('auth.register.actions.skipForNow')}</Text>
					</QPPressable>
				</>
			)}

			{stepKey === 'kyc' && !kycOpened && (
				<QPPressable variant="opacity" onPress={onKycContinue} style={styles.skipLink}>
					<Text style={skipLinkText}>{t('common.actions.notNow')}</Text>
				</QPPressable>
			)}

			{stepKey === 'push' && (
				<QPPressable variant="opacity" onPress={onSkipPush} style={styles.skipLink}>
					<Text style={skipLinkText}>{t('common.actions.notNow')}</Text>
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
