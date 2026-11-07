import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useTextStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPInput from '../../../ui/particles/QPInput'
import QPKeyboardView from '../../../ui/QPKeyboardView'

type Props = {
	code: string
	onChangeCode: (code: string) => void
	onConfirm: () => void
	onCancel: () => void
	isLoading?: boolean
}

/**
 * Desactivar el 2FA exige demostrar el factor. El campo usa teclado completo porque
 * también acepta un código de recuperación (`XXXX-XXXX`), que es la salida de quien
 * perdió la app autenticadora.
 */
const TwoFactorDeactivateView = ({ code, onChangeCode, onConfirm, onCancel, isLoading }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	return (
		<QPKeyboardView
			actions={
				<>
					<QPButton
						title={t('settings.twoFactor.deactivate.confirmButton')}
						onPress={onConfirm}
						loading={isLoading}
						disabled={isLoading || code.trim().length < 6}
						danger
						testID="two-factor-deactivate-confirm"
					/>
					<QPButton
						title={t('common.actions.cancel')}
						onPress={onCancel}
						disabled={isLoading}
						style={{ backgroundColor: theme.colors.surface }}
						textStyle={{ color: theme.colors.primaryText }}
					/>
				</>
			}
			actionsContainerStyle={{ gap: 10 }}
		>
			<Text style={textStyles.h1}>{t('settings.twoFactor.deactivate.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText, marginBottom: 20 }]}>{t('settings.twoFactor.deactivate.body')}</Text>

			<QPInput
				prelabel={t('settings.twoFactor.deactivate.codeLabel')}
				value={code}
				onChangeText={(text) => onChangeCode(text.replace(/\s/g, '').toUpperCase().slice(0, 32))}
				autoCapitalize="characters"
				autoCorrect={false}
				autoComplete="one-time-code"
				textContentType="oneTimeCode"
				prefixIconName="key"
				testID="two-factor-deactivate-code"
			/>
		</QPKeyboardView>
	)
}

export default TwoFactorDeactivateView
