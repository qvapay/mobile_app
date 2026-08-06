import { Modal, View, Text } from 'react-native'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from './particles/QPButton'

/**
 * Soft pre-permission prompt for push notifications, shown at high-intent
 * moments (after onboarding, after a successful send) via `usePushPrompt`
 * before the real OneSignal/OS permission dialog. Standard centered-card
 * overlay (transparent + fade). Android back button counts as a dismiss.
 *
 * @param {object} props
 * @param {boolean} props.visible - Controls modal visibility.
 * @param {() => void} props.onAccept - Proceed to the native notification permission request.
 * @param {() => void} props.onDismiss - "Ahora no" / back button handler.
 */
const PushPromptModal = ({ visible, onAccept, onDismiss }) => {

	const { theme, styles: themeStyles } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
			<View style={themeStyles.container.modalOverlay}>
				<View style={themeStyles.container.modalCard}>
					<FontAwesome6 name="bell" size={40} color={theme.colors.primary} iconStyle="solid" style={{ alignSelf: 'center', marginBottom: 16 }} />
					<Text style={[textStyles.h3, { textAlign: 'center', marginBottom: 8 }]}>
						No te pierdas ningún pago
					</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 20 }]}>
						Activa las notificaciones para saber al instante cuando recibes dinero, cuando tus ofertas P2P tienen respuesta y más.
					</Text>
					<QPButton
						title="Activar notificaciones"
						onPress={onAccept}
						style={{ backgroundColor: theme.colors.primary, marginBottom: 8 }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
					<QPButton
						title="Ahora no"
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
