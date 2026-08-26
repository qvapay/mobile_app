import { Modal, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from './particles/QPButton'

type PushPromptModalProps = {
	visible: boolean
	onAccept: () => void
	onDismiss: () => void
}

/**
 * Soft pre-permission prompt for push notifications, shown at high-intent
 * moments (after onboarding, after a successful send) via `usePushPrompt`
 * before the real OneSignal/OS permission dialog. Standard centered-card
 * overlay (transparent + fade). Android back button counts as a dismiss.
 *
 * @param props
 * @param props.visible - Controls modal visibility.
 * @param props.onAccept - Proceed to the native notification permission request.
 * @param props.onDismiss - "Ahora no" / back button handler.
 */
const PushPromptModal = ({ visible, onAccept, onDismiss }: PushPromptModalProps) => {

	const { t } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
			<View style={themeStyles.container.modalOverlay}>
				<View style={themeStyles.container.modalCard}>
					<FontAwesome6 name="bell" size={40} color={theme.colors.primary} iconStyle="solid" style={{ alignSelf: 'center', marginBottom: 16 }} />
					<Text style={[textStyles.h3, { textAlign: 'center', marginBottom: 8 }]}>
						{t('ui.pushPrompt.title')}
					</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 20 }]}>
						{t('ui.pushPrompt.body')}
					</Text>
					<QPButton
						title={t('ui.pushPrompt.enable')}
						onPress={onAccept}
						style={{ backgroundColor: theme.colors.primary, marginBottom: 8 }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
					<QPButton
						title={t('common.actions.notNow')}
						onPress={onDismiss}
						style={{ backgroundColor: 'transparent' }}
						textStyle={{ color: theme.colors.secondaryText }}
					/>
				</View>
			</View>
		</Modal>
	)
}

export default PushPromptModal
