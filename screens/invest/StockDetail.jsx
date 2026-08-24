import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// API
import { useStockQuery, useStockHistoryQuery } from './investQueries'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'
import PriceChart from '../../ui/charts/PriceChart'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import QPSvgUri from '../../ui/particles/QPSvgUri'
import QPFitText from '../../ui/particles/QPFitText'


// Valores del API de histórico; el label visible es `invest.timeframes.<valor>`
const TIMEFRAMES = ['1H', '24H', '1W', '1M', '1Y']

// Format volume: 45230000 → "45.2M"
const formatVolume = (vol) => {
	if (!vol) return '—'
	if (vol >= 1_000_000_000) return (vol / 1_000_000_000).toFixed(1) + 'B'
	if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(1) + 'M'
	if (vol >= 1_000) return (vol / 1_000).toFixed(1) + 'K'
	return vol.toString()
}

const formatPrice = (p) => {
	if (!p) return '—'
	return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// --- Sub-components ---
const TimeframePill = ({ label, active, theme, onPress }) => (
	<Pressable onPress={onPress} style={[styles.pill, active ? { backgroundColor: theme.colors.primary } : { backgroundColor: theme.colors.surface }]}>
		<Text style={[styles.pillText, { color: active ? theme.colors.buttonText : theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.semiBold }]}>
			{label}
		</Text>
	</Pressable>
)

const StatRow = ({ label, value, theme, isLast }) => (
	<View style={[styles.statRow, !isLast && styles.statBorder(theme)]}>
		<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{label}</Text>
		<Text style={[styles.statValue, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }]}>{value}</Text>
	</View>
)

// --- Main Component ---

/**
 * Stock quote detail with a timeframe-switchable price chart.
 * Route params: `symbol` (required) plus optional `initialData`, `icon`/`iconStyle`
 * and `image` so the header paints instantly while the extended quote loads
 * (`stocksApi.show` + `stocksApi.priceHistory`).
 * Timeframe pills (1H–1Y) refetch only the price history, not the quote.
 */
const StockDetail = ({ route }) => {

	const { symbol, icon, iconStyle, initialData, image } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)

	const [timeframe, setTimeframe] = useState('24H')

	// Cotización + histórico en React Query: claves por símbolo y timeframe,
	// cambiar de pill no vacía el gráfico (placeholder del timeframe anterior)
	const stockQuery = useStockQuery(symbol)
	const historyQuery = useStockHistoryQuery(symbol, timeframe)
	const stock = stockQuery.data || null
	const priceHistory = historyQuery.data || []
	const isLoading = historyQuery.isPending

	// Derive display values from stock (extended) or initialData (instant)
	const price = stock?.price ?? initialData?.price ?? 0
	const change = stock?.change ?? initialData?.change ?? 0
	const changeDollar = stock?.changeDollar ?? initialData?.changeDollar ?? 0
	const isPositive = change >= 0
	const trendColor = isPositive ? theme.colors.successText : theme.colors.danger

	// Cambiar de timeframe es cambiar de query: React Query trae el histórico
	const handleTimeframeChange = useCallback((tf) => { setTimeframe(tf) }, [])

	return (
		// Sin padding horizontal en el layout raíz (ver CoinDetail): el gráfico
		// corre a ancho completo y cada sección pone su propio padding
		<View style={[containerStyles.subContainer, styles.noHPad]}>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} >
				{/* Header: Icon + Price */}
				<View style={styles.headerSection}>
					<View style={[styles.iconLarge, { backgroundColor: theme.colors.primary + '15' }]}>
						{image ? (
							<QPSvgUri uri={image} width={32} height={32} color={theme.colors.primary} />
						) : (
							<FontAwesome6 name={icon || 'building'} size={28} color={theme.colors.primary} iconStyle={iconStyle || 'solid'} />
						)}
					</View>
					<Text style={[styles.symbolText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{symbol}</Text>
					<QPFitText style={[textStyles.amount]}>
						${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
					</QPFitText>
					<View style={[styles.changeBadge, { backgroundColor: trendColor + '18' }]}>
						<FontAwesome6 name={isPositive ? 'caret-up' : 'caret-down'} size={11} color={trendColor} iconStyle="solid" />
						<Text style={[styles.changeBadgeText, { color: trendColor, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }]}>
							{isPositive ? '+' : ''}{changeDollar.toFixed(2)} ({isPositive ? '+' : ''}{change.toFixed(2)}%)
						</Text>
					</View>
				</View>

				{/* Chart */}
				<View style={styles.chartContainer}>
					{priceHistory.length > 1 ? (
						<PriceChart data={priceHistory} trendColor={trendColor} height={200} />
					) : (
						<View style={[styles.chartPlaceholder, { height: 200 }]}>
							{isLoading && <QPLoader />}
						</View>
					)}
				</View>

				{/* Timeframe Pills */}
				<View style={styles.pillRow}>
					{TIMEFRAMES.map((tf) => (
						<TimeframePill
							key={tf}
							label={t(`invest.timeframes.${tf}`)}
							active={timeframe === tf}
							theme={theme}
							onPress={() => handleTimeframeChange(tf)}
						/>
					))}
				</View>

				{/* Buy / Sell Buttons */}
				<View style={styles.buttonRow}>
					<QPButton title={t('invest.stockDetail.buy')} style={styles.actionButton} disabled onPress={() => { }} />
					<QPButton title={t('invest.stockDetail.sell')} style={styles.actionButton} outline disabled onPress={() => { }} />
				</View>

				{/* Statistics */}
				{stock && (
					<View style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme)]}>
						<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('invest.common.statistics')}</Text>
						<StatRow label={t('invest.stockDetail.open')} value={formatPrice(stock.open)} theme={theme} />
						<StatRow label={t('invest.stockDetail.previousClose')} value={formatPrice(stock.previousClose)} theme={theme} />
						<StatRow label={t('invest.stockDetail.dayHigh')} value={formatPrice(stock.high)} theme={theme} />
						<StatRow label={t('invest.stockDetail.dayLow')} value={formatPrice(stock.low)} theme={theme} />
						<StatRow label={t('invest.stockDetail.volume')} value={formatVolume(stock.volume)} theme={theme} />
						<StatRow label={t('invest.stockDetail.fiftyTwoWeekHigh')} value={formatPrice(stock.fiftyTwoWeekHigh)} theme={theme} />
						<StatRow label={t('invest.stockDetail.fiftyTwoWeekLow')} value={formatPrice(stock.fiftyTwoWeekLow)} theme={theme} isLast />
					</View>
				)}

				{/* About */}
				{stock?.description ? (
					<View style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme)]}>
						<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('invest.stockDetail.about')}</Text>
						<Text style={[styles.description, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{stock.description}</Text>
						{stock.sector ? <StatRow label={t('invest.stockDetail.sector')} value={stock.sector} theme={theme} /> : null}
						{stock.exchange ? <StatRow label={t('invest.stockDetail.exchange')} value={stock.exchange} theme={theme} /> : null}
						{stock.type ? <StatRow label={t('invest.stockDetail.type')} value={stock.type} theme={theme} isLast /> : null}
					</View>
				) : null}
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
		gap: 16,
		paddingTop: 8,
	},
	noHPad: {
		paddingHorizontal: 0,
	},
	// Header
	headerSection: {
		alignItems: 'center',
		gap: 4,
		paddingVertical: 8,
		paddingHorizontal: 16,
	},
	iconLarge: {
		width: 56,
		height: 56,
		borderRadius: 28,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 4,
	},
	symbolText: {},
	changeBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 8,
		marginTop: 4,
	},
	changeBadgeText: {},
	// Chart — full width real (el layout raíz no lleva padding horizontal)
	chartContainer: {
		alignItems: 'stretch',
	},
	chartPlaceholder: {
		justifyContent: 'center',
		alignItems: 'center',
		width: '100%',
	},
	// Timeframe pills
	pillRow: {
		flexDirection: 'row',
		justifyContent: 'center',
		gap: 8,
	},
	pill: {
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 16,
	},
	pillText: {},
	// Buttons
	buttonRow: {
		flexDirection: 'row',
		gap: 10,
		// 16 = el mismo margen lateral de las tarjetas y del header: todo el
		// contenido comparte una única línea vertical (el gráfico es la
		// excepción deliberada, va a ancho completo)
		paddingHorizontal: 16,
	},
	actionButton: {
		flex: 1,
	},
	// Card
	card: {
		borderRadius: 14,
		padding: 12,
		marginHorizontal: 16,
	},
	cardBorder: (theme) => ({
		borderWidth: 1,
		borderColor: theme.colors.border,
	}),
	sectionTitle: {
		marginBottom: 8,
	},
	// Stats
	statRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 10,
	},
	statBorder: (theme) => ({
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: theme.colors.border + '60',
	}),
	statLabel: {},
	statValue: {},
	// About
	description: {
		lineHeight: 20,
		marginBottom: 8,
	},
})

export default StockDetail
