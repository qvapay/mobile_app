import { Modal, View, Text, Pressable, StyleSheet, Platform, Dimensions } from 'react-native'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from './particles/QPButton'

// Helper
import { openStore, markPromptShown } from '../helpers/versionCheck'

const { height: windowHeight } = Dimensions.get('window')

const UpdatePromptModal = ({ visible, currentVersion, latestVersion, storeUrl, onDismiss }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

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
			<Pressable style={styles.overlay} onPress={handleDismiss}>
				<Pressable style={[styles.container, { backgroundColor: theme.colors.surface }]} onPress={() => { }}>
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
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	container: {
		width: '100%',
		maxHeight: windowHeight * 0.75,
		borderRadius: 16,
		padding: 24,
	},
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
