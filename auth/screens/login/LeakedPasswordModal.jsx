import { View, Text, Modal, StyleSheet } from 'react-native'

import QPButton from '../../../ui/particles/QPButton'
import { createTextStyles } from '../../../theme/themeUtils'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Security-warning modal shown when the backend flags a leaked/compromised password.
// `state` is the leakedModal slice: { visible, blocked, message, count }.
const LeakedPasswordModal = ({ state, theme, onReset, onDismiss }) => {

	const textStyles = createTextStyles(theme)

	return (
		<Modal visible={state.visible} transparent animationType="fade" onRequestClose={state.blocked ? undefined : onDismiss}>
			<View style={styles.overlay}>
				<View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
					<FontAwesome6 name="shield-halved" size={40} color={state.blocked ? theme.colors.danger : theme.colors.warning} iconStyle="solid" style={{ alignSelf: 'center', marginBottom: 16 }} />
					<Text style={[textStyles.h3, { textAlign: 'center', marginBottom: 8 }]}>
						{state.blocked ? 'Contraseña Comprometida' : 'Alerta de Seguridad'}
					</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 8 }]}>
						{state.message}
					</Text>
					{state.count > 0 && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textAlign: 'center', marginBottom: 16 }]}>
							Esta contraseña ha sido vista en {state.count.toLocaleString()} filtración{state.count > 1 ? 'es' : ''} de datos.
						</Text>
					)}
					<QPButton
						title={state.blocked ? 'Restablecer Contraseña' : 'Cambiar contraseña'}
						onPress={onReset}
						style={{ backgroundColor: state.blocked ? theme.colors.danger : theme.colors.primary, marginBottom: 8 }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
					{!state.blocked && (
						<QPButton
							title="Ahora no"
							onPress={onDismiss}
							style={{ backgroundColor: 'transparent' }}
							textStyle={{ color: theme.colors.secondaryText }}
						/>
					)}
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

export default LeakedPasswordModal
