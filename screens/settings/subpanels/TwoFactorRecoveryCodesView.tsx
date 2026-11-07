import { Share, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPKeyboardView from '../../../ui/QPKeyboardView'

// Clipboard
import { copyTextToClipboard } from '../../../helpers'

type Props = {
	codes: string[]
	onDone: () => void
}

/**
 * Los códigos de recuperación recién emitidos. El servidor los da una sola vez, así que
 * se enseñan al activar el 2FA y se salen de aquí solo a propósito. «Guardar» abre la hoja
 * del sistema: desde ella van a Archivos, Notas o un gestor de contraseñas.
 */
const TwoFactorRecoveryCodesView = ({ codes, onDone }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const text = codes.join('\n')

	const handleCopy = () => {
		copyTextToClipboard(text)
		toast.success(t('settings.twoFactor.toasts.copiedTitle'), { description: t('settings.twoFactor.recovery.copied') })
	}

	return (
		<QPKeyboardView
			actions={
				<QPButton
					title={t('settings.twoFactor.recovery.doneButton')}
					onPress={onDone}
					textStyle={{ color: theme.colors.almostWhite }}
					testID="two-factor-recovery-done"
				/>
			}
		>
			<Text style={textStyles.h1}>{t('settings.twoFactor.recovery.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.twoFactor.recovery.subtitle')}</Text>

			<View style={[containerStyles.card, { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20 }]}>
				{codes.map((code) => (
					<Text key={code} selectable style={[textStyles.body, { width: '50%', paddingVertical: 6, textAlign: 'center', color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.mono }]}>
						{code}
					</Text>
				))}
			</View>

			<View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
				<QPButton
					title={t('common.actions.copy')}
					onPress={handleCopy}
					style={{ flex: 1, backgroundColor: theme.colors.surface }}
					textStyle={{ color: theme.colors.primaryText }}
				/>
				<QPButton
					title={t('common.actions.save')}
					onPress={() => Share.share({ message: text })}
					style={{ flex: 1, backgroundColor: theme.colors.surface }}
					textStyle={{ color: theme.colors.primaryText }}
				/>
			</View>
		</QPKeyboardView>
	)
}

export default TwoFactorRecoveryCodesView
