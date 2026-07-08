import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import QPCoin from './particles/QPCoin'

/**
 * Single coin row (logo, name, network badge, stats) rendered inside
 * QPCoinPicker and the Add screen. Stats show min amount and fee for the
 * given direction, the coin price, and — when an `amount` is provided — the
 * approximate coin quantity (`amount / price`); otherwise an em dash.
 * Purely presentational: press handling belongs to the parent.
 *
 * @param {object} props
 * @param {object} props.coin - Coin from `coinsApi` (name, logo, price, network, fee_in/out, min_in/out).
 * @param {string} [props.amount] - Fiat amount to convert for the "Aprox." column.
 * @param {'in'|'out'} [props.direction='in'] - Selects fee_in/min_in vs fee_out/min_out.
 * @param {boolean} [props.showFees=true] - Hide fee/min/approx columns, leaving only price.
 */
const QPCoinRow = ({ coin, amount = '', direction = 'in', showFees = true }) => {

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
					<Text style={[textStyles.h5, { fontFamily: theme.typography.fontFamily.medium }]}>{coin.name}</Text>
					{coin.network && (
						<View style={[styles.networkBadge, { backgroundColor: theme.colors.primary }]}>
							<Text style={{ color: theme.colors.buttonText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.semiBold }}>
								{coin.network}
							</Text>
						</View>
					)}
				</View>
				<View style={styles.stats}>
					{showFees && (
						<>
							<View style={styles.stat}>
								<Text style={[textStyles.caption, { color: theme.colors.primaryText }]} numberOfLines={1}>${min}</Text>
								<Text style={[styles.statLabel, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{minLabel}</Text>
							</View>
							<View style={styles.stat}>
								<Text style={[textStyles.caption, { color: theme.colors.primaryText }]} numberOfLines={1}>{fee}%</Text>
								<Text style={[styles.statLabel, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{feeLabel}</Text>
							</View>
						</>
					)}
					<View style={styles.stat}>
						<Text style={[textStyles.caption, { color: theme.colors.primaryText }]} numberOfLines={1}>${Number(coin.price).toFixed(4)}</Text>
						<Text style={[styles.statLabel, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>Precio</Text>
					</View>
					{showFees && (
						<View style={styles.statAprox}>
							{amountNum > 0 ? (
								<>
									<Text style={[textStyles.caption, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium }]} numberOfLines={1}>{aprox.toFixed(5)}</Text>
									<Text style={[styles.statLabel, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>Aprox.</Text>
								</>
							) : (
								<>
									<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{'\u2014'}</Text>
									<Text style={[styles.statLabel, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>Aprox.</Text>
								</>
							)}
						</View>
					)}
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
		marginTop: 2,
		textTransform: 'uppercase',
		letterSpacing: 0.3,
	},
})

export default QPCoinRow
