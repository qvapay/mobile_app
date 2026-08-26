import { Modal, View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from './particles/QPButton'

// Helper
import { openStore, markPromptShown } from '../helpers/versionCheck'

type UpdatePromptModalProps = {
	visible: boolean
	currentVersion?: string
	latestVersion?: string
	storeUrl?: string
	onDismiss: () => void
}

/**
 * "New version available" modal driven by `helpers/versionCheck` from
 * AppNavigator/Home. Standard centered-card overlay (transparent + fade +
 * statusBarTranslucent, backdrop tap dismisses; inner Pressable swallows
 * taps). Both paths — update and "Ahora no" — call `markPromptShown()` so the
 * prompt respects its cooldown; updating then deep-links to the App Store or
 * Google Play via `openStore`.
 *
 * @param props
 * @param props.visible - Controls modal visibility.
 * @param [props.currentVersion] - Installed app version (absent until the check resolves).
 * @param [props.latestVersion] - Store version being offered.
 * @param [props.storeUrl] - Platform store URL passed to `openStore`.
 * @param props.onDismiss - Hides the modal (called on both paths).
 */
const UpdatePromptModal = ({ visible, currentVersion, latestVersion, storeUrl, onDismiss }: UpdatePromptModalProps) => {

	const { t } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const textStyles = createTextStyles(theme)
	const { height: windowHeight } = useWindowDimensions()

	const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play'

	const handleUpdate = async () => {
		await markPromptShown()
		// Cast local: openStore declara `url: string` en su JSDoc pero guarda
		// internamente el caso vacío (`if (url)`) — undefined es seguro
		await openStore(storeUrl as string)
		onDismiss()
	}

	const handleDismiss = async () => {
		await markPromptShown()
		onDismiss()
	}

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleDismiss}>
			<Pressable style={themeStyles.container.modalOverlay} onPress={handleDismiss}>
				<Pressable style={[themeStyles.container.modalCard, { maxHeight: windowHeight * 0.75 }]} onPress={() => { }}>
					<View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '20' }]}>
						<FontAwesome6 name="circle-arrow-up" size={36} color={theme.colors.primary} iconStyle="solid" />
					</View>
					<Text style={[textStyles.h3, { textAlign: 'center', marginBottom: 8 }]}>
						{t('ui.updatePrompt.title')}
					</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', lineHeight: 22, marginBottom: 12 }]}>
						{t('ui.updatePrompt.body', { latestVersion, storeName })}
					</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', fontSize: theme.typography.fontSize.xs, marginBottom: 20 }]}>
						{t('ui.updatePrompt.currentVersion', { currentVersion })}
					</Text>
					<QPButton
						title={t('ui.updatePrompt.updateNow')}
						onPress={handleUpdate}
						style={{ backgroundColor: theme.colors.primary, marginBottom: 8 }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
					<QPButton
						title={t('common.actions.notNow')}
						onPress={handleDismiss}
						style={{ backgroundColor: 'transparent' }}
						textStyle={{ color: theme.colors.secondaryText }}
					/>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	iconWrap: {
		width: 72,
		height: 72,
		borderRadius: 36,
		justifyContent: 'center',
		alignItems: 'center',
		alignSelf: 'center',
		marginBottom: 16,
	},
})

export default UpdatePromptModal
