/**
 * Modelo de VISTA del intercambio cripto↔cripto. PURO (sin react-native).
 *
 * Alimenta EXACTAMENTE los mismos componentes que el swap QUSD (`SwapAmountCard`,
 * `SwapDetails`, `SwapNotices`, `SwapReviewSheet`): por eso devuelve sus mismos tipos. El
 * usuario ve una sola pantalla de intercambio; que por detrás haya dos motores es asunto
 * nuestro, no suyo.
 *
 * Igual que `swapView.ts` es el "cómo se ve" de `swapModel.ts`, este lo es de
 * `exchangeModel.ts`. Separarlo deja toda la prosa que el usuario lee probable en node.
 */
import type { AmountCheck } from './exchangeModel'
import type { ExchangeAdvice, ExchangeCheaperOrigin, ExchangeQuote } from '../../../types/domain'
import type { SwapDetailRow } from './components/swap/SwapDetails'
import type { SwapNotice, SwapReviewCard, SwapSide } from './swapView'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** Lo que la vista necesita de un activo de la wallet. */
export type ExchangeAssetLike = {
	id: string
	symbol: string
	chainName: string
	logoTick: string
	networkTick: string | null
	amountLabel: string
	decimals: number
} | null | undefined

/** Estado del botón principal, en orden de prioridad (el primero que aplica gana). */
export type ExchangeCta =
	| 'loading'
	| 'pickAssets'
	| 'enterAmount'
	| 'insufficient'
	| 'belowMin'
	| 'quoting'
	| 'noQuote'
	| 'review'

export type ExchangeViewInput = {
	t: Translate
	from: ExchangeAssetLike
	to: ExchangeAssetLike
	amountText: string
	check: AmountCheck
	quote: ExchangeQuote | null
	advice: ExchangeAdvice | null
	minAmount: number | null
	cheaper: ExchangeCheaperOrigin | null
	/** Motivo por el que un activo elegido no se puede intercambiar (viene del backend). */
	unsupportedReason?: string | null
	showBalance: boolean
	/** Hay cotización en vuelo. */
	quoting: boolean
	/** Hay una operación abriéndose. */
	busy: boolean
	/** El catálogo aún no cargó. */
	loading: boolean
	/** Abren los selectores de activo. */
	pickFrom?: () => void
	pickTo?: () => void
}

export type ExchangeView = {
	pay: SwapSide
	receive: SwapSide
	receiveAmount: string
	receiveHint: string
	rate: string
	rows: SwapDetailRow[]
	notices: SwapNotice[]
	ctaLabel: string
	ctaEnabled: boolean
	/** Sugerencia accionable: subir al mínimo del par. null si no aplica. */
	suggestedAmount: number | null
	reviewFrom: SwapReviewCard
	reviewTo: SwapReviewCard
	reviewNotice: string
	confirmLabel: string
}

const HIDDEN = '••••'
const KEY = 'crypto.wallet.exchange.'

const trim = (value: number, max = 8): string => {
	if (!Number.isFinite(value)) { return '0' }
	const fixed = value.toFixed(max)
	return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
}

const sideFor = (asset: ExchangeAssetLike, showBalance: boolean, onPress?: () => void): SwapSide => ({
	symbol: asset?.symbol ?? '—',
	caption: asset?.chainName ?? '',
	icon: { kind: 'wallet', logoTick: asset?.logoTick ?? '', networkTick: asset?.networkTick ?? null },
	balance: asset ? (showBalance ? asset.amountLabel : HIDDEN) : '',
	onPress,
})

/**
 * Estado del botón. El orden importa: primero lo que el usuario puede arreglar por sí mismo
 * (elegir activos, teclear importe, tener saldo) y solo después lo que depende del proveedor.
 */
export const ctaFor = ({ from, to, check, quote, quoting, loading, unsupportedReason }: Pick<ExchangeViewInput, 'from' | 'to' | 'check' | 'quote' | 'quoting' | 'loading' | 'unsupportedReason'>): ExchangeCta => {
	if (loading) { return 'loading' }
	if (!from || !to || unsupportedReason) { return 'pickAssets' }
	if (!check.ok) {
		return check.reason === 'insufficient' ? 'insufficient'
			: check.reason === 'below_minimum' ? 'belowMin'
				: 'enterAmount'
	}
	if (quoting && !quote) { return 'quoting' }
	if (!quote) { return 'noQuote' }
	return 'review'
}

/**
 * Filas del detalle. La comisión de depósito se enseña SIEMPRE, incluso cuando es
 * despreciable: es la única parte del coste que el usuario no ve en la tasa, y es la que
 * separa mandar 20 USDT desde Base (0,0076) de mandarlos desde TRON (5,54).
 */
const detailRows = ({ t, from, to, quote }: Pick<ExchangeViewInput, 't' | 'from' | 'to' | 'quote'>): SwapDetailRow[] => {
	if (!quote) { return [] }
	const rows: SwapDetailRow[] = [
		{ key: 'fee', label: t(`${KEY}networkFee`), value: `${trim(quote.depositFee)} ${from?.symbol ?? ''}`.trim(), highlight: true },
		{ key: 'provider', label: t(`${KEY}providerLabel`), value: quote.provider },
	]
	if (quote.etaMinutes) { rows.push({ key: 'eta', label: t('crypto.wallet.swap.details.eta'), value: `~${quote.etaMinutes} min` }) }
	if (to) { rows.push({ key: 'network', label: t('crypto.wallet.swap.details.network'), value: to.chainName }) }
	return rows
}

/**
 * Avisos. Son la parte con más valor de esta pantalla: la comisión de depósito es FIJA, así
 * que en importes pequeños se lleva un porcentaje brutal y el usuario no tiene forma de
 * saberlo mirando la tasa.
 */
const noticesFor = ({ t, from, advice, cheaper, unsupportedReason }: Pick<ExchangeViewInput, 't' | 'from' | 'advice' | 'cheaper' | 'unsupportedReason'>): SwapNotice[] => {
	const notices: SwapNotice[] = []

	if (unsupportedReason) {
		notices.push({ key: 'unsupported', icon: 'triangle-exclamation', tone: 'warning', text: unsupportedReason })
		return notices
	}

	if (advice && advice.level !== 'ok') {
		const percent = (advice.bps / 100).toFixed(1)
		notices.push({
			key: 'fee',
			icon: 'gas-pump',
			tone: advice.level === 'severe' ? 'danger' : 'warning',
			text: advice.suggestedMinimum
				? t(`${KEY}feeSevere`, { percent, amount: trim(advice.suggestedMinimum, 2), symbol: from?.symbol ?? '' })
				: t(`${KEY}feeWarn`, { percent }),
		})
	}

	// La misma moneda en otra cadena, cuando el ahorro merece el cambio de origen
	if (cheaper) {
		notices.push({
			key: 'cheaper',
			icon: 'wallet',
			tone: 'primary',
			text: t(`${KEY}cheaperOrigin`, {
				symbol: from?.symbol ?? '',
				chain: cheaper.assetId.split(':')[0],
				saving: `${trim(cheaper.saving, 4)} ${from?.symbol ?? ''}`.trim(),
			}),
		})
	}

	return notices
}

export const buildExchangeView = (input: ExchangeViewInput): ExchangeView => {
	const { t, from, to, amountText, quote, advice, minAmount, showBalance, busy, pickFrom, pickTo } = input

	const cta = ctaFor(input)
	const receiveAmount = quote ? trim(quote.amountOut) : ''

	const ctaLabel = cta === 'loading' || cta === 'quoting' ? t('crypto.wallet.swap.cta.loading')
		: cta === 'pickAssets' ? t('crypto.wallet.swap.cta.enterAmount')
			: cta === 'enterAmount' ? t('crypto.wallet.swap.cta.enterAmount')
				: cta === 'insufficient' ? t('crypto.wallet.swap.cta.insufficient', { symbol: from?.symbol ?? '' })
					: cta === 'belowMin' ? t(`${KEY}minAmount`, { amount: trim(minAmount ?? 0, 6), symbol: from?.symbol ?? '' })
						: cta === 'noQuote' ? t('crypto.wallet.swap.cta.unavailable')
							: t('crypto.wallet.swap.cta.review')

	return {
		pay: sideFor(from, showBalance, pickFrom),
		receive: sideFor(to, showBalance, pickTo),
		receiveAmount,
		// Tasa flotante: lo que se enseña es una estimación y se dice así, no se disimula
		receiveHint: quote ? t(`${KEY}estimated`) : '',
		rate: quote?.rate ? `1 ${from?.symbol ?? ''} ≈ ${trim(quote.rate, 6)} ${to?.symbol ?? ''}` : '',
		rows: detailRows(input),
		notices: noticesFor(input),
		ctaLabel,
		ctaEnabled: cta === 'review' && !busy,
		// Solo se ofrece subir al mínimo si el problema ES el mínimo y se conoce
		suggestedAmount: cta === 'belowMin' && minAmount ? minAmount : advice?.suggestedMinimum ?? null,
		reviewFrom: { amount: amountText, symbol: from?.symbol ?? '', caption: from?.chainName ?? '', icon: { kind: 'wallet', logoTick: from?.logoTick ?? '', networkTick: from?.networkTick ?? null } },
		reviewTo: { amount: receiveAmount, symbol: to?.symbol ?? '', caption: to?.chainName ?? '', icon: { kind: 'wallet', logoTick: to?.logoTick ?? '', networkTick: to?.networkTick ?? null } },
		// Lo que el usuario tiene que entender ANTES de confirmar: durante el cambio sus
		// fondos los tiene el proveedor, con nombre y apellidos.
		reviewNotice: quote ? t(`${KEY}custodyNotice`, { provider: quote.provider }) : '',
		confirmLabel: t(`${KEY}confirm`),
	}
}
