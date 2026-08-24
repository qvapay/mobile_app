import { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Routes
// import { ROUTES } from '../../routes'

// UI
import QPKeyboardView from '../../ui/QPKeyboardView'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPInput from '../../ui/particles/QPInput'

// API
import { authApi } from '../../api/authApi'

// Email validation function
const validateEmail = (value) => {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	return emailRegex.test(value)
}

/**
 * Password recovery: requests a reset email via `POST /auth/reset-password`.
 * Expects `route.params.email` to prefill the field from the login form.
 * On success the action button swaps to a "back to login" one — the actual
 * reset happens through the link in the email, not in the app.
 */
const RecoverPasswordScreen = ({ navigation, route }) => {

	// Idioma activo
	const { t } = useTranslation()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// States
	const [email, setEmail] = useState(route.params.email || '')
	const [emailError, setEmailError] = useState('')
	const [successMessage, setSuccessMessage] = useState('')

	// Loading state
	const [isLoading, setIsLoading] = useState(false)

	// Handle restore password
	const handleRestorePassword = async () => {

		// Clear previous errors and success message
		setEmailError('')
		setSuccessMessage('')

		// Validate email
		if (!email.trim()) {
			setEmailError(t('auth.recoverPassword.errors.emailRequired'))
			return
		}

		if (!validateEmail(email.trim())) {
			setEmailError(t('auth.recoverPassword.errors.emailInvalid'))
			return
		}

		setIsLoading(true)

		try {
			const result = await authApi.resetPassword({ email: email.trim() })

			if (result.success) {
				setSuccessMessage(t('auth.recoverPassword.success'))
			} else { setEmailError(result.error || t('auth.recoverPassword.errors.requestFailed')) }

		} catch (err) {
			setEmailError(t('auth.recoverPassword.errors.unexpected'))
		} finally { setIsLoading(false) }
	}

	return (

		<QPKeyboardView
			actions={
				successMessage ? (
					<QPButton
						title={t('auth.recoverPassword.backToLogin')}
						onPress={() => navigation.goBack()}
						style={{ backgroundColor: theme.colors.primary, marginTop: 10 }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
				) : (
					<QPButton
						title={t('auth.recoverPassword.submit')}
						onPress={handleRestorePassword}
						style={{ backgroundColor: theme.colors.danger }}
						textStyle={{ color: theme.colors.almostWhite }}
						loading={isLoading}
					/>
				)
			}
		>

			<Text style={textStyles.h1}>{t('auth.recoverPassword.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('auth.recoverPassword.subtitle')}</Text>

			<View style={styles.formContainer}>

				<QPInput
					placeholder={t('auth.recoverPassword.emailPlaceholder')}
					autoComplete="email"
					value={email}
					onChangeText={(text) => {
						setEmail(text)
						if (emailError) setEmailError('')
					}}
					keyboardType="email-address"
					autoCapitalize="none"
					prefixIconName="envelope"
				/>

				{emailError ? (
					<Text style={[textStyles.error, { marginTop: 5, marginLeft: 5 }]}>
						{emailError}
					</Text>
				) : null}

				{successMessage ? (
					<View style={[styles.successContainer, { backgroundColor: theme.colors.successFill + '20', borderColor: theme.colors.success }]}>
						<Text style={[textStyles.caption, { color: theme.colors.successText, textAlign: 'center' }]}>
							{successMessage}
						</Text>
					</View>
				) : null}

			</View>

		</QPKeyboardView>
	)
}

const styles = StyleSheet.create({
	formContainer: {
		flex: 1,
		marginVertical: 20
	},
	successContainer: {
		marginTop: 15,
		padding: 15,
		borderRadius: 10,
		borderWidth: 1,
	},
})

export default RecoverPasswordScreen