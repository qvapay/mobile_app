import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// APIs
import { coinsApi } from '../../api/coinsApi'
import { p2pApi } from '../../api/p2pApi'
import { savingApi } from '../../api/savingApi'
import { stocksApi } from '../../api/stocksApi'

// Routes
import { ROUTES } from '../../routes'

// UI
import QPLoader from '../../ui/particles/QPLoader'
import QPCoin from '../../ui/particles/QPCoin'
import Sparkline from '../../ui/Sparkline'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'
import { SvgUri } from 'react-native-svg'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Explore tabs
const EXPLORE_TABS = [
	{ key: 'popular', label: 'Populares', icon: 'star' },
	{ key: 'stocks', label: 'Stocks', icon: 'chart-line' },
]

// P2P coins to display
const P2P_COINS = ['BANK_CUP', 'BANK_MLC', 'CLASICA', 'BANDECPREPAGO', 'ETECSA', 'TROPIPAY', 'ZELLE', 'BOLSATM']

// --- Sub-components ---

const SavingsCard = ({ savings, theme, textStyles, onPress }) => {
	const balance = Number(savings?.balance || 0).toFixed(2)
	const rate = savings?.currentRate || 0
	return (
		<Pressable onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme), { opacity: pressed ? 0.85 : 1 }]}>
			<View style={styles.savingsRow}>
				<View style={styles.savingsInfo}>
					<Text style={[styles.cardTitle, { color: theme.colors.primaryText }]}>Ahorros</Text>
					<Text style={[textStyles.h1, styles.savingsBalance]}>${balance}</Text>
					<Text style={[styles.savingsRate, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}><Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.bold }}>{rate}%</Text> anual</Text>
				</View>
				<View style={[styles.savingsIcon, { backgroundColor: theme.colors.primary + '15' }]}>
					<FontAwesome6 name="vault" size={24} color={theme.colors.primary} iconStyle="solid" />
				</View>
			</View>
		</Pressable>
	)
}

const SectionCard = ({ title, icon, theme, rightLabel, onSeeAll, children }) => (
	<View style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme)]}>
		<View style={styles.sectionHeader}>
			<View style={styles.cardHeader}>
				<FontAwesome6 name={icon} size={16} color={theme.colors.primary} iconStyle="solid" />
				<Text style={[styles.cardTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>{title}</Text>
			</View>
			{onSeeAll && (
				<Pressable onPress={onSeeAll} hitSlop={8}>
					<Text style={[styles.seeAll, { color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{rightLabel || 'Ver todo'}</Text>
				</Pressable>
			)}
		</View>
		{children}
	</View>
)

const FilterChip = ({ label, icon, selected, theme, onPress }) => (
	<Pressable
		onPress={onPress}
		style={[
			styles.chip,
			selected
				? { backgroundColor: theme.colors.primary }
				: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
		]}
	>
		<FontAwesome6 name={icon} size={11} color={selected ? theme.colors.buttonText : theme.colors.secondaryText} iconStyle="solid" />
		<Text style={[styles.chipText, { color: selected ? theme.colors.buttonText : theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>{label}</Text>
	</Pressable>
)

const ExploreRow = ({ item, theme, textStyles, isLast, isCrypto }) => {
	const price = Number(item.price || 0)
	const change = item.change || 0
	const isPositive = change >= 0
	const trendColor = isPositive ? theme.colors.successText : theme.colors.danger
	return (
		<View style={[styles.itemRow, !isLast && styles.itemBorder(theme)]}>
			{isCrypto ? (
				<QPCoin coin={item.tick} size={36} />
			) : item.image ? (
				<View style={[styles.stockIcon, { backgroundColor: theme.colors.primary + '12' }]}>
					<SvgUri uri={item.image} width={22} height={22} color={theme.colors.primary} />
				</View>
			) : (
				<View style={[styles.stockIcon, { backgroundColor: theme.colors.primary + '12' }]}>
					<FontAwesome6 name={item.icon} size={16} color={theme.colors.primary} iconStyle={item.iconStyle} />
				</View>
			)}
			<View style={styles.itemInfo}>
				<Text style={[textStyles.h4, styles.itemName]}>{item.name}</Text>
				<Text style={[styles.itemSub, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{item.tick}</Text>
			</View>
			{isCrypto && (
				<View style={styles.sparklineContainer}>
					{item.priceHistory?.length > 1 && (
						<Sparkline data={item.priceHistory} width={60} height={24} color={trendColor} />
					)}
				</View>
			)}
			<View style={styles.priceCol}>
				<Text style={[textStyles.h4, styles.itemPrice]}>
					${price >= 1
						? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
						: price.toFixed(4)
					}
				</Text>
				{change !== 0 && (
					<View style={[styles.changeBadge, { backgroundColor: trendColor + '18' }]}>
						<FontAwesome6 name={isPositive ? 'caret-up' : 'caret-down'} size={9} color={trendColor} iconStyle="solid" />
						<Text style={[styles.changeBadgeText, { color: trendColor, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.semiBold }]}>
							{isPositive ? '+' : ''}{change.toFixed(2)}%
						</Text>
					</View>
				)}
			</View>
		</View>
	)
}

const P2PRow = ({ pair, theme, textStyles, isLast }) => (
	<View style={[styles.itemRow, !isLast && styles.itemBorder(theme)]}>
		<QPCoin coin={pair.tick} size={32} />
		<View style={styles.p2pInfo}>
			<Text style={[textStyles.h4, styles.itemName]}>{pair.name}</Text>
			<Text style={[styles.itemSub, { color: theme.colors.secondaryText }]}>{pair.count} ofertas</Text>
		</View>
		<View style={styles.p2pPriceCol}>
			<View style={styles.p2pPriceRow}>
				<FontAwesome6 name="caret-up" size={9} color={theme.colors.successText} iconStyle="solid" />
				<Text style={[styles.p2pPrice, { color: theme.colors.successText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }]}>{pair.buy.toFixed(2)}</Text>
			</View>
			<View style={styles.p2pPriceRow}>
				<FontAwesome6 name="caret-down" size={9} color={theme.colors.danger} iconStyle="solid" />
				<Text style={[styles.p2pPrice, { color: theme.colors.danger, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }]}>{pair.sell.toFixed(2)}</Text>
			</View>
		</View>
	</View>
)

// --- Main Component ---

const Invest = ({ navigation }) => {

	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)

	const [isLoading, setIsLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [savings, setSavings] = useState(null)
	const [coins, setCoins] = useState([])
	const [stocks, setStocks] = useState([])
	const [exploreTab, setExploreTab] = useState('popular')
	const [p2pData, setP2pData] = useState([])

	const fetchData = useCallback(async (showLoader = true) => {
		if (showLoader) setIsLoading(true)
		try {
			const [savingsRes, coinsRes, p2pRes, stocksRes] = await Promise.all([
				savingApi.getSummary(),
				coinsApi.index({ category_id: 1, trade: 1 }),
				p2pApi.getAverages(),
				stocksApi.index(),
			])
			if (savingsRes.success) setSavings(savingsRes.data)
			if (p2pRes.success && p2pRes.data) {
				const averages = p2pRes.data
				const pairs = P2P_COINS
					.filter(tick => averages[tick])
					.map(tick => {
						const d = averages[tick]
						return { tick, name: d.name || tick, buy: d.average_buy || 0, sell: d.average_sell || 0, count: d.count || 0 }
					})
				setP2pData(pairs)
			}
			if (stocksRes.success && Array.isArray(stocksRes.data)) {
				setStocks(stocksRes.data.map(s => ({
					tick: s.symbol,
					name: s.name,
					icon: s.icon,
					iconStyle: s.iconStyle,
					image: s.image || null,
					price: s.price,
					change: s.change,
					changeDollar: s.changeDollar,
				})))
			}
			if (coinsRes.success && coinsRes.data?.length) {
				const rawCoins = coinsRes.data
				// Fetch price histories for the first 5 coins
				const ticks = rawCoins.slice(0, 5).map(c => c.tick)
				const historyResults = await Promise.all(
					ticks.map(tick => coinsApi.priceHistory(tick, '24H'))
				)
				const enriched = rawCoins.map(coin => {
					const idx = ticks.indexOf(coin.tick)
					if (idx === -1) return coin
					const res = historyResults[idx]
					if (!res.success || !res.data?.length) return coin
					const history = res.data
					const first = history[0].value
					const last = history[history.length - 1].value
					const change = first > 0 ? ((last - first) / first) * 100 : 0
					const changeDollar = last - first
					return { ...coin, price: last, change, changeDollar, priceHistory: history }
				})
				setCoins(enriched)
			}
		} catch {
			// silently handle
		} finally { setIsLoading(false) }
	}, [])

	useEffect(() => { fetchData() }, [fetchData])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchData(false)
		setRefreshing(false)
	}, [fetchData])

	if (isLoading) return <QPLoader />

	const exploreItems = exploreTab === 'popular' ? coins.slice(0, 5) : stocks

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>
				{/* Savings */}
				<SavingsCard
					savings={savings}
					theme={theme}
					textStyles={textStyles}
					onPress={() => navigation.navigate(ROUTES.SAVINGS_SCREEN, { savings })}
				/>

				{/* Explore: Cripto + Stocks */}
				<SectionCard title="Explorar" icon="lightbulb" theme={theme}>
					<View style={styles.chipRow}>
						{EXPLORE_TABS.map((tab) => (
							<FilterChip
								key={tab.key}
								label={tab.label}
								icon={tab.icon}
								selected={exploreTab === tab.key}
								theme={theme}
								onPress={() => setExploreTab(tab.key)}
							/>
						))}
					</View>
					{exploreItems.map((item, i) => {
						const isStock = exploreTab === 'stocks'
						const rowProps = {
							item,
							theme,
							textStyles,
							isLast: i === exploreItems.length - 1,
							isCrypto: !isStock,
						}
						return isStock ? (
							<Pressable
								key={item.tick}
								onPress={() => navigation.navigate(ROUTES.STOCK_DETAIL_SCREEN, {
									symbol: item.tick,
									name: item.name,
									icon: item.icon,
									iconStyle: item.iconStyle,
									image: item.image,
									initialData: item,
								})}
							>
								<ExploreRow {...rowProps} />
							</Pressable>
						) : (
							<ExploreRow key={item.tick} {...rowProps} />
						)
					})}
					{exploreItems.length === 0 && <Text style={[styles.emptyText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>Sin datos</Text>}
				</SectionCard>

				{/* P2P Mercado */}
				<SectionCard title="Mercado P2P" icon="scale-balanced" theme={theme} onSeeAll={() => navigation.navigate(ROUTES.P2P_SCREEN)}>
					{p2pData.length > 0 ? p2pData.map((pair, i) => (
						<Pressable key={pair.tick} onPress={() => navigation.navigate(ROUTES.P2P_SCREEN, { coin: pair.tick, coinName: pair.name })}>
							<P2PRow pair={pair} theme={theme} textStyles={textStyles} isLast={i === p2pData.length - 1} />
						</Pressable>
					)) : (
						<Text style={[styles.emptyText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>Sin datos</Text>
					)}
				</SectionCard>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	scroll: {
		flex: 1,
	},
	scrollContent: {
		paddingBottom: 100,
		gap: 10,
		paddingTop: 4,
	},
	// Cards
	card: {
		borderRadius: 14,
		padding: 12,
	},
	cardBorder: (theme) => ({
		borderWidth: 1,
		borderColor: theme.colors.border,
	}),
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	cardTitle: {},
	sectionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	seeAll: {},
	// Savings
	savingsRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	savingsInfo: {
		flex: 1,
	},
	savingsBalance: {
		marginTop: 4,
	},
	savingsRate: {
		marginTop: 2,
	},
	savingsIcon: {
		width: 52,
		height: 52,
		borderRadius: 26,
		justifyContent: 'center',
		alignItems: 'center',
	},
	// Item rows
	itemRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 10,
		gap: 10,
	},
	itemBorder: (theme) => ({
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: theme.colors.border + '60',
	}),
	itemInfo: {
		flex: 1,
	},
	itemName: {},
	itemSub: {
		marginTop: 1,
	},
	itemPrice: {
		textAlign: 'right',
	},
	// Explore
	chipRow: {
		flexDirection: 'row',
		gap: 8,
		marginBottom: 4,
	},
	chip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
	},
	chipText: {},
	// P2P
	p2pInfo: {
		flex: 1,
	},
	p2pPriceCol: {
		alignItems: 'flex-end',
		gap: 2,
	},
	p2pPriceRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
	},
	p2pPrice: {},
	priceCol: {
		width: 100,
		alignItems: 'flex-end',
	},
	// Stocks
	stockIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: 'center',
		alignItems: 'center',
	},
	sparklineContainer: {
		width: 60,
		height: 24,
		justifyContent: 'center',
		alignItems: 'center',
	},
	changeBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 3,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 6,
		marginTop: 3,
		alignSelf: 'flex-end',
	},
	changeBadgeText: {},
	// Common
	emptyText: {
		textAlign: 'center',
		paddingVertical: 16,
	},
})

export default Invest
