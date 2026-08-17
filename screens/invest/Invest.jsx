import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Data (React Query: cuatro fuentes en paralelo, persistidas por separado)
import { useInvestDashboard } from './investQueries'

// Routes
import { ROUTES } from '../../routes'

// Helpers
import { formatMoney } from '../../helpers'

// UI
import QPLoader from '../../ui/particles/QPLoader'
import QPCoin from '../../ui/particles/QPCoin'
import Sparkline from '../../ui/Sparkline'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'
import QPSvgUri from '../../ui/particles/QPSvgUri'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Explore tabs
const EXPLORE_TABS = [
	{ key: 'popular', label: 'Populares', icon: 'star' },
	{ key: 'stocks', label: 'Stocks', icon: 'chart-line' },
]

// --- Sub-components ---

const SavingsCard = ({ savings, theme, textStyles, onPress }) => {
	// El balance puede ser negativo (deuda gestionada desde admin): danger + signo
	const isDebt = Number(savings?.balance || 0) < 0
	const balance = formatMoney(savings?.balance)
	const rate = savings?.currentRate || 0
	return (
		<Pressable onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme), { opacity: pressed ? 0.85 : 1 }]}>
			<View style={styles.savingsRow}>
				<View style={styles.savingsInfo}>
					<Text style={[styles.cardTitle, { color: theme.colors.primaryText }]}>Ahorros</Text>
					<Text style={[textStyles.h1, styles.savingsBalance, isDebt && { color: theme.colors.danger }]}>{balance}</Text>
					<Text style={[styles.savingsRate, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}><Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold }}>{rate}%</Text> anual</Text>
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
					<QPSvgUri uri={item.image} width={22} height={22} color={theme.colors.primary} />
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

/**
 * Invest tab dashboard: savings summary, popular crypto, stocks and P2P market averages.
 * Los datos viven en React Query (`useInvestDashboard`): cuatro queries en
 * paralelo persistidas por separado; el resumen de ahorros es la query
 * compartida con BalanceCard. Rows navigate to Savings (passing the
 * already-fetched summary), StockDetail (with `initialData` for instant paint)
 * or the P2P tab pre-filtered by coin.
 */
const Invest = ({ navigation }) => {

	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)

	const { savings, coins, stocks, p2pData, isLoading, refreshing, onRefresh } = useInvestDashboard()
	const [exploreTab, setExploreTab] = useState('popular')

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
							<Pressable
								key={item.tick}
								onPress={() => navigation.navigate(ROUTES.COIN_DETAIL_SCREEN, {
									tick: item.tick,
									name: item.name,
									initialData: item,
								})}
							>
								<ExploreRow {...rowProps} />
							</Pressable>
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
