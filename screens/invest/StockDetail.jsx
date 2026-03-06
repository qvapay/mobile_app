import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// API
import { stocksApi } from '../../api/stocksApi'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'
import Sparkline from '../../ui/Sparkline'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { SvgUri } from 'react-native-svg'

const screenWidth = Dimensions.get('window').width

const TIMEFRAMES = ['1H', '24H', '1W', '1M', '1Y']

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
const StockDetail = ({ route }) => {

	const { symbol, icon, iconStyle, initialData, image } = route.params
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)

	const [stock, setStock] = useState(null)
	const [priceHistory, setPriceHistory] = useState([])
	const [timeframe, setTimeframe] = useState('24H')
	const [isLoading, setIsLoading] = useState(true)

	// Derive display values from stock (extended) or initialData (instant)
	const price = stock?.price ?? initialData?.price ?? 0
	const change = stock?.change ?? initialData?.change ?? 0
	const changeDollar = stock?.changeDollar ?? initialData?.changeDollar ?? 0
	const isPositive = change >= 0
	const trendColor = isPositive ? theme.colors.successText : theme.colors.danger

	// Fetch extended quote + initial price history
	useEffect(() => {
		let cancelled = false
		const load = async () => {
			setIsLoading(true)
			const [quoteRes, historyRes] = await Promise.all([
				stocksApi.show(symbol),
				stocksApi.priceHistory(symbol, '24H'),
			])
			if (cancelled) return
			if (quoteRes.success) setStock(quoteRes.data)
			if (historyRes.success && Array.isArray(historyRes.data)) setPriceHistory(historyRes.data)
			setIsLoading(false)
		}
		load()
		return () => { cancelled = true }
	}, [symbol])

	// Refetch price history when timeframe changes
	const fetchHistory = useCallback(async (tf) => {
		const res = await stocksApi.priceHistory(symbol, tf)
		if (res.success && Array.isArray(res.data)) setPriceHistory(res.data)
	}, [symbol])

	const handleTimeframeChange = useCallback((tf) => {
		setTimeframe(tf)
		fetchHistory(tf)
	}, [fetchHistory])

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

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} >
				{/* Header: Icon + Price */}
				<View style={styles.headerSection}>
					<View style={[styles.iconLarge, { backgroundColor: theme.colors.primary + '15' }]}>
						{image ? (
							<SvgUri uri={image} width={32} height={32} color={theme.colors.primary} />
						) : (
							<FontAwesome6 name={icon || 'building'} size={28} color={theme.colors.primary} iconStyle={iconStyle || 'solid'} />
						)}
					</View>
					<Text style={[styles.symbolText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{symbol}</Text>
					<Text style={[textStyles.amount]}>
						${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
					</Text>
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
						<Sparkline data={priceHistory} width={screenWidth - 40} height={180} color={trendColor} />
					) : (
						<View style={[styles.chartPlaceholder, { height: 180 }]}>
							{isLoading && <QPLoader />}
						</View>
					)}
				</View>

				{/* Timeframe Pills */}
				<View style={styles.pillRow}>
					{TIMEFRAMES.map((tf) => (
						<TimeframePill
							key={tf}
							label={tf}
							active={timeframe === tf}
							theme={theme}
							onPress={() => handleTimeframeChange(tf)}
						/>
					))}
				</View>

				{/* Buy / Sell Buttons */}
				<View style={styles.buttonRow}>
					<QPButton title="Comprar" style={styles.actionButton} disabled onPress={() => { }} />
					<QPButton title="Vender" style={styles.actionButton} outline disabled onPress={() => { }} />
				</View>

				{/* Statistics */}
				{stock && (
					<View style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme)]}>
						<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>Estadísticas</Text>
						<StatRow label="Apertura" value={formatPrice(stock.open)} theme={theme} />
						<StatRow label="Cierre anterior" value={formatPrice(stock.previousClose)} theme={theme} />
						<StatRow label="Máximo del día" value={formatPrice(stock.high)} theme={theme} />
						<StatRow label="Mínimo del día" value={formatPrice(stock.low)} theme={theme} />
						<StatRow label="Volumen" value={formatVolume(stock.volume)} theme={theme} />
						<StatRow label="Máx. 52 sem." value={formatPrice(stock.fiftyTwoWeekHigh)} theme={theme} />
						<StatRow label="Mín. 52 sem." value={formatPrice(stock.fiftyTwoWeekLow)} theme={theme} isLast />
					</View>
				)}

				{/* About */}
				{stock?.description ? (
					<View style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme)]}>
						<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>Acerca de</Text>
						<Text style={[styles.description, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{stock.description}</Text>
						{stock.sector ? <StatRow label="Sector" value={stock.sector} theme={theme} /> : null}
						{stock.exchange ? <StatRow label="Exchange" value={stock.exchange} theme={theme} /> : null}
						{stock.type ? <StatRow label="Tipo" value={stock.type} theme={theme} isLast /> : null}
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
	// Header
	headerSection: {
		alignItems: 'center',
		gap: 4,
		paddingVertical: 8,
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
	// Chart
	chartContainer: {
		alignItems: 'center',
		paddingHorizontal: 20,
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
		paddingHorizontal: 4,
	},
	actionButton: {
		flex: 1,
	},
	// Card
	card: {
		borderRadius: 14,
		padding: 12,
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
