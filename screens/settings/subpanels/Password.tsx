import { Text, View } from 'react-native'
import { useState, useReducer } from 'react'
import { useTranslation } from 'react-i18next'

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

// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

/** Los tres campos de contraseña como una unidad. */
type PasswordForm = { currentPassword: string, newPassword: string, confirmPassword: string }

type PasswordFormAction =
	| { type: 'set', field: keyof PasswordForm, value: string }
	| { type: 'reset' }

// The three password inputs form one logical unit
const initialForm: PasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

function formReducer(state: PasswordForm, action: PasswordFormAction): PasswordForm {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		case 'reset':
			return initialForm
		default:
			return state
	}
}

// Password Change Component
const Password = () => {

	// Contexts
	const { t } = useTranslation()
	const { theme } = useTheme()
	const { updateSettings } = useSettings()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	// Password form state
	const [form, dispatch] = useReducer(formReducer, initialForm)

	// Loading state
	const [isLoading, setIsLoading] = useState(false)

	// Button is enabled once both new passwords are filled and match — derive it, don't store it
	const canSubmit = form.newPassword && form.confirmPassword && form.newPassword === form.confirmPassword

	// Handle submit
	const handleSubmit = async () => {
		try {
			setIsLoading(true)
			const result = await userApi.changePassword({
				old_password: form.currentPassword,
				new_password: form.newPassword
			})
			if (result.success) {
				dispatch({ type: 'reset' })
				toast.success(t('settings.password.toasts.changed'))
				// Invalidate biometric credentials since password changed
				const has = await hasBiometricCredentials()
				if (has) {
					await removeBiometricCredentials()
					await updateSettings('security', { biometricsEnabled: false })
					toast.info(t('settings.password.toasts.biometricsDisabled'), { description: t('settings.password.toasts.biometricsDisabledDescription') })
				}
			}
		} catch (error) { toast.error(t('settings.password.toasts.changeFailed'), { description: (error as Error).message }) }
		finally { setIsLoading(false) }
	}

	return (
		<QPKeyboardView
			actions={
				<QPButton
					title={t('settings.password.submitButton')}
					onPress={handleSubmit}
					disabled={!canSubmit || isLoading}
					style={{ backgroundColor: !canSubmit ? theme.colors.secondaryText : theme.colors.primary }}
					textStyle={{ color: theme.colors.almostWhite }}
					loading={isLoading}
				/>
			}
		>

			<Text style={textStyles.h1}>{t('settings.password.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.password.subtitle')}</Text>

			<View style={{ flex: 1, marginVertical: 20 }}>

				{/* Current Password */}
				<QPInput
					placeholder={t('settings.password.placeholders.current')}
					value={form.currentPassword}
					onChangeText={(value) => dispatch({ type: 'set', field: 'currentPassword', value })}
					prefixIconName="lock"
					autoCapitalize="none"
					secureTextEntry
				/>

				{/* New Password */}
				<QPInput
					placeholder={t('settings.password.placeholders.new')}
					value={form.newPassword}
					onChangeText={(value) => dispatch({ type: 'set', field: 'newPassword', value })}
					prefixIconName="lock"
					autoCapitalize="none"
					secureTextEntry
				/>

				{/* Confirm New Password */}
				<QPInput
					placeholder={t('settings.password.placeholders.confirm')}
					value={form.confirmPassword}
					onChangeText={(value) => dispatch({ type: 'set', field: 'confirmPassword', value })}
					prefixIconName="lock"
					autoCapitalize="none"
					secureTextEntry
				/>

				{/* Password requirements */}
				<View style={[containerStyles.card, { marginTop: 10 }]}>
					<Text style={[textStyles.h4, { marginBottom: 12 }]}>
						{t('settings.password.requirementsTitle')}
					</Text>
					{([
						{ icon: 'text-width', text: t('settings.password.requirements.minLength') },
						{ icon: 'font', text: t('settings.password.requirements.uppercase') },
						{ icon: 'hashtag', text: t('settings.password.requirements.number') },
					] as { icon: FontAwesome6SolidIconName, text: string }[]).map((req, index) => (
						<View key={req.text} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: index < 2 ? 10 : 0 }}>
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
							{t('settings.password.securityTip')}
						</Text>
					</View>
				</View>
			</View>

		</QPKeyboardView>
	)
}

export default Password
