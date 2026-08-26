import { Modal, View, Text, Pressable } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'

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

// Tipos
import type { TextStyle, ViewStyle } from 'react-native'

type KycGateModalProps = {
	visible: boolean
	message?: string
	onClose: () => void
}

/**
 * Modal "Verifícate primero": intercepta acciones que el backend rechazaría
 * sin KYC (envíos grandes, retiros grandes, ahorro) y ofrece el salto directo
 * a la pantalla de verificación. Patrón de modal de la casa (overlay centrado,
 * fade, backdrop dismiss). Gobernado por `useKycGate`.
 *
 * @param props
 * @param props.visible - Muestra el modal.
 * @param [props.message] - Explicación del gate (por qué se interceptó).
 * @param props.onClose - Cierra el modal (backdrop, "Ahora no", o al ir a verificar).
 */
const KycGateModal = ({ visible, message, onClose }: KycGateModalProps) => {

	const { t } = useTranslation()

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

					<Text style={[textStyles.h2, styles.title]}>{t('ui.kycGate.title')}</Text>

					<Text style={[textStyles.h3, styles.message, { color: theme.colors.secondaryText }]}>
						{message || t('ui.kycGate.defaultMessage')}
					</Text>

					<QPButton title={t('ui.kycGate.verifyNow')} onPress={goVerify} />

					<QPPressable variant="opacity" onPress={onClose} style={styles.skipLink}>
						<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
							{t('common.actions.notNow')}
						</Text>
					</QPPressable>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

// Objeto plano (no StyleSheet.create) en el original — solo se anota el tipo
const styles: { iconCircle: ViewStyle, title: TextStyle, message: TextStyle, skipLink: ViewStyle } = {
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
