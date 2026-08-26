import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'

// i18n (locale de fechas del scrubbing)
import { getDateLocale } from '../../i18n'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Data (React Query)
import { useCoinHistoryQuery, useInvestCoinsQuery } from './investQueries'

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

// Tipos
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../types/navigation'
import type { Theme } from '../../theme/ThemeContext'
import type { EnrichedCoin } from '../../types/domain'
import type { RawPricePoint } from '../../ui/charts/PriceChart'
import type { ScrubPoint } from '../../ui/charts/PriceChartPro'

type CoinDetailProps = NativeStackScreenProps<RootStackParamList, 'CoinDetail'>

/**
 * `StyleSheet.create` es una función IDENTIDAD, pero su tipo solo admite
 * objetos de estilo; esta hoja mezcla estáticos con builders que reciben el
 * theme (`cardBorder(theme)`). El alias tipado los deja convivir sin tocar el
 * runtime: se sigue emitiendo `StyleSheet.create({ … })`.
 */
type StyleMap = Record<string, ViewStyle | TextStyle | ImageStyle | ((theme: Theme) => ViewStyle)>

/**
 * OJO (pre-existente, NO tocado): el theme expone `isDark`, no `mode`, así que
 * la comparación contra 'light' es siempre falsa en runtime y el borde claro de
 * las cards nunca se pinta. Se conserva tal cual con un cast local.
 */
const themeMode = (theme: Theme) => (theme as Theme & { mode?: 'light' | 'dark' }).mode

// Whitelist del backend (/coins/price-history) — cualquier otro valor cae a 24H.
// Son VALORES del API; el label visible es `invest.timeframes.<valor>`
const TIMEFRAMES = ['1H', '24H', '1W', '1M', '1Y', 'ALL']

// Cambio 24H calculado de un historial (para enriquecer el header cuando la
// fila de origen no venía enriquecida)
const statsFromHistory = (history?: { value?: number | string }[] | null) => {
	if (!history?.length) return null
	const first = Number(history[0]?.value || 0)
	const last = Number(history[history.length - 1]?.value || 0)
	return {
		price: last,
		change: first ? ((last - first) / first) * 100 : 0,
		changeDollar: last - first,
	}
}

const formatPrice = (p?: number | string | null) => {
	const n = Number(p || 0)
	if (!n) return '—'
	return '$' + (n >= 1
		? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
		: n.toFixed(4))
}

// Fecha/hora del punto bajo el dedo durante el scrubbing (time = unix seconds
// del backend; defensivo con ms)
const formatScrubTime = (t: number) => {
	const ms = t > 1e12 ? t : t * 1000
	const date = new Date(ms)
	const locale = getDateLocale()
	return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) +
		', ' + date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

// --- Sub-components ---
const TimeframePill = ({ label, active, theme, onPress }: { label: string, active: boolean, theme: Theme, onPress: () => void }) => (
	<Pressable onPress={onPress} style={[styles.pill, active ? { backgroundColor: theme.colors.primary } : { backgroundColor: theme.colors.surface }]}>
		<Text style={[styles.pillText, { color: active ? theme.colors.buttonText : theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.semiBold }]}>
			{label}
		</Text>
	</Pressable>
)

const StatRow = ({ label, value, theme, isLast }: { label: string, value: string, theme: Theme, isLast?: boolean }) => (
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
const CoinDetail = ({ navigation, route }: CoinDetailProps) => {

	const { tick, name, initialData } = route.params
	// `initialData` se declara `Coin | EnrichedCoin`: quien navega aquí (Invest y
	// la watchlist del Home) siempre manda la fila ya enriquecida, que es la
	// única que trae `priceHistory` — alias tipado, mismo objeto
	const initialCoin = initialData as EnrichedCoin | undefined
	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)

	// Tier del gráfico: PRO (scrubbing) solo para GOLD
	const { user } = useAuth()
	const isGold = !!user?.golden_check

	const [timeframe, setTimeframe] = useState('24H')

	// Historial en React Query (clave tick+timeframe, 1h de frescura — el
	// endpoint tiene rate limit agresivo y el backend ya cachea 1h): tapear las
	// pills no repite peticiones y el gráfico anterior queda como placeholder.
	// Con initialData enriquecida, el 24H inicial ni siquiera va a la red
	const historyQuery = useCoinHistoryQuery(tick, timeframe, {
		enabled: timeframe !== '24H' || !initialCoin?.priceHistory?.length,
	})
	const priceHistory: { time?: string | number, value: number }[] = historyQuery.data || (timeframe === '24H' ? initialCoin?.priceHistory || [] : [])
	const isLoading = !priceHistory.length && historyQuery.isFetching

	// Capacidades/comisiones frescas del catálogo — la MISMA query del
	// dashboard de Invest, así que venir desde allí es un acierto de caché
	const coinsQuery = useInvestCoinsQuery()

	// Enriquecimiento 24H para el header cuando la fila no venía enriquecida:
	// se congela la primera vez que hay historial 24H disponible
	const [stats24, setStats24] = useState(() => statsFromHistory(initialCoin?.priceHistory))
	useEffect(() => {
		if (!stats24 && timeframe === '24H' && historyQuery.data) {
			setStats24(statsFromHistory(historyQuery.data))
		}
	}, [stats24, timeframe, historyQuery.data])

	// fresh aporta capacidades/comisiones; initialData y el 24H calculado
	// conservan el precio/cambio ya enriquecidos (misma precedencia que antes)
	const coin = useMemo(() => {
		const fresh = coinsQuery.data?.find((c) => c.tick === tick) || null
		const base = { ...(fresh || {}), ...(initialData || {}) }
		// Se lee `initialData` (y no el alias `initialCoin`) para que las deps del
		// memo sigan siendo exactamente las de antes
		if (!(initialData as EnrichedCoin | undefined)?.priceHistory?.length && stats24) {
			return { ...base, price: base.price || stats24.price, change: stats24.change, changeDollar: stats24.changeDollar }
		}
		return base
	}, [coinsQuery.data, initialData, stats24, tick])
	// Punto bajo el dedo durante el scrubbing PRO — el header muestra su
	// precio/fecha en vez del precio live (estilo Robinhood)
	const [scrub, setScrub] = useState<ScrubPoint | null>(null)

	// Derivados: precio del coin (o último punto del historial 24H) + cambio 24H
	const price = Number(coin?.price || 0)
	const change = Number(coin?.change || 0)
	const changeDollar = Number(coin?.changeDollar || 0)
	const isPositive = change >= 0
	const trendColor = isPositive ? theme.colors.successText : theme.colors.danger

	// Cambiar de timeframe es cambiar de query; el header no cambia
	const handleTimeframeChange = useCallback((tf: string) => { setTimeframe(tf) }, [])

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
							<PriceChartPro data={priceHistory as RawPricePoint[]} trendColor={trendColor} onScrub={setScrub} height={230} />
						) : (
							<PriceChart data={priceHistory as RawPricePoint[]} trendColor={trendColor} height={200} />
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
							{t('invest.coinDetail.goldUpsell')}
						</Text>
					</QPPressable>
				)}

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

				{/* CTAs: lo que hoy se puede hacer con la moneda en QvaPay */}
				<View style={styles.buttonRow}>
					{canDeposit && (
						<QPButton
							title={t('invest.common.deposit')}
							icon="arrow-down"
							style={styles.actionButton}
							onPress={() => navigation.navigate(ROUTES.ADD)}
						/>
					)}
					{canP2P && (
						<QPButton
							title={t('invest.common.p2pMarket')}
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
				<View style={[styles.card, { backgroundColor: theme.colors.surface }, themeMode(theme) === 'light' && styles.cardBorder(theme)]}>
					<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('invest.common.statistics')}</Text>
					<StatRow label={t('invest.coinDetail.periodHigh', { timeframe: t(`invest.timeframes.${timeframe}`) })} value={formatPrice(periodHigh)} theme={theme} />
					<StatRow label={t('invest.coinDetail.periodLow', { timeframe: t(`invest.timeframes.${timeframe}`) })} value={formatPrice(periodLow)} theme={theme} />
					{coin?.fee_in != null && <StatRow label={t('invest.coinDetail.depositFee')} value={`${Number(coin.fee_in)}%`} theme={theme} />}
					{coin?.fee_out != null && <StatRow label={t('invest.coinDetail.withdrawFee')} value={`${Number(coin.fee_out)}%`} theme={theme} />}
					<StatRow label={t('invest.coinDetail.deposits')} value={coin?.enabled_in ? t('invest.coinDetail.available') : t('invest.coinDetail.notAvailable')} theme={theme} />
					<StatRow label={t('invest.coinDetail.withdrawals')} value={coin?.enabled_out ? t('invest.coinDetail.available') : t('invest.coinDetail.notAvailable')} theme={theme} />
					<StatRow label="P2P" value={coin?.enabled_p2p ? t('invest.coinDetail.available') : t('invest.coinDetail.notAvailable')} theme={theme} isLast />
				</View>

				{/* Spot: teaser de futuro */}
				<View style={[styles.card, styles.spotTeaser, { backgroundColor: theme.colors.surface }, themeMode(theme) === 'light' && styles.cardBorder(theme)]}>
					<FontAwesome6 name="chart-line" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
					<Text style={[styles.spotTeaserText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
						{t('invest.coinDetail.spotTeaser')}
					</Text>
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
		// 16 = el mismo margen lateral de las tarjetas y del header: todo el
		// contenido comparte una única línea vertical (el gráfico es la
		// excepción deliberada, va a ancho completo)
		paddingHorizontal: 16,
	},
	actionButton: {
		flex: 1,
	},
	card: {
		borderRadius: 14,
		padding: 12,
		marginHorizontal: 16,
	},
	cardBorder: (theme: Theme) => ({
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
	statBorder: (theme: Theme) => ({
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
