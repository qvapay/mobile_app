import { useTranslation } from 'react-i18next'

import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'

// Email + password inputs and the "restore password" link.
const CredentialsForm = ({ email, password, onChangeEmail, onChangePassword, onRestorePassword, theme }) => {

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
				style={{ backgroundColor: null }}
				textStyle={{ color: theme.colors.primary }}
				onPress={onRestorePassword}
			/>
		</>
	)
}

export default CredentialsForm
