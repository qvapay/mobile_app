import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import type { ImageStyle, LayoutChangeEvent, RefreshControlProps, TextStyle, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Data (React Query: cuatro fuentes en paralelo, persistidas por separado)
import { useCryptoDashboard } from './cryptoQueries'
import WalletHome from './wallet/WalletHome'

// Routes
import { ROUTES } from '../../routes'

// Helpers

// UI
import QPSkeleton from '../../ui/particles/QPSkeleton'
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
import type { EnrichedCoin } from '../../types/domain'

/** Crypto es un tab de MainStack y navega también a rutas del stack raíz. */
type CryptoProps = CompositeScreenProps<
	BottomTabScreenProps<MainTabParamList, 'Crypto'>,
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
 * Pestañas de mercado (labels = claves i18n resueltas en render). Pensado para
 * crecer: los activos del mundo real (RWA) entran como una entrada más aquí,
 * con su fuente de datos en `marketItems`.
 */
type MarketKey = 'crypto' | 'stocks'
const MARKET_TABS: { key: MarketKey, labelKey: string }[] = [
	{ key: 'crypto', labelKey: 'crypto.dashboard.tabs.crypto' },
	{ key: 'stocks', labelKey: 'crypto.dashboard.tabs.stocks' },
]

const INDICATOR_SPRING = { damping: 20, stiffness: 220, mass: 0.6 }

// --- Sub-components ---

type MarketTabsProps = {
	value: MarketKey
	onChange: (key: MarketKey) => void
	theme: Theme
}

/**
 * Pestañas de texto con subrayado deslizante (patrón de mercados de
 * Binance/Revolut): escalan a N mercados sin cambiar de forma, a diferencia de
 * un segmented de dos. El subrayado se coloca con lo que mide cada pestaña.
 */
const MarketTabs = ({ value, onChange, theme }: MarketTabsProps) => {
	const { t } = useTranslation()
	const [layouts, setLayouts] = useState<Partial<Record<MarketKey, { x: number, width: number }>>>({})
	const x = useSharedValue(0)
	const width = useSharedValue(0)

	const active = layouts[value]
	useEffect(() => {
		if (!active) return
		// Primera medida: sin animación (el subrayado no debe "llegar" volando al abrir)
		const first = width.value === 0
		x.value = first ? active.x : withSpring(active.x, INDICATOR_SPRING)
		width.value = first ? active.width : withSpring(active.width, INDICATOR_SPRING)
	}, [active?.x, active?.width]) // eslint-disable-line react-hooks/exhaustive-deps
	const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: width.value }))

	const onTabLayout = (key: MarketKey) => (event: LayoutChangeEvent) => {
		const { x: tabX, width: tabWidth } = event.nativeEvent.layout
		setLayouts(prev => (prev[key]?.x === tabX && prev[key]?.width === tabWidth ? prev : { ...prev, [key]: { x: tabX, width: tabWidth } }))
	}

	return (
		<View style={[styles.tabs, { borderBottomColor: theme.colors.border + '60' }]} accessibilityRole="tablist">
			{MARKET_TABS.map(tab => {
				const selected = tab.key === value
				return (
					<Pressable key={tab.key} onPress={() => onChange(tab.key)} onLayout={onTabLayout(tab.key)} style={styles.tab} hitSlop={6} accessibilityRole="tab" accessibilityState={{ selected }}>
						<Text style={{ color: selected ? theme.colors.primaryText : theme.colors.tertiaryText, fontSize: theme.typography.fontSize.md, fontFamily: selected ? theme.typography.fontFamily.semiBold : theme.typography.fontFamily.medium }}>
							{t(tab.labelKey)}
						</Text>
					</Pressable>
				)
			})}
			<Animated.View style={[styles.tabIndicator, { backgroundColor: theme.colors.primary }, indicatorStyle]} />
		</View>
	)
}

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

// --- Main Component ---

/**
 * Crypto tab: home de la wallet self-custody (flag) arriba y, al final, el
 * explorador de precios (cripto populares + stocks). Las medias del mercado
 * P2P viven ahora en el tab P2P (botón del header → P2PMarketModal). Los
 * datos del explorador viven en React Query (`useCryptoDashboard`).
 * El ahorro ya no vive aquí (se llega desde el BalanceCard del Home). Rows
 * navigate to StockDetail / CoinDetail (with `initialData` for instant paint).
 */
const Crypto = ({ navigation }: CryptoProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)

	const { coins, stocks, isLoading, refreshing, onRefresh } = useCryptoDashboard()
	const [market, setMarket] = useState<MarketKey>('crypto')

	// La lista mezcla criptos enriquecidas y stocks: se lee por la forma común
	// (ExploreRowItem) — cast local, la pestaña activa decide qué campos hay
	const exploreItems = (market === 'crypto' ? coins.slice(0, 5) : stocks) as ExploreRowItem[]

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
			>
				{/* Wallet self-custody: total, activos por red y gestión. Los
				    precios quedan al final. */}
				<WalletHome refreshSignal={refreshing} />

				{/* Mercados: Cripto · Stocks (y pronto RWA) */}
				<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && styles.cardBorder(theme)]}>
					<MarketTabs value={market} onChange={setMarket} theme={theme} />
					{exploreItems.map((item, i) => {
						const isStock = market === 'stocks'
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
					{isLoading && [0, 1, 2].map(i => <QPSkeleton key={i} width="100%" height={44} borderRadius={10} style={styles.exploreSkeleton} />)}
					{!isLoading && exploreItems.length === 0 && <Text style={[styles.emptyText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{t('crypto.dashboard.empty')}</Text>}
				</View>

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
	// Mercados
	tabs: {
		flexDirection: 'row',
		gap: 22,
		borderBottomWidth: StyleSheet.hairlineWidth,
		marginBottom: 4,
	},
	tab: {
		paddingTop: 2,
		paddingBottom: 10,
	},
	tabIndicator: {
		position: 'absolute',
		left: 0,
		bottom: -StyleSheet.hairlineWidth,
		height: 2,
		borderRadius: 1,
	},
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
	exploreSkeleton: {
		marginVertical: 5,
	},
	emptyText: {
		textAlign: 'center',
		paddingVertical: 16,
	},
})

export default Crypto
