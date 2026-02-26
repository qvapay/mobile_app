import { Modal, View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from './particles/QPButton'

const PRIVACY_URL = 'https://qvapay.com/privacy'

const ContactsDisclosureModal = ({ visible, onAccept, onDecline }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
			<View style={styles.overlay}>
				<View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
					<FontAwesome6 name="address-book" size={40} color={theme.colors.primary} iconStyle="solid" style={{ alignSelf: 'center', marginBottom: 16 }} />
					<Text style={[textStyles.h3, { textAlign: 'center', marginBottom: 8 }]}>
						Acceso a tus contactos
					</Text>
					<ScrollView style={styles.scrollArea} bounces={false}>
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', lineHeight: 22 }]}>
							QvaPay recopila los números de teléfono de tu lista de contactos y los envía de forma segura a nuestros servidores para encontrar amigos y familiares que ya usan la app. Los números se utilizan únicamente para esta búsqueda y no se comparten con terceros.
						</Text>
					</ScrollView>
					<Pressable onPress={() => Linking.openURL(PRIVACY_URL)} style={styles.privacyLink}>
						<Text style={[textStyles.body, { color: theme.colors.primary, textAlign: 'center' }]}>
							Ver Política de Privacidad
						</Text>
					</Pressable>
					<QPButton
						title="Aceptar y continuar"
						onPress={onAccept}
						style={{ backgroundColor: theme.colors.primary, marginBottom: 8 }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
					<QPButton
						title="No, gracias"
						onPress={onDecline}
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
	scrollArea: {
		maxHeight: 200,
		marginBottom: 16,
	},
	privacyLink: {
		marginBottom: 20,
		paddingVertical: 4,
	},
})

export default ContactsDisclosureModal
