import { memo } from 'react'
import { View, Text, StyleSheet, Pressable, Platform, type PlatformIOSStatic } from 'react-native'

// Theme
import { useTheme } from '../theme/ThemeContext'

// Components
import QPCoin from './particles/QPCoin'
import Sparkline, { type SparklinePoint } from './Sparkline'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { Theme } from '../theme/ThemeContext'
import type { EnrichedCoin } from '../types/domain'

/**
 * Activo de la watchlist: el subset de EnrichedCoin que la card lee, con el
 * spot y la variación ya resueltos a number y el histórico como puntos
 * `{ value }` — la forma exacta que produce `useWatchlistQuery` (OJO:
 * `EnrichedCoin.priceHistory` declara `number[]`, pero el runtime de
 * `coinsApi.priceHistory` entrega puntos con `.value`).
 */
export type WatchlistCoin = Pick<EnrichedCoin, 'tick'> & {
	price: number
	change: number
	priceHistory: SparklinePoint[]
}

type WatchlistCardProps = {
	coin: WatchlistCoin
	onPress: () => void
}

/**
 * Grid tile for a watchlist asset on the Home screen: coin logo, price
 * sparkline, ticker, percent change (green/red with caret) and price
 * (>= $1 gets thousands separators, sub-dollar shows 4 decimals). Memoized —
 * many tiles render per grid. Sizes itself via flexBasis: 2-up on phones,
 * 4-up on iPad. Scale-down press feedback; border only in light mode.
 *
 * @param props
 * @param props.coin - Asset data.
 * @param props.onPress - Abre el detalle de la moneda (CoinDetail).
 */
const WatchlistCard = memo(({ coin, onPress }: WatchlistCardProps) => {

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
				// BUG pre-existente (se preserva tal cual): Theme no tiene `mode`
				// — esta condición es siempre false y el borde light nunca pinta
				(theme as Theme & { mode?: string }).mode === 'light' && {
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
				<Text style={[styles.price, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>{formattedPrice}</Text>
			</View>
		</Pressable>
	)
})

WatchlistCard.displayName = 'WatchlistCard'

const styles = StyleSheet.create({
	card: {
		// Cast local: `isPad` solo existe en el tipo iOS (en Android es undefined, igual que en runtime)
		flexBasis: (Platform as PlatformIOSStatic).isPad ? '22%' : '46%',
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
