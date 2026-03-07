import { useState, useEffect } from 'react'
import { Text, View } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPKeyboardView from '../../../ui/QPKeyboardView'

// API
import { userApi } from '../../../api/userApi'
import { removeBiometricCredentials, hasBiometricCredentials } from '../../../api/client'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// Notifications
import { toast } from 'sonner-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Password Change Component
const Password = () => {

	// Contexts
	const { theme } = useTheme()
	const { updateSettings } = useSettings()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	// States
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [currentPassword, setCurrentPassword] = useState('')

	// Loading state
	const [isLoading, setIsLoading] = useState(false)
	const [isButtonDisabled, setIsButtonDisabled] = useState(true)

	// Handle submit
	const handleSubmit = async () => {
		try {
			setIsLoading(true)
			const result = await userApi.changePassword({
				old_password: currentPassword,
				new_password: password
			})
			if (result.success) {
				setCurrentPassword('')
				setPassword('')
				setConfirmPassword('')
				toast.success('Contraseña cambiada correctamente')
				// Invalidate biometric credentials since password changed
				const has = await hasBiometricCredentials()
				if (has) {
					await removeBiometricCredentials()
					await updateSettings('security', { biometricsEnabled: false })
					toast.info('Biometría desactivada', { description: 'Actívala de nuevo en tu próximo inicio de sesión' })
				}
			}
		} catch (error) { toast.error('Error al cambiar la contraseña', { description: error.message }) }
		finally { setIsLoading(false) }
	}

	// useEffect to disable QPButton until both new passwords are filled and match
	useEffect(() => {
		if (password && confirmPassword && password === confirmPassword) { setIsButtonDisabled(false) }
		else { setIsButtonDisabled(true) }
	}, [password, confirmPassword])

	return (
		<QPKeyboardView
			actions={
				<QPButton
					title="Cambiar contraseña"
					onPress={handleSubmit}
					disabled={isButtonDisabled || isLoading}
					style={{ backgroundColor: isButtonDisabled ? theme.colors.secondaryText : theme.colors.primary }}
					textStyle={{ color: theme.colors.almostWhite }}
					loading={isLoading}
				/>
			}
		>

			<Text style={textStyles.h1}>Cambiar contraseña</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Establece una nueva contraseña para tu cuenta</Text>

			<View style={{ flex: 1, marginVertical: 20 }}>

				{/* Current Password */}
				<QPInput
					placeholder="Contraseña actual"
					value={currentPassword}
					onChangeText={setCurrentPassword}
					prefixIconName="lock"
					autoCapitalize="none"
					secureTextEntry
				/>

				{/* New Password */}
				<QPInput
					placeholder="Nueva contraseña"
					value={password}
					onChangeText={setPassword}
					prefixIconName="lock"
					autoCapitalize="none"
					secureTextEntry
				/>

				{/* Confirm New Password */}
				<QPInput
					placeholder="Confirmar nueva contraseña"
					value={confirmPassword}
					onChangeText={setConfirmPassword}
					prefixIconName="lock"
					autoCapitalize="none"
					secureTextEntry
				/>

				{/* Password requirements */}
				<View style={[containerStyles.card, { marginTop: 10 }]}>
					<Text style={[textStyles.h4, { marginBottom: 12 }]}>
						Requisitos de contraseña:
					</Text>
					{[
						{ icon: 'text-width', text: 'Mínimo 8 caracteres' },
						{ icon: 'font', text: 'Al menos una letra mayúscula' },
						{ icon: 'hashtag', text: 'Al menos un número' },
					].map((req, index) => (
						<View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: index < 2 ? 10 : 0 }}>
							<FontAwesome6 name={req.icon} size={14} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12 }]}>
								{req.text}
							</Text>
						</View>
					))}
				</View>

				{/* Security tip */}
				<View style={[containerStyles.card, { marginTop: 10 }]}>
					<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
						<FontAwesome6 name="shield-halved" size={16} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
							Usa una contraseña única que no utilices en otros servicios. Si tienes biometría activa, se desactivará al cambiar la contraseña.
						</Text>
					</View>
				</View>
			</View>

		</QPKeyboardView>
	)
}

export default Password
