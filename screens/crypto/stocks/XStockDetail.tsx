import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { getDateLocale } from '../../../i18n'
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles } from '../../../theme/themeUtils'
import { ROUTES } from '../../../routes'
import QPBalance from '../../../ui/particles/QPBalance'
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'
import PriceChartPro from '../../../ui/charts/PriceChartPro'
import { displayAmount } from '../../../wallet/chains/units'
import { xStockByMint } from '../../../wallet/xstocks'
import { useStockHistoryQuery } from '../cryptoQueries'
import { ChangeLine, RiskSheet, StockLogo, formatPct, formatUsd, trendInk } from './components/StockParts'
import { useXStockPortfolio } from './xstocksQueries'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { Theme } from '../../../theme/ThemeContext'
import type { RawPricePoint } from '../../../ui/charts/pricePoints'
import type { ScrubPoint } from '../../../ui/charts/PriceChartPro'

type Props = NativeStackScreenProps<RootStackParamList, 'XStockDetail'>

/** Valores del API de histórico del subyacente (`/stocks/{tick}?timeframe=`). */
const TIMEFRAMES = ['24H', '1W', '1M', '1Y'] as const

const formatScrubTime = (time: number) => {
	const ms = time > 1e12 ? time : time * 1000
	const date = new Date(ms)
	const locale = getDateLocale()
	return `${date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
}

const StatRow = ({ label, value, theme, isLast }: { label: string, value: string, theme: Theme, isLast?: boolean }) => (
	<View style={[styles.statRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
		<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>{label}</Text>
		<Text style={{ color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>{value}</Text>
	</View>
)

/**
 * Detalle de una acción tokenizada, estilo Robinhood: el precio en grande sigue al dedo sobre
 * el gráfico, TODA la pantalla toma el color de la tendencia del periodo, tu posición debajo y
 * Comprar/Vender fijos abajo.
 *
 * El precio en vivo es el del TOKEN (Jupiter, 24/7); el gráfico es el del subyacente (bolsa de
 * EE. UU.): fuera de horario pueden separarse un poco, y eso se dice en los riesgos.
 */
const XStockDetail = ({ navigation, route }: Props) => {

	const { mint } = route.params
	const stock = xStockByMint(mint)
	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const insets = useSafeAreaInsets()

	const [timeframe, setTimeframe] = useState<typeof TIMEFRAMES[number]>('24H')
	const [scrub, setScrub] = useState<ScrubPoint | null>(null)
	const [riskOpen, setRiskOpen] = useState(false)

	const { positions } = useXStockPortfolio()
	const position = positions.find(p => p.stock.mint === mint) ?? null
	const quote = position?.quote ?? null
	const history = useStockHistoryQuery(stock?.underlying ?? '', timeframe)
	const points = useMemo(() => (history.data ?? []) as RawPricePoint[], [history.data])

	// Variación del PERIODO elegido: 24H de la cotización viva; el resto, del propio histórico
	const periodChange = useMemo(() => {
		if (timeframe === '24H' && quote?.change24h !== null && quote?.change24h !== undefined && quote) {
			const previous = quote.price / (1 + quote.change24h / 100)
			return { amount: quote.price - previous, pct: quote.change24h }
		}
		const first = Number(points[0]?.value)
		const last = quote?.price ?? Number(points[points.length - 1]?.value)
		if (!(first > 0) || !(last > 0)) return null
		return { amount: last - first, pct: ((last - first) / first) * 100 }
	}, [timeframe, quote, points])

	const ink = trendInk(theme, periodChange?.amount)
	const heroValue = scrub ? scrub.value : quote?.price ?? 0
	const held = (position?.raw ?? 0n) > 0n

	const trade = useCallback((side: 'buy' | 'sell') => navigation.navigate(ROUTES.XSTOCK_TRADE, { mint, side }), [navigation, mint])

	if (!stock) return null

	return (
		<View style={[containerStyles.subContainer, styles.noHPad]}>
			<ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]} showsVerticalScrollIndicator={false}>
				<View style={styles.hero}>
					<View style={styles.titleRow}>
						<StockLogo stock={stock} size={28} />
						<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.medium }}>
							{stock.name} · {stock.underlying}
						</Text>
					</View>
					<QPBalance animated={!scrub} amount={heroValue} fractionDigits={2} fontSize={theme.typography.fontSize.display} theme={theme} />
					{scrub ? (
						<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>{formatScrubTime(scrub.time)}</Text>
					) : periodChange ? (
						<ChangeLine amount={periodChange.amount} pct={periodChange.pct} label={t(`crypto.xstocks.periods.${timeframe}`)} theme={theme} />
					) : null}
				</View>

				<View style={styles.chart}>
					{points.length > 1
						? <PriceChartPro data={points} trendColor={ink} onScrub={setScrub} height={230} />
						: <View style={styles.chartPlaceholder}>{history.isFetching && <QPLoader />}</View>}
				</View>

				{/* Periodos: el activo toma el color de la tendencia, como el gráfico */}
				<View style={styles.pills}>
					{TIMEFRAMES.map(tf => {
						const active = tf === timeframe
						return (
							<Pressable key={tf} onPress={() => setTimeframe(tf)} style={[styles.pill, active && { backgroundColor: ink + '24' }]} accessibilityRole="button" accessibilityState={{ selected: active }}>
								<Text style={{ color: active ? ink : theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }}>{t(`crypto.xstocks.timeframes.${tf}`)}</Text>
							</Pressable>
						)
					})}
				</View>

				<View style={styles.sections}>
					{held && position && (
						<View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
							<Text style={[styles.cardTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('crypto.xstocks.detail.yourPosition')}</Text>
							<StatRow label={t('crypto.xstocks.detail.shares')} value={displayAmount(position.shares, 6)} theme={theme} />
							<StatRow label={t('crypto.xstocks.detail.marketValue')} value={formatUsd(position.value)} theme={theme} />
							<StatRow label={t('crypto.xstocks.detail.todayReturn')} value={position.dayChange === null ? '—' : `${formatUsd(position.dayChange)} (${formatPct(quote?.change24h ?? 0)})`} theme={theme} />
							{/* El token es del usuario: enviarlo, recibirlo y su historial viven en su pantalla de activo */}
							<Pressable
								onPress={() => navigation.navigate(ROUTES.WALLET_ASSET, { assetId: position.assetId })}
								style={styles.walletLink}
								hitSlop={6}
								accessibilityRole="button"
								testID="xstock-manage-in-wallet"
							>
								<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>{t('crypto.xstocks.detail.manageInWallet')}</Text>
								<FontAwesome6 name="chevron-right" size={11} color={theme.colors.primary} iconStyle="solid" />
							</Pressable>
						</View>
					)}

					<View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
						<Text style={[styles.cardTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('crypto.xstocks.detail.stats')}</Text>
						<StatRow label={t('crypto.xstocks.detail.tokenPrice')} value={formatUsd(quote?.price)} theme={theme} />
						<StatRow label={t('crypto.xstocks.detail.liquidity')} value={formatUsd(quote?.liquidity, 0)} theme={theme} />
						<StatRow label={t('crypto.xstocks.detail.token')} value={stock.symbol} theme={theme} />
						<StatRow label={t('crypto.xstocks.detail.network')} value="Solana" theme={theme} />
						<StatRow label={t('crypto.xstocks.detail.issuer')} value="Backed Finance (xStocks)" theme={theme} isLast />
					</View>

					<View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
						<Text style={[styles.cardTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('crypto.xstocks.detail.about')}</Text>
						<Text style={[styles.about, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
							{t('crypto.xstocks.detail.aboutBody', { name: stock.name, underlying: stock.underlying, symbol: stock.symbol })}
						</Text>
						<Pressable onPress={() => setRiskOpen(true)} style={styles.riskLink} hitSlop={8}>
							<FontAwesome6 name="triangle-exclamation" size={12} color={theme.colors.primary} iconStyle="solid" />
							<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>{t('crypto.xstocks.detail.risksLink')}</Text>
						</Pressable>
					</View>
				</View>
			</ScrollView>

			{/* Comprar / Vender fijos abajo, fuera del scroll */}
			<View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: theme.colors.background }]}>
				{held && (
					<QPButton
						title={t('crypto.xstocks.sell')}
						onPress={() => trade('sell')}
						style={[styles.footerButton, { backgroundColor: theme.colors.surface }]}
						textStyle={{ color: theme.colors.primaryText }}
					/>
				)}
				<QPButton title={t('crypto.xstocks.buy')} onPress={() => trade('buy')} style={styles.footerButton} disabled={!quote} />
			</View>

			<RiskSheet visible={riskOpen} onClose={() => setRiskOpen(false)} theme={theme} />
		</View>
	)
}

const styles = StyleSheet.create({
	noHPad: {
		paddingHorizontal: 0,
	},
	content: {
		gap: 14,
	},
	hero: {
		paddingHorizontal: 20,
		paddingTop: 8,
		gap: 4,
	},
	titleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	chart: {
		minHeight: 230,
	},
	chartPlaceholder: {
		height: 230,
		justifyContent: 'center',
		alignItems: 'center',
	},
	pills: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		paddingHorizontal: 20,
	},
	pill: {
		paddingHorizontal: 14,
		paddingVertical: 7,
		borderRadius: 10,
		borderCurve: 'continuous',
	},
	sections: {
		paddingHorizontal: 16,
		gap: 12,
	},
	card: {
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	cardTitle: {
		marginBottom: 4,
	},
	statRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingVertical: 10,
	},
	about: {
		lineHeight: 20,
		marginTop: 4,
	},
	riskLink: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		marginTop: 12,
	},
	walletLink: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingTop: 12,
		paddingBottom: 2,
	},
	footer: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: 'row',
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 10,
	},
	footerButton: {
		flex: 1,
	},
})

export default XStockDetail
