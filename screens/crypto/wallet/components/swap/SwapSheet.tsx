import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../../theme/themeUtils'

type Props = {
	visible: boolean
	title: string
	onClose: () => void
	children: React.ReactNode
	/** Mientras firma o envía no se deja cerrar tocando fuera. */
	dismissable?: boolean
}

/**
 * Bottom sheet del swap (selector de activo y revisión): mismo patrón que QPCoinPicker —
 * Modal transparente con slide, overlay que cierra y hoja que absorbe los toques. Con
 * teclado (PIN de la revisión) la hoja sube con KeyboardAvoidingView.
 */
const SwapSheet = ({ visible, title, onClose, children, dismissable = true }: Props) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const insets = useSafeAreaInsets()
	const close = () => { if (dismissable) onClose() }

	return (
		<Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
			<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
				<Pressable style={styles.overlay} onPress={close}>
					<Pressable style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => { }}>
						<View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />
						<View style={styles.header}>
							<Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>{title}</Text>
							{dismissable && (
								<Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="close">
									<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
								</Pressable>
							)}
						</View>
						{children}
					</Pressable>
				</Pressable>
			</KeyboardAvoidingView>
		</Modal>
	)
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
	sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderCurve: 'continuous', maxHeight: '90%', paddingHorizontal: 20 },
	grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
	header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
})

export default SwapSheet
