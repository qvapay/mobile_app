import { View, Text, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'

// One label/value (or custom children) row. Self-contained so call sites stay simple.
export const DetailRow = ({ label, value, last, children }) => {
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	return (
		<View style={[styles.detailRow, last && { borderBottomWidth: 0, paddingBottom: 0 }]}>
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{label}</Text>
			{children || <Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{value}</Text>}
		</View>
	)
}

// Card header with icon + optional status badge.
export const CardHeader = ({ icon, title, color, badge, badgeColor }) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	
	return (
		<View style={styles.cardHeader}>
			<View style={styles.cardHeaderLeft}>
				<View style={[styles.cardIcon, { backgroundColor: color + '20' }]}>
					<FontAwesome6 name={icon} size={16} color={color} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h5, { fontWeight: '600' }]}>{title}</Text>
			</View>
			{badge && (
				<View style={[styles.statusBadge, { backgroundColor: badgeColor || color }]}>
					<Text style={[textStyles.h7, { color: theme.colors.almostBlack, fontWeight: '600' }]}>{badge}</Text>
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	detailRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255, 255, 255, 0.1)',
	},
	cardHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	cardHeaderLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
	},
	cardIcon: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center',
	},
	statusBadge: {
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 12,
	},
})
