import { Modal, View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from 'react-native'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from './particles/QPButton'

// Helper
import { openStore, markPromptShown } from '../helpers/versionCheck'

/**
 * "New version available" modal driven by `helpers/versionCheck` from
 * AppNavigator/Home. Standard centered-card overlay (transparent + fade +
 * statusBarTranslucent, backdrop tap dismisses; inner Pressable swallows
 * taps). Both paths — update and "Ahora no" — call `markPromptShown()` so the
 * prompt respects its cooldown; updating then deep-links to the App Store or
 * Google Play via `openStore`.
 *
 * @param {object} props
 * @param {boolean} props.visible - Controls modal visibility.
 * @param {string} props.currentVersion - Installed app version.
 * @param {string} props.latestVersion - Store version being offered.
 * @param {string} props.storeUrl - Platform store URL passed to `openStore`.
 * @param {() => void} props.onDismiss - Hides the modal (called on both paths).
 */
const UpdatePromptModal = ({ visible, currentVersion, latestVersion, storeUrl, onDismiss }) => {

	const { theme, styles: themeStyles } = useTheme()
	const textStyles = createTextStyles(theme)
	const { height: windowHeight } = useWindowDimensions()

	const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play'

	const handleUpdate = async () => {
		await markPromptShown()
		await openStore(storeUrl)
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
						Nueva versión disponible
					</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', lineHeight: 22, marginBottom: 12 }]}>
						La versión {latestVersion} ya está disponible en {storeName}. Actualiza para disfrutar las últimas mejoras y correcciones.
					</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', fontSize: theme.typography.fontSize.xs, marginBottom: 20 }]}>
						Tu versión actual: {currentVersion}
					</Text>
					<QPButton
						title="Actualizar ahora"
						onPress={handleUpdate}
						style={{ backgroundColor: theme.colors.primary, marginBottom: 8 }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
					<QPButton
						title="Ahora no"
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
