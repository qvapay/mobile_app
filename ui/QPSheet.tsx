import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated from 'react-native-reanimated'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'
import { SHEET_ENTERING, SHEET_MAX_RATIO } from './sheetConfig'

/**
 * LA hoja inferior de la app: overlay que cierra al tocar fuera, tirador, cabecera con
 * título y aspa, y el contenido debajo.
 *
 * Existe porque el patrón estaba copiado en cuatro sitios con cuatro alturas y dos radios
 * distintos. Quien necesite una hoja monta esta; lo único que cambia es lo que va dentro.
 */
const QPSheet = ({ visible, title, onClose, children, dismissable = true, avoidKeyboard = false, headerRight }: {
	visible: boolean
	/** Sin título, la cabecera se reduce al aspa (o desaparece si tampoco se puede cerrar). */
	title?: string
	onClose: () => void
	children: React.ReactNode
	/** Mientras se firma o se envía no se deja cerrar tocando fuera. */
	dismissable?: boolean
	/** La hoja sube con el teclado (entradas de PIN, búsquedas). */
	avoidKeyboard?: boolean
	headerRight?: React.ReactNode
}) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const insets = useSafeAreaInsets()
	const close = () => { if (dismissable) { onClose() } }


	const body = (
		<Pressable style={styles.overlay} onPress={close}>
			{/* El responder absorbe los toques: sin él, tocar el tirador o cualquier hueco de la
			    hoja caía al overlay y la cerraba. Animated.View y no Pressable: animar un
			    Pressable revienta en Fabric */}
			<Animated.View entering={SHEET_ENTERING} onStartShouldSetResponder={() => true} style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
				<View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />
				{(!!title || dismissable) && (
					<View style={styles.header}>
						<Text style={[textStyles.h3, { color: theme.colors.primaryText }]} numberOfLines={1}>{title ?? ''}</Text>
						<View style={styles.headerRight}>
							{headerRight}
							{dismissable && (
								<Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.actions.close')}>
									<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
								</Pressable>
							)}
						</View>
					</View>
				)}
				{children}
			</Animated.View>
		</Pressable>
	)

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
			{avoidKeyboard
				? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>{body}</KeyboardAvoidingView>
				: body}
		</Modal>
	)
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
	sheet: {
		borderTopLeftRadius: 22, borderTopRightRadius: 22, borderCurve: 'continuous',
		maxHeight: `${SHEET_MAX_RATIO * 100}%`, paddingHorizontal: 20, overflow: 'hidden',
	},
	grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
	header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, gap: 12 },
	headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
})

export default QPSheet
