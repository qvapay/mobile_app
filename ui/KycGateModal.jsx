import { Modal, View, Text, Pressable } from 'react-native'
import { useNavigation } from '@react-navigation/native'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../theme/themeUtils'

// Routes
import { ROUTES } from '../routes'

// UI Particles
import QPButton from './particles/QPButton'
import QPPressable from './particles/QPPressable'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * Modal "Verifícate primero": intercepta acciones que el backend rechazaría
 * sin KYC (envíos grandes, retiros grandes, ahorro) y ofrece el salto directo
 * a la pantalla de verificación. Patrón de modal de la casa (overlay centrado,
 * fade, backdrop dismiss). Gobernado por `useKycGate`.
 *
 * @param {object} props
 * @param {boolean} props.visible - Muestra el modal.
 * @param {string} [props.message] - Explicación del gate (por qué se interceptó).
 * @param {function} props.onClose - Cierra el modal (backdrop, "Ahora no", o al ir a verificar).
 */
const KycGateModal = ({ visible, message, onClose }) => {

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const navigation = useNavigation()

	const goVerify = () => {
		onClose()
		navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.KYC, initial: false })
	}

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
				<Pressable style={containerStyles.modalCard}>

					<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
						<FontAwesome6 name="shield-halved" size={30} color={theme.colors.primary} iconStyle="solid" />
					</View>

					<Text style={[textStyles.h2, styles.title]}>Verifica tu identidad</Text>

					<Text style={[textStyles.h3, styles.message, { color: theme.colors.secondaryText }]}>
						{message || 'Esta operación requiere tener tu identidad verificada. Es rápido y solo se hace una vez.'}
					</Text>

					<QPButton title="Verificar ahora" onPress={goVerify} />

					<QPPressable variant="opacity" onPress={onClose} style={styles.skipLink}>
						<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
							Ahora no
						</Text>
					</QPPressable>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = {
	iconCircle: {
		width: 72,
		height: 72,
		borderRadius: 36,
		alignItems: 'center',
		justifyContent: 'center',
		alignSelf: 'center',
		marginBottom: 16,
	},
	title: {
		textAlign: 'center',
	},
	message: {
		textAlign: 'center',
		marginTop: 8,
		marginBottom: 20,
	},
	skipLink: {
		alignItems: 'center',
		paddingVertical: 10,
	},
}

export default KycGateModal
