import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import type { ImageStyle, RefreshControlProps, TextStyle, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'

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
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MainTabParamList, RootStackParamList } from '../../types/navigation'
import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'
import type { EnrichedCoin, SavingsSummary } from '../../types/domain'
import type { P2pPair } from './investQueries'

/** Invest es un tab de MainStack y navega también a rutas del stack raíz. */
type InvestProps = CompositeScreenProps<
	BottomTabScreenProps<MainTabParamList, 'Invest'>,
	NativeStackScreenProps<RootStackParamList>
>

/**
 * `StyleSheet.create` es una función IDENTIDAD, pero su tipo solo admite
 * objetos de estilo; estas hojas mezclan estilos estáticos con builders que
 * reciben el theme (`cardBorder(theme)`). El alias tipado deja convivir ambos
 * sin tocar el runtime: se sigue emitiendo `StyleSheet.create({ … })`.
 */
type StyleMap = Record<string, ViewStyle | TextStyle | ImageStyle | ((theme: Theme) => ViewStyle)>

/**
 * OJO (pre-existente, NO tocado): el theme expone `isDark`, no `mode`, así que
 * la comparación contra 'light' es siempre falsa en runtime y el borde claro de
 * las cards nunca se pinta. Se conserva tal cual con un cast local.
 */
const themeMode = (theme: Theme) => (theme as Theme & { mode?: 'light' | 'dark' }).mode

// Explore tabs (labels = claves i18n resueltas en render)
const EXPLORE_TABS: { key: string, labelKey: string, icon: FontAwesome6SolidIconName }[] = [
	{ key: 'popular', labelKey: 'invest.dashboard.tabs.popular', icon: 'star' },
	{ key: 'stocks', labelKey: 'invest.dashboard.tabs.stocks', icon: 'chart-line' },
]

// --- Sub-components ---

type SavingsCardProps = {
	savings: SavingsSummary | null
	theme: Theme
	textStyles: TextStyles
	onPress: () => void
}

const SavingsCard = ({ savings, theme, textStyles, onPress }: SavingsCardProps) => {
	const { t } = useTranslation()
	// El balance puede ser negativo (deuda gestionada desde admin): danger + signo
	const isDebt = Number(savings?.balance || 0) < 0
	const balance = formatMoney(savings?.balance)
	const rate = savings?.currentRate || 0
	return (
		<Pressable onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: theme.colors.surface }, themeMode(theme) === 'light' && styles.cardBorder(theme), { opacity: pressed ? 0.85 : 1 }]}>
			<View style={styles.savingsRow}>
				<View style={styles.savingsInfo}>
					<Text style={[styles.cardTitle, { color: theme.colors.primaryText }]}>{t('invest.dashboard.savings')}</Text>
					<Text style={[textStyles.h1, styles.savingsBalance, isDebt && { color: theme.colors.danger }]}>{balance}</Text>
					<Text style={[styles.savingsRate, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}><Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold }}>{rate}%</Text> {t('invest.common.perYear')}</Text>
				</View>
				<View style={[styles.savingsIcon, { backgroundColor: theme.colors.primary + '15' }]}>
					<FontAwesome6 name="vault" size={24} color={theme.colors.primary} iconStyle="solid" />
				</View>
			</View>
		</Pressable>
	)
}

type SectionCardProps = {
	title: string
	icon: FontAwesome6SolidIconName
	theme: Theme
	rightLabel?: string
	onSeeAll?: () => void
	children?: ReactNode
}

const SectionCard = ({ title, icon, theme, rightLabel, onSeeAll, children }: SectionCardProps) => {
	const { t } = useTranslation()
	return (
		<View style={[styles.card, { backgroundColor: theme.colors.surface }, themeMode(theme) === 'light' && styles.cardBorder(theme)]}>
			<View style={styles.sectionHeader}>
				<View style={styles.cardHeader}>
					<FontAwesome6 name={icon} size={16} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[styles.cardTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>{title}</Text>
				</View>
				{onSeeAll && (
					<Pressable onPress={onSeeAll} hitSlop={8}>
						<Text style={[styles.seeAll, { color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{rightLabel || t('invest.dashboard.seeAll')}</Text>
					</Pressable>
				)}
			</View>
			{children}
		</View>
	)
}

type FilterChipProps = {
	label: string
	icon: FontAwesome6SolidIconName
	selected: boolean
	theme: Theme
	onPress: () => void
}

const FilterChip = ({ label, icon, selected, theme, onPress }: FilterChipProps) => (
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

/**
 * Fila del explorador: sirve tanto a una cripto enriquecida como a un stock,
 * así que su forma es la UNIÓN de los campos que ambas superficies traen.
 */
type ExploreRowItem = {
	tick: string
	name?: string
	price?: string | number
	change?: number
	icon?: string
	iconStyle?: string
	image?: string | null
	priceHistory?: { value: number }[]
}

type ExploreRowProps = {
	item: ExploreRowItem
	theme: Theme
	textStyles: TextStyles
	isLast: boolean
	isCrypto: boolean
}

const ExploreRow = ({ item, theme, textStyles, isLast, isCrypto }: ExploreRowProps) => {

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
					{/* Los stocks traen icono y estilo como strings sueltos del backend: casts locales para casar con la unión discriminada de FontAwesome6 */}
					<FontAwesome6 name={item.icon as FontAwesome6SolidIconName} size={16} color={theme.colors.primary} iconStyle={item.iconStyle as 'solid'} />
				</View>
			)}
			<View style={styles.itemInfo}>
				<Text style={[textStyles.h4, styles.itemName]}>{item.name}</Text>
				<Text style={[styles.itemSub, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{item.tick}</Text>
			</View>
			{isCrypto && (
				<View style={styles.sparklineContainer}>
					{(item.priceHistory?.length as number) > 1 && (
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

type P2PRowProps = {
	pair: P2pPair
	theme: Theme
	textStyles: TextStyles
	isLast: boolean
}

const P2PRow = ({ pair, theme, textStyles, isLast }: P2PRowProps) => {
	const { t } = useTranslation()
	return (
		<View style={[styles.itemRow, !isLast && styles.itemBorder(theme)]}>
			<QPCoin coin={pair.tick} size={32} />
			<View style={styles.p2pInfo}>
				<Text style={[textStyles.h4, styles.itemName]}>{pair.name}</Text>
				<Text style={[styles.itemSub, { color: theme.colors.secondaryText }]}>{t('invest.dashboard.offers', { count: pair.count })}</Text>
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
}

// --- Main Component ---

/**
 * Invest tab dashboard: savings summary, popular crypto, stocks and P2P market averages.
 * Los datos viven en React Query (`useInvestDashboard`): cuatro queries en
 * paralelo persistidas por separado; el resumen de ahorros es la query
 * compartida con BalanceCard. Rows navigate to Savings (passing the
 * already-fetched summary), StockDetail (with `initialData` for instant paint)
 * or the P2P tab pre-filtered by coin.
 */
const Invest = ({ navigation }: InvestProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)

	const { savings, coins, stocks, p2pData, isLoading, refreshing, onRefresh } = useInvestDashboard()
	const [exploreTab, setExploreTab] = useState('popular')

	if (isLoading) return <QPLoader />

	// La lista mezcla criptos enriquecidas y stocks: se lee por la forma común
	// (ExploreRowItem) — cast local, la pestaña activa decide qué campos hay
	const exploreItems = (exploreTab === 'popular' ? coins.slice(0, 5) : stocks) as ExploreRowItem[]

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
			>
				{/* Savings */}
				<SavingsCard
					savings={savings}
					theme={theme}
					textStyles={textStyles}
					// `Savings.savings` está modelado como `Record<string, unknown>`
					// en types/navigation: el resumen viaja igual, solo se tipa
					onPress={() => navigation.navigate(ROUTES.SAVINGS_SCREEN, { savings: savings as unknown as Record<string, unknown> })}
				/>

				{/* Explore: Cripto + Stocks */}
				<SectionCard title={t('invest.dashboard.explore')} icon="lightbulb" theme={theme}>
					<View style={styles.chipRow}>
						{EXPLORE_TABS.map((tab) => (
							<FilterChip
								key={tab.key}
								label={t(tab.labelKey)}
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
									initialData: item as unknown as Record<string, unknown>,
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
									initialData: item as unknown as EnrichedCoin,
								})}
							>
								<ExploreRow {...rowProps} />
							</Pressable>
						)
					})}
					{exploreItems.length === 0 && <Text style={[styles.emptyText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{t('invest.dashboard.empty')}</Text>}
				</SectionCard>

				{/* P2P Mercado */}
				<SectionCard title={t('invest.common.p2pMarket')} icon="scale-balanced" theme={theme} onSeeAll={() => navigation.navigate(ROUTES.P2P_SCREEN)}>
					{p2pData.length > 0 ? p2pData.map((pair, i) => (
						<Pressable key={pair.tick} onPress={() => navigation.navigate(ROUTES.P2P_SCREEN, { coin: pair.tick, coinName: pair.name })}>
							<P2PRow pair={pair} theme={theme} textStyles={textStyles} isLast={i === p2pData.length - 1} />
						</Pressable>
					)) : (
						<Text style={[styles.emptyText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{t('invest.dashboard.empty')}</Text>
					)}
				</SectionCard>
			</ScrollView>
		</View>
	)
}

const styles = (StyleSheet.create as <T extends StyleMap>(o: T) => T)({
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
	cardBorder: (theme: Theme) => ({
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
	itemBorder: (theme: Theme) => ({
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
