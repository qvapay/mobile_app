import { View, Text, StyleSheet } from 'react-native'

import { useTheme } from '../../../theme/ThemeContext'
import { ORDER_STATUS } from './assistedConstants'

/**
 * Pill badge for an assisted-shopping order status
 * (paid | purchased | delivered | cancelled | pending).
 */
const FulfillmentBadge = ({ status }) => {

	const { theme } = useTheme()
	const meta = ORDER_STATUS[status] || ORDER_STATUS.pending
	const color = theme.colors[meta.color] || theme.colors.secondaryText

	return (
		<View style={[styles.badge, { backgroundColor: `${color}26` }]}>
			<Text style={[styles.text, { color, fontFamily: theme.typography.fontFamily.medium }]}>
				{meta.label}
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
