import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// API
import { coinsApi } from '../../api/coinsApi'

// Routes
import { ROUTES } from '../../routes'

// Auth (tier del gráfico: PRO solo GOLD)
import { useAuth } from '../../auth/AuthContext'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'
import QPCoin from '../../ui/particles/QPCoin'
import QPPressable from '../../ui/particles/QPPressable'
import PriceChart from '../../ui/charts/PriceChart'
import PriceChartPro from '../../ui/charts/PriceChartPro'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import QPFitText from '../../ui/particles/QPFitText'


// Whitelist del backend (/coins/price-history) — cualquier otro valor cae a 24H
const TIMEFRAMES = ['1H', '24H', '1W', '1M', '1Y', 'ALL']

// Caché de sesión de historiales por tick:timeframe — el endpoint lleva un
// rate limit agresivo (ráfaga 5, 3/10s) y tapear las pills lo agotaría; el
// backend cachea 1h server-side así que repetir el fetch no aporta frescura
const historyCache = new Map()

const fetchHistoryCached = async (tick, tf) => {
	const key = `${tick}:${tf}`
	if (historyCache.has(key)) return historyCache.get(key)
	const res = await coinsApi.priceHistory(tick, tf)
	if (res.success && Array.isArray(res.data) && res.data.length > 1) {
		historyCache.set(key, res.data)
		return res.data
	}
	return null
}

const formatPrice = (p) => {
	const n = Number(p || 0)
	if (!n) return '—'
	return '$' + (n >= 1
		? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
		: n.toFixed(4))
}

// Fecha/hora del punto bajo el dedo durante el scrubbing (time = unix seconds
// del backend; defensivo con ms)
const formatScrubTime = (t) => {
	const ms = t > 1e12 ? t : t * 1000
	const date = new Date(ms)
	return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) +
		', ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
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
 * Coin detail (el "/coins/[tick]" del Invest): precio con gráfico por
 * timeframe (`coinsApi.priceHistory`, proxy CMC cacheado por el backend),
 * máximo/mínimo del periodo y capacidades de la moneda en QvaPay
 * (depósito/retiro/P2P + comisiones, del objeto `/coins/v2`).
 * Route params: `tick` (required), `name` y `initialData` (la fila ya
 * enriquecida del Invest) para pintar el header al instante.
 * El cambio % del header es SIEMPRE 24H (como StockDetail); las pills solo
 * refetchean el historial del gráfico y los máx/mín del periodo.
 * CTAs: Depositar (Add) y Mercado P2P pre-filtrado — el spot compra/venta
 * llegará cuando el backend lo soporte.
 */
const CoinDetail = ({ navigation, route }) => {

	const { tick, name, initialData } = route.params
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)

	// Tier del gráfico: PRO (scrubbing) solo para GOLD
	const { user } = useAuth()
	const isGold = !!user?.golden_check

	const [coin, setCoin] = useState(initialData || null)
	const [priceHistory, setPriceHistory] = useState(initialData?.priceHistory || [])
	const [timeframe, setTimeframe] = useState('24H')
	const [isLoading, setIsLoading] = useState(!initialData?.priceHistory?.length)
	// Punto bajo el dedo durante el scrubbing PRO — el header muestra su
	// precio/fecha en vez del precio live (estilo Robinhood)
	const [scrub, setScrub] = useState(null)

	// Derivados: precio del coin (o último punto del historial 24H) + cambio 24H
	const price = Number(coin?.price || 0)
	const change = Number(coin?.change || 0)
	const changeDollar = Number(coin?.changeDollar || 0)
	const isPositive = change >= 0
	const trendColor = isPositive ? theme.colors.successText : theme.colors.danger

	// Historial inicial (si la fila no venía enriquecida) + datos frescos del coin
	useEffect(() => {
		let cancelled = false
		const load = async () => {
			const needsHistory = !initialData?.priceHistory?.length
			const [history, coinsRes] = await Promise.all([
				needsHistory ? fetchHistoryCached(tick, '24H') : Promise.resolve(null),
				coinsApi.index({ category_id: 1, trade: 1 }),
			])
			if (cancelled) return
			if (history) {
				const first = Number(history[0]?.value || 0)
				const last = Number(history[history.length - 1]?.value || 0)
				setPriceHistory(history)
				// Enriquecer el header con el cambio 24H calculado del historial
				setCoin((prev) => ({
					...prev,
					price: prev?.price || last,
					change: first ? ((last - first) / first) * 100 : 0,
					changeDollar: last - first,
				}))
			}
			if (coinsRes.success && Array.isArray(coinsRes.data)) {
				// fresh aporta capacidades/comisiones; prev conserva el cambio 24H
				// y el precio ya enriquecidos
				const fresh = coinsRes.data.find((c) => c.tick === tick)
				if (fresh) setCoin((prev) => ({ ...fresh, ...prev }))
			}
			setIsLoading(false)
		}
		load()
		return () => { cancelled = true }
	}, [tick, initialData])

	// Refetch del historial al cambiar timeframe (el header no cambia)
	const handleTimeframeChange = useCallback(async (tf) => {
		setTimeframe(tf)
		const history = await fetchHistoryCached(tick, tf)
		if (history) setPriceHistory(history)
	}, [tick])

	// Máx/mín del periodo visible
	const values = priceHistory.map((p) => Number(p.value)).filter(Boolean)
	const periodHigh = values.length ? Math.max(...values) : 0
	const periodLow = values.length ? Math.min(...values) : 0

	const canDeposit = coin?.enabled_in === undefined || !!coin?.enabled_in
	const canP2P = coin?.enabled_p2p === undefined || !!coin?.enabled_p2p

	return (
		// Sin padding horizontal en el layout raíz: el ScrollView clipea a sus
		// bordes (los márgenes negativos no sangran) — cada sección pone su
		// propio padding y el gráfico queda libre a ancho completo de pantalla
		<View style={[containerStyles.subContainer, styles.noHPad]}>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

				{/* Header: Coin + Price (durante el scrubbing PRO muestra el punto activo) */}
				<View style={styles.headerSection}>
					<QPCoin coin={tick} size={56} />
					<Text style={[styles.symbolText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{tick}</Text>
					<QPFitText style={[textStyles.amount]}>{formatPrice(scrub ? scrub.value : price)}</QPFitText>
					{scrub ? (
						<View style={[styles.changeBadge, { backgroundColor: theme.colors.surface }]}>
							<FontAwesome6 name="clock" size={11} color={theme.colors.secondaryText} iconStyle="solid" />
							<Text style={[styles.changeBadgeText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>
								{formatScrubTime(scrub.time)}
							</Text>
						</View>
					) : change !== 0 && (
						<View style={[styles.changeBadge, { backgroundColor: trendColor + '18' }]}>
							<FontAwesome6 name={isPositive ? 'caret-up' : 'caret-down'} size={11} color={trendColor} iconStyle="solid" />
							<Text style={[styles.changeBadgeText, { color: trendColor, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }]}>
								{isPositive ? '+' : ''}{changeDollar >= 1 || changeDollar <= -1 ? changeDollar.toFixed(2) : changeDollar.toFixed(4)} ({isPositive ? '+' : ''}{change.toFixed(2)}%)
							</Text>
						</View>
					)}
				</View>

				{/* Chart — básico para todos, PRO con scrubbing para GOLD */}
				<View style={styles.chartContainer}>
					{priceHistory.length > 1 ? (
						isGold ? (
							// Más alto que el básico: el eje de tiempo ocupa una franja abajo
							<PriceChartPro data={priceHistory} trendColor={trendColor} onScrub={setScrub} height={230} />
						) : (
							<PriceChart data={priceHistory} trendColor={trendColor} height={200} />
						)
					) : (
						<View style={[styles.chartPlaceholder, { height: 200 }]}>
							{isLoading && <QPLoader />}
						</View>
					)}
				</View>

				{/* Upsell sutil del gráfico PRO (solo no-GOLD) */}
				{!isGold && priceHistory.length > 1 && (
					<QPPressable variant="opacity" onPress={() => navigation.navigate(ROUTES.GOLD_CHECK)} style={styles.proUpsell}>
						<FontAwesome6 name="crown" size={12} color={theme.colors.gold} iconStyle="solid" />
						<Text style={[styles.proUpsellText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>
							Explora el precio punto a punto con GOLD
						</Text>
					</QPPressable>
				)}

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

				{/* CTAs: lo que hoy se puede hacer con la moneda en QvaPay */}
				<View style={styles.buttonRow}>
					{canDeposit && (
						<QPButton
							title="Depositar"
							icon="arrow-down"
							style={styles.actionButton}
							onPress={() => navigation.navigate(ROUTES.ADD)}
						/>
					)}
					{canP2P && (
						<QPButton
							title="Mercado P2P"
							icon="scale-balanced"
							style={[styles.actionButton, { backgroundColor: theme.colors.surface }]}
							textStyle={{ color: theme.colors.primaryText }}
							iconColor={theme.colors.primaryText}
							// CoinDetail vive en el stack raíz y P2P es un tab DENTRO de
							// MainStack — sin la forma anidada el navigate no lo resuelve
							// ningún navigator (desde Invest funciona porque son tabs hermanos)
							onPress={() => navigation.navigate(ROUTES.MAIN_STACK, {
								screen: ROUTES.P2P_SCREEN,
								params: { coin: tick, coinName: name || coin?.name },
							})}
						/>
					)}
				</View>

				{/* Estadísticas del periodo + capacidades */}
				<View style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme)]}>
					<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>Estadísticas</Text>
					<StatRow label={`Máximo (${timeframe})`} value={formatPrice(periodHigh)} theme={theme} />
					<StatRow label={`Mínimo (${timeframe})`} value={formatPrice(periodLow)} theme={theme} />
					{coin?.fee_in != null && <StatRow label="Comisión de depósito" value={`${Number(coin.fee_in)}%`} theme={theme} />}
					{coin?.fee_out != null && <StatRow label="Comisión de retiro" value={`${Number(coin.fee_out)}%`} theme={theme} />}
					<StatRow label="Depósitos" value={coin?.enabled_in ? 'Disponible' : 'No disponible'} theme={theme} />
					<StatRow label="Retiros" value={coin?.enabled_out ? 'Disponible' : 'No disponible'} theme={theme} />
					<StatRow label="P2P" value={coin?.enabled_p2p ? 'Disponible' : 'No disponible'} theme={theme} isLast />
				</View>

				{/* Spot: teaser de futuro */}
				<View style={[styles.card, styles.spotTeaser, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme)]}>
					<FontAwesome6 name="chart-line" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
					<Text style={[styles.spotTeaserText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
						Compra y venta spot — próximamente
					</Text>
				</View>
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
	headerSection: {
		alignItems: 'center',
		gap: 4,
		paddingVertical: 8,
		paddingHorizontal: 16,
	},
	symbolText: {
		marginTop: 4,
	},
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
	// Full width real: sin padding del layout, el gráfico ES el ancho de pantalla
	chartContainer: {
		alignItems: 'stretch',
	},
	proUpsell: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		marginTop: -8,
	},
	proUpsellText: {},
	chartPlaceholder: {
		justifyContent: 'center',
		alignItems: 'center',
		width: '100%',
	},
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
	buttonRow: {
		flexDirection: 'row',
		gap: 10,
		paddingHorizontal: 20,
	},
	actionButton: {
		flex: 1,
	},
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
	spotTeaser: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
	},
	spotTeaserText: {},
})

export default CoinDetail
