import { useState, useRef, useEffect, useReducer } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, {
	interpolateColor,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from 'react-native-reanimated'

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

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'
import QPCodeInput from '../../ui/particles/QPCodeInput'
import QPPressable from '../../ui/particles/QPPressable'
import QPKeyboardView from '../../ui/QPKeyboardView'

// Country picker (mismo del panel de teléfono en Settings)
import CountryPickerModal from '../../screens/settings/subpanels/CountryPickerModal'
import { countries } from '../../labels/countries'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Notifications
import { toast } from 'sonner-native'

// Un dato por pantalla, estilo fintech: el orden es el del flow
const STEPS = ['name', 'email', 'password', 'emailPin', 'phone', 'phoneCode']

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

// Barra de progreso del wizard — el fill avanza con spring
const ProgressBar = ({ progress, theme }) => {
	const fill = useSharedValue(progress)
	useEffect(() => {
		fill.value = withSpring(progress, { mass: 0.6, damping: 18, stiffness: 160 })
	}, [progress, fill])
	const animatedStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }))
	return (
		<View style={[styles.progressTrack, { backgroundColor: theme.colors.surface }]}>
			<Animated.View style={[styles.progressFill, { backgroundColor: theme.colors.primary }, animatedStyle]} />
		</View>
	)
}

// Regla de contraseña con check animado
const PasswordRule = ({ ok, label, theme }) => {
	const progress = useSharedValue(ok ? 1 : 0)
	useEffect(() => {
		progress.value = withTiming(ok ? 1 : 0, { duration: 220 })
	}, [ok, progress])
	const circleStyle = useAnimatedStyle(() => ({
		backgroundColor: interpolateColor(progress.value, [0, 1], ['transparent', theme.colors.success]),
		borderColor: interpolateColor(progress.value, [0, 1], [theme.colors.border, theme.colors.success]),
	}))
	return (
		<View style={styles.ruleRow}>
			<Animated.View style={[styles.ruleCircle, circleStyle]}>
				{ok && <FontAwesome6 name="check" size={10} color={theme.colors.background} iconStyle="solid" />}
			</Animated.View>
			<Text style={{ color: ok ? theme.colors.primaryText : theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>
				{label}
			</Text>
		</View>
	)
}

// Register Screen — wizard paso a paso
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

	// Form state
	const [form, dispatch] = useReducer(formReducer, initialForm)
	const { name, lastname, email, password, invite, phone, country } = form
	const setField = (field) => (value) => dispatch({ type: 'set', field, value })

	// Verification codes (email PIN + Telegram phone code)
	const [emailPin, setEmailPin] = useState('')
	const [phoneCode, setPhoneCode] = useState('')

	// UI state
	const [isLoading, setIsLoading] = useState(false)
	const [showInvite, setShowInvite] = useState(false)
	const [showCountryPicker, setShowCountryPicker] = useState(false)
	const [countrySearch, setCountrySearch] = useState('')

	// La sesión silenciosa (accessToken + me) vive aquí entre la verificación del
	// email y el final del flow — nunca se renderiza
	const sessionRef = useRef(null)
	const verifyingRef = useRef(false)
	const finishingRef = useRef(false)
	const lastnameInputRef = useRef(null)

	// Resend countdown for the phone code
	const { label: countdownLabel, isDisabled: resendDisabled, start: startCountdown } = usePinCountdown()

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
	useEffect(() => {
		const unsubscribe = navigation.addListener('beforeRemove', (e) => {
			const type = e.data.action.type
			if (type !== 'POP' && type !== 'GO_BACK') return
			if (stepKey === 'email' || stepKey === 'password') {
				e.preventDefault()
				goTo(step - 1)
			} else if (stepKey === 'phone') {
				e.preventDefault()
				finish()
			} else if (stepKey === 'phoneCode') {
				e.preventDefault()
				goTo(STEPS.indexOf('phone'))
			}
		})
		return unsubscribe
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [navigation, step])

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
				finish()
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

	// Completar la sesión guardada → isAuthenticated flipea y la app entra sola
	// a MainStack (useAppNavigation reconcilia). Sin sesión, fallback a Login.
	const finish = async () => {
		if (finishingRef.current) return
		finishingRef.current = true
		if (sessionRef.current) {
			setIsLoading(true)
			await completeSession({ ...sessionRef.current, email: email.trim() })
		} else {
			navigation.navigate(ROUTES.LOGIN_SCREEN)
		}
	}

	// Auto-submit del PIN de email al completar los 4 dígitos
	useEffect(() => {
		if (stepKey === 'emailPin' && emailPin.length === 4) { handleVerifyEmailPin() }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [emailPin])

	// Auto-submit del código de teléfono al completar los 6 dígitos
	useEffect(() => {
		if (stepKey === 'phoneCode' && phoneCode.length === 6) { handleVerifyPhoneCode() }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phoneCode])

	// Bottom actions per step
	const renderActions = () => {
		switch (stepKey) {
			case 'name':
				return (
					<QPButton
						title="Continuar"
						onPress={() => goTo(STEPS.indexOf('email'))}
						disabled={!nameValid}
						textStyle={{ color: theme.colors.buttonText }}
					/>
				)
			case 'email':
				return (
					<QPButton
						title="Continuar"
						onPress={() => goTo(STEPS.indexOf('password'))}
						disabled={!emailValid}
						textStyle={{ color: theme.colors.buttonText }}
					/>
				)
			case 'password':
				return (
					<>
						<Text style={[styles.legalText, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>
							Al crear tu cuenta aceptas los Términos y Condiciones y la Política de Privacidad de QvaPay
						</Text>
						<QPButton
							title="Crear cuenta"
							onPress={handleRegister}
							disabled={!passwordValid}
							loading={isLoading}
							textStyle={{ color: theme.colors.buttonText }}
						/>
					</>
				)
			case 'emailPin':
				return (
					<QPButton
						title="Verificar"
						onPress={handleVerifyEmailPin}
						disabled={emailPin.length !== 4}
						loading={isLoading}
						textStyle={{ color: theme.colors.buttonText }}
					/>
				)
			case 'phone':
				return (
					<>
						<QPButton
							title="Enviar código"
							onPress={() => handleSendPhoneCode(false)}
							disabled={phone.trim().length < 7}
							loading={isLoading}
							textStyle={{ color: theme.colors.buttonText }}
						/>
						<QPPressable variant="opacity" onPress={finish} style={styles.skipLink}>
							<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
								Ahora no
							</Text>
						</QPPressable>
					</>
				)
			case 'phoneCode':
				return (
					<>
						<QPButton
							title="Verificar teléfono"
							onPress={handleVerifyPhoneCode}
							disabled={phoneCode.length !== 6}
							loading={isLoading}
							textStyle={{ color: theme.colors.buttonText }}
						/>
						<QPButton
							title={resendDisabled ? countdownLabel : 'Reenviar código'}
							onPress={() => handleSendPhoneCode(true)}
							disabled={resendDisabled}
							style={{ backgroundColor: theme.colors.surface }}
							textStyle={{ color: theme.colors.primaryText }}
						/>
						<QPPressable variant="opacity" onPress={finish} style={styles.skipLink}>
							<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
								Omitir por ahora
							</Text>
						</QPPressable>
					</>
				)
			default:
				return null
		}
	}

	return (
		<>
			<QPKeyboardView actions={renderActions()}>

				{/* Progreso del wizard */}
				<ProgressBar progress={(step + 1) / STEPS.length} theme={theme} />

				{/* ¿Cómo te llamas? */}
				{stepKey === 'name' && (
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
								onSubmitEditing={() => { if (nameValid) goTo(STEPS.indexOf('email')) }}
							/>
						</Animated.View>
						<Animated.View entering={makeStepEnter(170)} style={styles.loginLink}>
							<Text style={{ textAlign: 'center', color: theme.colors.primaryText }}>
								¿Ya tienes una cuenta?{' '}
								<Text style={{ color: theme.colors.primary }} onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)}>
									Inicia sesión
								</Text>
							</Text>
						</Animated.View>
					</View>
				)}

				{/* Tu correo electrónico */}
				{stepKey === 'email' && (
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
								onSubmitEditing={() => { if (emailValid) goTo(STEPS.indexOf('password')) }}
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
								<QPPressable variant="opacity" onPress={() => setShowInvite(true)} style={styles.inviteLink}>
									<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
										¿Tienes un código de invitación?
									</Text>
								</QPPressable>
							)}
						</Animated.View>
					</View>
				)}

				{/* Crea tu contraseña */}
				{stepKey === 'password' && (
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
				)}

				{/* Revisa tu correo */}
				{stepKey === 'emailPin' && (
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
				)}

				{/* Añade tu teléfono */}
				{stepKey === 'phone' && (
					<View key="step-phone" style={styles.stepContainer}>
						<Animated.View entering={makeStepEnter(0)}>
							<Text style={textStyles.h1}>Añade tu teléfono</Text>
						</Animated.View>
						<Animated.View entering={makeStepEnter(50)}>
							<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Opcional — te ayuda a recuperar tu cuenta y a que tus contactos te encuentren</Text>
						</Animated.View>
						<Animated.View entering={makeStepEnter(110)} style={styles.fieldsBlock}>
							<View style={styles.phoneRow}>
								<QPPressable
									style={[styles.countryChip, { backgroundColor: theme.colors.surface }]}
									onPress={() => setShowCountryPicker(true)}
								>
									<Text style={{ color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.medium }}>
										{countryData?.dial_code || '+53'}
									</Text>
									<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
								</QPPressable>
								<View style={styles.phoneInputWrap}>
									<QPInput
										placeholder="Número de teléfono"
										value={phone}
										onChangeText={setField('phone')}
										keyboardType="phone-pad"
										textContentType="telephoneNumber"
										autoComplete="tel"
										autoFocus
										style={{ marginVertical: 0 }}
									/>
								</View>
							</View>
						</Animated.View>
						<Animated.View entering={makeStepEnter(170)} style={styles.infoRow}>
							<FontAwesome6 name="paper-plane" size={14} color={theme.colors.primary} iconStyle="solid" />
							<Text style={{ flex: 1, color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>
								El código de verificación llegará por Telegram al número que indiques
							</Text>
						</Animated.View>
					</View>
				)}

				{/* Código de verificación del teléfono */}
				{stepKey === 'phoneCode' && (
					<View key="step-phoneCode" style={styles.stepContainer}>
						<Animated.View entering={makeStepEnter(0)} style={styles.iconBlock}>
							<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
								<FontAwesome6 name="paper-plane" size={32} color={theme.colors.primary} iconStyle="solid" />
							</View>
						</Animated.View>
						<Animated.View entering={makeStepEnter(50)}>
							<Text style={[textStyles.h1, styles.centeredText]}>Revisa tu Telegram</Text>
						</Animated.View>
						<Animated.View entering={makeStepEnter(100)}>
							<Text style={[textStyles.h3, styles.centeredText, { color: theme.colors.secondaryText }]}>
								Enviamos un código de 6 dígitos a{'\n'}
								<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }}>{countryData?.dial_code} {phone.trim()}</Text>
							</Text>
						</Animated.View>
						<Animated.View entering={makeStepEnter(160)} style={styles.fieldsBlock}>
							<QPCodeInput length={6} code={phoneCode} onChangeCode={setPhoneCode} autoFocus disabled={isLoading} />
						</Animated.View>
					</View>
				)}

			</QPKeyboardView>

			{/* Country Picker Modal */}
			<CountryPickerModal
				visible={showCountryPicker}
				country={country}
				countrySearch={countrySearch}
				onChangeSearch={setCountrySearch}
				onSelect={(code) => { dispatch({ type: 'set', field: 'country', value: code }); setShowCountryPicker(false); setCountrySearch('') }}
				onClose={() => { setShowCountryPicker(false); setCountrySearch('') }}
				theme={theme}
				textStyles={textStyles}
			/>
		</>
	)
}

const styles = StyleSheet.create({
	progressTrack: {
		height: 4,
		borderRadius: 2,
		overflow: 'hidden',
		marginTop: 8,
		marginBottom: 24,
	},
	progressFill: {
		height: 4,
		borderRadius: 2,
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
	phoneRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	countryChip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		height: 50,
		paddingHorizontal: 14,
		borderRadius: 10,
	},
	phoneInputWrap: {
		flex: 1,
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

export default RegisterScreen
