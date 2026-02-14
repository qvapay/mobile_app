import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import QPCoin from './particles/QPCoin'

const QPCoinRow = ({ coin, amount = '', direction = 'in' }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const min = direction === 'in' ? coin.min_in : coin.min_out
	const fee = direction === 'in' ? coin.fee_in : coin.fee_out
	const feeLabel = direction === 'in' ? 'Fee In' : 'Fee Out'
	const minLabel = direction === 'in' ? 'Min In' : 'Min Out'

	const amountNum = parseFloat(amount) || 0
	const priceNum = parseFloat(coin.price) || 0
	const aprox = priceNum > 0 ? (amountNum / priceNum) : 0

	return (
		<View style={styles.container}>
			<QPCoin coin={coin.logo} size={44} />
			<View style={styles.info}>
				<View style={styles.nameRow}>
					<Text style={[textStyles.h5, { fontWeight: 'bold' }]}>{coin.name}</Text>
					{coin.network && (
						<View style={[styles.networkBadge, { backgroundColor: theme.colors.primary }]}>
							<Text style={{ color: theme.colors.buttonText, fontSize: 9, fontWeight: '600' }}>
								{coin.network}
							</Text>
						</View>
					)}
				</View>
				<View style={styles.stats}>
					<View style={styles.stat}>
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>${min}</Text>
						<Text style={[styles.statLabel, { color: theme.colors.tertiaryText }]}>{minLabel}</Text>
					</View>
					<View style={styles.stat}>
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>{fee}%</Text>
						<Text style={[styles.statLabel, { color: theme.colors.tertiaryText }]}>{feeLabel}</Text>
					</View>
					<View style={styles.stat}>
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>${Number(coin.price).toFixed(4)}</Text>
						<Text style={[styles.statLabel, { color: theme.colors.tertiaryText }]}>Precio</Text>
					</View>
					<View style={styles.statAprox}>
						{amountNum > 0 ? (
							<>
								<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: 'bold' }]} numberOfLines={1}>{aprox.toFixed(5)}</Text>
								<Text style={[styles.statLabel, { color: theme.colors.tertiaryText }]}>Aprox.</Text>
							</>
						) : (
							<>
								<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{'\u2014'}</Text>
								<Text style={[styles.statLabel, { color: theme.colors.tertiaryText }]}>Aprox.</Text>
							</>
						)}
					</View>
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
	info: {
		marginLeft: 12,
		flex: 1,
	},
	nameRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	networkBadge: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 10,
		marginLeft: 10,
	},
	stats: {
		flexDirection: 'row',
		alignItems: 'flex-end',
		marginTop: 8,
	},
	stat: {
		flex: 1,
		alignItems: 'center',
	},
	statAprox: {
		flex: 1.3,
		alignItems: 'center',
	},
	statLabel: {
		fontSize: 9,
		marginTop: 2,
		textTransform: 'uppercase',
		letterSpacing: 0.3,
	},
})

export default QPCoinRow
