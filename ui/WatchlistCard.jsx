import { memo } from 'react'
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native'

// Theme
import { useTheme } from '../theme/ThemeContext'

// Components
import QPCoin from './particles/QPCoin'
import Sparkline from './Sparkline'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const WatchlistCard = memo(({ coin, onPress }) => {

	const { theme } = useTheme()

	const isPositive = coin.change >= 0
	const changeColor = isPositive ? '#7BFFB1' : '#DB253E'
	const sparklineColor = isPositive ? '#7BFFB1' : '#DB253E'

	const formattedPrice = coin.price >= 1
		? `$${coin.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
		: `$${coin.price.toFixed(4)}`

	const formattedChange = `${isPositive ? '+' : ''}${coin.change.toFixed(2)}%`

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.card,
				{
					backgroundColor: theme.colors.surface,
					transform: [{ scale: pressed ? 0.97 : 1 }],
				},
				theme.mode === 'light' && {
					borderWidth: 1,
					borderColor: theme.colors.border,
				},
			]}
		>
			<View style={styles.topRow}>
				<QPCoin coin={coin.tick} size={28} />
				<Sparkline data={coin.priceHistory} width={70} height={28} color={sparklineColor} />
			</View>

			<View style={styles.bottomRow}>
				<View style={styles.tickerRow}>
					<Text style={[styles.ticker, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{coin.tick}</Text>
					<FontAwesome6 name={isPositive ? 'caret-up' : 'caret-down'} size={12} color={changeColor} iconStyle="solid" />
					<Text style={[styles.change, { color: changeColor, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{formattedChange}</Text>
				</View>
				<Text style={[styles.price, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.bold }]}>{formattedPrice}</Text>
			</View>
		</Pressable>
	)
})

WatchlistCard.displayName = 'WatchlistCard'

const styles = StyleSheet.create({
	card: {
		flexBasis: Platform.isPad ? '22%' : '46%',
		flexGrow: 1,
		borderRadius: 14,
		padding: 14,
		gap: 10,
	},
	topRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	bottomRow: {
		gap: 2,
	},
	tickerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
	},
	ticker: {},
	change: {},
	price: {},
})

export default WatchlistCard
