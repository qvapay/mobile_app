import { useState, useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'

// Auth Context
import { useAuth } from '../AuthContext'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'
import QPKeyboardView from '../../ui/QPKeyboardView'
import BouncyCheckbox from 'react-native-bouncy-checkbox'

// Notifications
import { toast } from 'sonner-native'

// Register Screen
const RegisterScreen = ({ navigation }) => {

	// Auth Context
	const { register, clearError, confirmRegistration } = useAuth()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// States
	const [isLoading, setIsLoading] = useState(false)
	const [uuid, setUuid] = useState('')
	const [name, setName] = useState('')
	const [lastname, setLastname] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [termsAccepted, setTermsAccepted] = useState(false)
	const [invite, setInvite] = useState('')

	// Pin State
	const [pinEnabled, setPinEnabled] = useState(false)
	const [pin, setPin] = useState('')
	const [requestPin, setRequestPin] = useState(false)

	// Handle registration
	const handleRegister = async () => {

		// Validation
		if (!name || !lastname || !email || !password || !confirmPassword) {
			toast.error('Por favor completa todos los campos')
			return
		}

		if (password !== confirmPassword) {
			toast.error('Las contraseñas no coinciden')
			return
		}

		if (password.length < 8) {
			toast.error('La contraseña debe tener al menos 8 caracteres')
			return
		}

		if (!termsAccepted) {
			toast.error('Debes aceptar los términos y condiciones')
			return
		}

		// Email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(email)) {
			toast.error('Por favor ingresa un email válido')
			return
		}

		try {

			clearError()
			setIsLoading(true)
			const result = await register({
				name,
				lastname,
				email,
				password,
				invite: invite.trim() || undefined,
				terms: termsAccepted
			})

			if (result.success) {
				setUuid(result.user.uuid)
				setRequestPin(true)
			}
			if (!result.success) { toast.error(result.error || 'No se pudo completar el registro') }

		} catch (err) {
			toast.error('Error de conexión, por favor intenta de nuevo')
		} finally { setIsLoading(false) }
	}

	// Handle PIN input
	useEffect(() => {
		if (pin.length === 4) {
			setPinEnabled(true)
		} else {
			setPinEnabled(false)
		}
	}, [pin])

	// Verify PIN
	const handleVerifyPin = async () => {

		if (!uuid || !pin || !email) {
			toast.error('Por favor completa todos los campos')
			return
		}

		try {
			setIsLoading(true)
			const result = await confirmRegistration({ uuid, pin, email })

			if (result.success) {
				navigation.navigate('Login')
			} else {
				toast.error(result.error || 'Error al verificar el PIN')
			}

		} catch (err) {
			toast.error('Error de conexión durante la verificación')
		} finally { setIsLoading(false) }
	}

	return (
		<QPKeyboardView
			actions={
				requestPin ? (
					<QPButton
						title="Verificar PIN"
						onPress={handleVerifyPin}
						disabled={!pinEnabled}
						textStyle={{ color: theme.colors.almostWhite }}
						loading={isLoading}
					/>
				) : (
					<QPButton
						title="Crear cuenta"
						onPress={handleRegister}
						disabled={!termsAccepted || !name || !lastname || !email || !password || !confirmPassword}
						textStyle={{ color: theme.colors.almostWhite }}
						loading={isLoading}
					/>
				)
			}
		>

			<Text style={textStyles.h1}>{requestPin ? 'Verificar PIN' : 'Crear cuenta'}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{requestPin ? 'Verifica el código que has recibido por correo electrónico' : 'Completa tus datos para crear tu cuenta'}</Text>

			<View style={styles.formContainer}>

				{requestPin ? (
					<>
						<QPInput
							placeholder="PIN"
							value={pin}
							onChangeText={setPin}
							keyboardType="numeric"
							autoCapitalize="none"
							prefixIconName="lock"
							maxLength={4}
							disabled={!pinEnabled}
							textContentType="oneTimeCode"
							autoComplete="sms-otp"
						/>
					</>
				) : (
					<>
						<QPInput
							placeholder="Nombre"
							value={name}
							onChangeText={setName}
							autoCapitalize="words"
							prefixIconName="user"
							textContentType="givenName"
							autoComplete="name"
						/>

						<QPInput
							placeholder="Apellidos"
							value={lastname}
							onChangeText={setLastname}
							autoCapitalize="words"
							prefixIconName="user"
							textContentType="familyName"
							autoComplete="name-family"
						/>

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
							placeholder="Código de referido (opcional)"
							value={invite}
							onChangeText={setInvite}
							autoCapitalize="none"
							prefixIconName="gift"
						/>

						<QPInput
							placeholder="Contraseña"
							value={password}
							onChangeText={setPassword}
							secureTextEntry
							prefixIconName="lock"
							suffixIconName="eye"
							textContentType="newPassword"
							autoComplete="password-new"
						/>

						<QPInput
							placeholder="Confirmar contraseña"
							value={confirmPassword}
							onChangeText={setConfirmPassword}
							secureTextEntry
							prefixIconName="lock"
							suffixIconName="eye"
							textContentType="newPassword"
							autoComplete="password-new"
						/>

						{/* Terms and Conditions Checkbox */}
						<View style={styles.termsContainer}>
							<BouncyCheckbox
								size={22}
								fillColor={theme.colors.primary}
								unFillColor={theme.colors.secondaryText}
								text="Al crear una cuenta, acepto los términos y condiciones de uso y privacidad de QvaPay"
								iconStyle={{ borderColor: theme.colors.primary }}
								innerIconStyle={{ borderWidth: 2 }}
								textStyle={{ color: theme.colors.secondaryText, textDecorationLine: 'none' }}
								onPress={() => setTermsAccepted(!termsAccepted)}
							/>
						</View>
					</>
				)}
			</View>

			{!requestPin && (
				<View style={styles.loginLink}>
					<Text style={{ textAlign: 'center', color: theme.colors.primaryText }}>
						¿Ya tienes una cuenta?{' '}
						<Text style={{ color: theme.colors.primary }} onPress={() => navigation.navigate('Login')} >
							Inicia sesión
						</Text>
					</Text>
				</View>
			)}

		</QPKeyboardView>
	)
}

const styles = StyleSheet.create({
	formContainer: {
		flex: 1,
		marginVertical: 20
	},
	loginLink: {
		marginVertical: 10,
		paddingHorizontal: 20,
	},
	termsContainer: {
		marginTop: 10,
		paddingHorizontal: 5,
		alignItems: 'center',
	},
})

export default RegisterScreen
