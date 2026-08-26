import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

import { useTheme } from '../../../theme/ThemeContext'
import { ORDER_STATUS } from './assistedConstants'
import type { AssistedOrderStatus } from './assistedConstants'

type Props = {
	/** Estado del pedido; cualquier valor desconocido cae en `pending`. */
	status?: AssistedOrderStatus | string
}

/**
 * Pill badge for an assisted-shopping order status
 * (paid | purchased | delivered | cancelled | pending).
 */
const FulfillmentBadge = ({ status }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	// El status llega del backend como string libre: el cast solo permite el
	// índice, el `||` sigue cubriendo los valores fuera del catálogo.
	const meta = ORDER_STATUS[status as AssistedOrderStatus] || ORDER_STATUS.pending
	const color = theme.colors[meta.color] || theme.colors.secondaryText

	return (
		<View style={[styles.badge, { backgroundColor: `${color}26` }]}>
			<Text style={[styles.text, { color, fontFamily: theme.typography.fontFamily.medium }]}>
				{t(meta.labelKey)}
			</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	badge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
		alignSelf: 'flex-start',
	},
	text: {
		fontSize: 12,
	},
})

export default FulfillmentBadge
