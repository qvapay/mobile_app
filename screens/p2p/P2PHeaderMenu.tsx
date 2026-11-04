import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

/** Entradas del menú ⋯ del mercado P2P. Las mismas en el menú propio y en el UIMenu nativo de iOS. */
export type P2PMenuKey = 'create' | 'market' | 'filters'

/** Icono FontAwesome6 (solid) de cada entrada; el SF Symbol del UIMenu lo pone P2P.tsx. */
export type P2PMenuItem = { key: P2PMenuKey, label: string, icon: 'plus' | 'chart-simple' | 'sliders', active?: boolean }

type P2PHeaderMenuProps = {
	visible: boolean
	items: P2PMenuItem[]
	onSelect: (key: P2PMenuKey) => void
	onClose: () => void
	/** iOS: lo que se abra desde el menú (otro Modal, una pantalla) espera a que este termine de irse. */
	onDismiss?: () => void
}

/**
 * Menú ⋯ del header del mercado P2P fuera de iOS (ahí es un UIMenu nativo): la misma
 * tarjeta centrada con filas del menú de las mini-apps. Crear oferta, Mercado y Filtros
 * viven aquí para que el header solo lleve el lado del mercado, «Mis ofertas» y el ⋯,
 * como en los P2P de la industria (Binance, OKX y Bybit agrupan el resto bajo ⋯).
 */
const P2PHeaderMenu = ({ visible, items, onSelect, onClose, onDismiss }: P2PHeaderMenuProps) => {
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose} onDismiss={onDismiss}>
			<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
				<View style={[containerStyles.modalCard, styles.card]} onStartShouldSetResponder={() => true}>
					{items.map(item => {
						// Una entrada "activa" (Filtros con filtros puestos) se tiñe de primario
						const color = item.active ? theme.colors.primary : theme.colors.primaryText
						return (
							<Pressable key={item.key} onPress={() => onSelect(item.key)} style={styles.row} accessibilityRole="button" testID={`p2p-menu-${item.key}`}>
								<FontAwesome6 name={item.icon} size={16} color={color} iconStyle="solid" style={styles.icon} />
								<Text style={[textStyles.h5, { color }]}>{item.label}</Text>
							</Pressable>
						)
					})}
				</View>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	card: { paddingVertical: 8 },
	row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
	icon: { width: 28 },
})

export default P2PHeaderMenu
