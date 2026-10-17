import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles } from '../../../theme/themeUtils'
import { useWallet } from '../../../wallet/WalletContext'
import { ROUTES } from '../../../routes'
import QPButton from '../../../ui/particles/QPButton'
import QPFitText from '../../../ui/particles/QPFitText'
import { applyKeypadKey } from '../../keypad/keypadAmount'
import { displayAmount, formatUnits } from '../../../wallet/chains/units'
import { xStockByMint, XSTOCK_DECIMALS } from '../../../wallet/xstocks'
import { onchainQuoteParams } from '../wallet/onchainSwapModel'
import { useExchangeQuoteQuery } from '../wallet/exchangeQueries'
import { useWalletAssets } from '../wallet/walletQueries'
import { RiskSheet, StockLogo, formatUsd } from './components/StockParts'
import { useXStockPortfolio } from './xstocksQueries'
import { rawForUsd } from './xstocksModel'
import type { ApiError } from '../../../api/unwrap'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'XStockTrade'>

/** Con qué se compra y a qué se vende: USDC en Solana (la misma red que los xStocks: una sola firma). */
export const XSTOCK_CASH_ASSET = 'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
/** Por debajo, la comisión de red y la cuenta de token se comen la operación. */
const MIN_USD = 1
/** SOL mínimo para la tarifa y, en la primera compra de una acción, la renta de su cuenta (~0,0016). */
const MIN_SOL_FOR_FEES = 0.004
const QUOTE_DEBOUNCE_MS = 500
const RISK_ACK_KEY = '@qpxstocks:risk-ack'

const KEYS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', 'backspace']]

/**
 * Comprar o vender una acción tokenizada por IMPORTE en dólares (como Robinhood): se teclea
 * "$25" y se ve cuántas acciones son. Por debajo es un swap USDC ↔ xStock por Jupiter en
 * Solana; la verificación, la firma y el seguimiento son los de `WalletOnchainSwap`, sin
 * atajos — esta pantalla solo cotiza y lleva allí la ruta elegida.
 */
const XStockTrade = ({ navigation, route }: Props) => {

	const { mint, side } = route.params
	const stock = xStockByMint(mint)
	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const insets = useSafeAreaInsets()
	const { addresses } = useWallet()

	const { all } = useWalletAssets()
	const cash = all.find(view => view.id === XSTOCK_CASH_ASSET) ?? null
	const sol = all.find(view => view.id === 'solana:native') ?? null
	const { positions } = useXStockPortfolio()
	const position = positions.find(p => p.stock.mint === mint) ?? null
	const quote = position?.quote ?? null
	const stockAssetId = `solana:${mint}`

	const [amount, setAmount] = useState('0')
	const [sellAll, setSellAll] = useState(false)
	const usd = Number(amount) || 0

	// --- Lo que se pide al motor de swap, en la unidad del ORIGEN ---
	const order = useMemo(() => {
		if (side === 'buy') return { from: XSTOCK_CASH_ASSET, to: stockAssetId, amountIn: usd }
		const raw = sellAll ? position?.raw ?? 0n : quote ? rawForUsd(usd, quote, position?.raw ?? 0n) : 0n
		return { from: stockAssetId, to: XSTOCK_CASH_ASSET, amountIn: raw > 0n ? Number(formatUnits(raw, XSTOCK_DECIMALS)) : 0 }
	}, [side, usd, sellAll, position?.raw, quote, stockAssetId])

	const available = side === 'buy' ? Number(cash?.amount ?? 0) : position?.value ?? 0
	const problem = usd <= 0 ? null
		: usd < MIN_USD ? t('crypto.xstocks.trade.min', { min: formatUsd(MIN_USD) })
			: !sellAll && usd > available + 1e-9 ? t(side === 'buy' ? 'crypto.xstocks.trade.noCash' : 'crypto.xstocks.trade.noShares')
				: Number(sol?.amount ?? 0) < MIN_SOL_FOR_FEES ? t('crypto.xstocks.trade.noSol')
					: null

	// Cotizar cuando el usuario para de teclear (el bucket del backend es de 20/min)
	const [debounced, setDebounced] = useState(order.amountIn)
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(order.amountIn), QUOTE_DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [order.amountIn])

	const onchain = useMemo(() => onchainQuoteParams(addresses), [addresses])
	const quoteQuery = useExchangeQuoteQuery({
		fromAssetId: order.from,
		toAssetId: order.to,
		amount: debounced,
		onchain,
		enabled: !problem && debounced > 0 && debounced === order.amountIn,
	})
	const jupiterRoute = quoteQuery.data?.routes?.find(r => r.provider === 'jupiter' && r.quote_id) ?? null
	// La ruta solo vale para el importe que se VE: mientras corre el debounce (o con la de la
	// clave anterior como placeholder) es la de OTRO importe, y no se pinta ni se firma
	const quoteIsCurrent = debounced === order.amountIn && !quoteQuery.isPlaceholderData
	const jupiter = quoteIsCurrent ? jupiterRoute : null
	const quoteError = quoteQuery.error as ApiError | null
	const regionBlocked = quoteError?.status === 451

	// Estimación local mientras llega la cotización: acciones al comprar, dólares al vender
	const estimate = side === 'buy'
		? (quote && usd > 0 ? t('crypto.xstocks.trade.approxShares', { shares: displayAmount(String(usd / quote.price), 6), symbol: stock?.underlying }) : null)
		: (sellAll && position ? t('crypto.xstocks.trade.sellAllHint', { shares: displayAmount(position.shares, 6) }) : null)

	const onKey = useCallback((key: string) => {
		ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
		setSellAll(false)
		setAmount(prev => applyKeypadKey(prev, key))
	}, [])

	const onSellAll = useCallback(() => {
		setSellAll(true)
		setAmount((position?.value ?? 0).toFixed(2))
	}, [position?.value])

	// --- Riesgos: una vez, antes de la primera operación ---
	const [riskOpen, setRiskOpen] = useState(false)
	const goSign = useCallback(() => {
		if (!jupiter?.quote_id) return
		navigation.navigate(ROUTES.WALLET_ONCHAIN_SWAP, {
			quoteId: jupiter.quote_id,
			fromAssetId: order.from,
			toAssetId: order.to,
			amount: debounced,
			expectedOut: jupiter.amount_out,
			providerLabel: jupiter.provider_label,
			serviceFeeBps: jupiter.service_fee_bps,
		})
	}, [jupiter, navigation, order.from, order.to, debounced])
	const onReview = useCallback(async () => {
		let acknowledged = false
		try { acknowledged = (await AsyncStorage.getItem(RISK_ACK_KEY)) === '1' } catch { }
		if (acknowledged) goSign()
		else setRiskOpen(true)
	}, [goSign])
	const onAcceptRisks = useCallback(async () => {
		setRiskOpen(false)
		try { await AsyncStorage.setItem(RISK_ACK_KEY, '1') } catch { }
		goSign()
	}, [goSign])

	if (!stock) return null

	const receiveLine = jupiter?.amount_out != null
		? (side === 'buy'
			? t('crypto.xstocks.trade.receiveShares', { amount: displayAmount(String(jupiter.amount_out), 6), symbol: stock.symbol })
			: t('crypto.xstocks.trade.receiveUsd', { amount: formatUsd(jupiter.amount_out) }))
		: null
	const canReview = !problem && !!jupiter && !quoteQuery.isFetching

	return (
		<View style={[containerStyles.subContainer, { paddingBottom: insets.bottom + 12 }]}>
			{/* Cabecera: qué acción y cuánto hay disponible */}
			<View style={styles.top}>
				<StockLogo stock={stock} size={36} />
				<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
					{side === 'buy'
						? t('crypto.xstocks.trade.availableCash', { amount: formatUsd(available) })
						: t('crypto.xstocks.trade.availableShares', { amount: formatUsd(available) })}
				</Text>
			</View>

			{/* El importe en grande */}
			<View style={styles.amountBox}>
				<QPFitText style={{ color: usd > 0 ? theme.colors.primaryText : theme.colors.tertiaryText, fontSize: 64, fontFamily: theme.typography.fontFamily.medium }}>
					${amount}
				</QPFitText>
				<Text style={[styles.subline, { color: problem ? theme.colors.dangerText : theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
					{problem ?? (regionBlocked ? t('crypto.xstocks.trade.region') : receiveLine ?? estimate ?? ' ')}
				</Text>
				{side === 'sell' && (position?.raw ?? 0n) > 0n && (
					<Pressable onPress={onSellAll} hitSlop={8} style={[styles.chip, { borderColor: sellAll ? theme.colors.primary : theme.colors.border }]}>
						<Text style={{ color: sellAll ? theme.colors.primary : theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.semiBold }}>{t('crypto.xstocks.trade.sellAll')}</Text>
					</Pressable>
				)}
			</View>

			{/* La comisión, a la vista ("somos honestos"). No depende del importe: sigue mientras se recotiza */}
			{jupiterRoute && !problem && (
				<Text style={[styles.fee, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>
					{t('crypto.xstocks.trade.fee', { pct: ((jupiterRoute.service_fee_bps ?? 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) })}
				</Text>
			)}

			{/* Teclado */}
			<View style={styles.keypad}>
				{KEYS.map(row => (
					<View key={row.join('')} style={styles.keyRow}>
						{row.map(key => (
							<Pressable key={key} onPress={() => onKey(key)} style={({ pressed }) => [styles.key, pressed && { backgroundColor: theme.colors.surface }]} accessibilityRole="button" accessibilityLabel={key === 'backspace' ? t('keypad.a11y.deleteKeyLabel') : key}>
								{key === 'backspace'
									? <FontAwesome6 name="delete-left" size={22} color={theme.colors.primaryText} iconStyle="solid" />
									: <Text style={{ color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.medium }}>{key}</Text>}
							</Pressable>
						))}
					</View>
				))}
			</View>

			<QPButton title={t(side === 'buy' ? 'crypto.xstocks.trade.reviewBuy' : 'crypto.xstocks.trade.reviewSell')} onPress={onReview} disabled={!canReview} loading={quoteQuery.isFetching && usd > 0 && !problem} />

			<RiskSheet visible={riskOpen} onClose={() => setRiskOpen(false)} onAccept={onAcceptRisks} theme={theme} />
		</View>
	)
}

const styles = StyleSheet.create({
	top: {
		alignItems: 'center',
		gap: 8,
		paddingTop: 8,
	},
	amountBox: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		gap: 8,
	},
	subline: {
		textAlign: 'center',
	},
	chip: {
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 5,
		marginTop: 4,
	},
	fee: {
		textAlign: 'center',
		marginBottom: 8,
	},
	keypad: {
		gap: 4,
		marginBottom: 12,
	},
	keyRow: {
		flexDirection: 'row',
	},
	key: {
		flex: 1,
		height: 58,
		justifyContent: 'center',
		alignItems: 'center',
		borderRadius: 14,
		borderCurve: 'continuous',
	},
})

export default XStockTrade
