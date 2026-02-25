import { Modal, View, Text, StyleSheet } from 'react-native'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from './particles/QPButton'

const PushPromptModal = ({ visible, onAccept, onDismiss }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
			<View style={styles.overlay}>
				<View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
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
		borderRadius: 16,
		padding: 24,
	},
})

export default PushPromptModal
