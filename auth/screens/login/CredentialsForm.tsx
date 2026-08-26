import { useTranslation } from 'react-i18next'

import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import type { Theme } from '../../../theme/ThemeContext'

type CredentialsFormProps = {
	email: string
	password: string
	onChangeEmail: (value: string) => void
	onChangePassword: (value: string) => void
	onRestorePassword: () => void
	theme: Theme
}

// Email + password inputs and the "restore password" link.
const CredentialsForm = ({ email, password, onChangeEmail, onChangePassword, onRestorePassword, theme }: CredentialsFormProps) => {

	const { t } = useTranslation()

	return (
		<>
			<QPInput
				placeholder={t('auth.fields.emailExamplePlaceholder')}
				value={email}
				onChangeText={onChangeEmail}
				keyboardType="email-address"
				autoCapitalize="none"
				prefixIconName="envelope"
				textContentType="emailAddress"
				autoComplete="email"
			/>

			<QPInput
				placeholder={t('auth.fields.passwordPlaceholder')}
				value={password}
				onChangeText={onChangePassword}
				secureTextEntry
				prefixIconName="lock"
				suffixIconName="eye"
				textContentType="password"
				autoComplete="password"
			/>

			<QPButton
				title={t('auth.login.restorePassword')}
				// backgroundColor null anula el fondo por defecto de QPButton (RN no
				// tipa null como ColorValue) — cast local, runtime intacto
				style={{ backgroundColor: null as unknown as undefined }}
				textStyle={{ color: theme.colors.primary }}
				onPress={onRestorePassword}
			/>
		</>
	)
}

export default CredentialsForm
