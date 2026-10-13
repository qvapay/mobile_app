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
import { getNumberLocale } from '../../../i18n'
import { isSelectable, selectableCount } from './exchangeModel'
import type { AmountCheck } from './exchangeModel'
import type { ExchangeAdvice, ExchangeCheaperOrigin, ExchangeQuote, ExchangeRoute } from '../../../types/domain'
import type { SwapDetailRow } from './components/swap/SwapDetails'
import type { SwapNotice, SwapReviewCard, SwapSide } from './swapView'
import type { SourceSendCost } from './sourceSendCost'

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
	/** Stablecoin: sus importes se leen en céntimos. */
	stable?: boolean
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
	/** Motivo del servidor cuando la cotización falló. */
	quoteError?: string | null
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
	/** Todas las rutas de la cotización (una por proveedor). */
	routes?: ExchangeRoute[]
	/** Proveedor de la ruta en uso. */
	selectedProvider?: string | null
	/** Coste del envío desde la wallet al depósito (hoy solo TRON). null = no aplica o sin datos. */
	sendCost?: SourceSendCost | null
}

/** Una fila de la hoja de rutas, ya en palabras. */
export type ExchangeRouteItem = {
	provider: string
	label: string
	/** "0.7912 SOL"; vacío en las que no llegan a su mínimo. */
	receive: string
	/** Debajo del nombre: tiempo y comisión de red, o el mínimo que falta. */
	detail: string
	/** "0.012 SOL menos" frente a la mejor. null en la mejor y en las bloqueadas. */
	delta: string | null
	badges: string[]
	/** Quién tiene los fondos durante el cambio. */
	custody: string
	selected: boolean
	disabled: boolean
}

/** La línea de la ruta en el formulario. null mientras no hay ninguna ruta. */
export type ExchangeRouteSummary = {
	title: string
	/** "Mejor tasa · 3 rutas". */
	caption: string
	/** Hay alternativa que elegir: con una sola ruta la línea informa pero no abre nada. */
	canChoose: boolean
	a11yLabel: string
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
	route: ExchangeRouteSummary | null
	routeItems: ExchangeRouteItem[]
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
const detailRows = ({ t, from, to, quote, sendCost }: Pick<ExchangeViewInput, 't' | 'from' | 'to' | 'quote' | 'sendCost'>): SwapDetailRow[] => {
	if (!quote) { return [] }
	// Sin destacar: es un COSTE, y el verde de `highlight` lo hacía pasar por una buena noticia
	// justo encima del aviso rojo que dice cuánto se come. El proveedor no va aquí: ya lo dice
	// la línea de la ruta
	const rows: SwapDetailRow[] = [
		{ key: 'fee', label: t(`${KEY}networkFee`), value: `${trim(quote.depositFee, from?.stable ? 2 : 6)} ${from?.symbol ?? ''}`.trim() },
	]
	// La otra mitad del coste: el envío desde la wallet a la dirección de depósito
	if (sendCost) {
		rows.push({
			key: 'sendCost',
			label: t(`${KEY}sendCost`),
			value: sendCost.kind === 'covered' ? t(`${KEY}sendCostCovered`) : `~${trim(sendCost.trx, 2)} TRX`,
		})
	}
	if (quote.speedForecast) { rows.push({ key: 'eta', label: t('crypto.wallet.swap.details.eta'), value: `~${quote.speedForecast} min` }) }
	// Las DOS redes: con solo la de destino, "Red: Solana" en un envío desde TRON se leía como
	// si todo pasara en Solana
	if (to) {
		const value = from && from.chainName !== to.chainName ? `${from.chainName} → ${to.chainName}` : to.chainName
		rows.push({ key: 'network', label: t('crypto.wallet.swap.details.network'), value })
	}
	return rows
}

/**
 * La tasa en el sentido que se lee de un vistazo: siempre "1 X ≈ N Y" con N ≥ 1. "1 USDT ≈
 * 0.008124 SOL" obligaba a hacer la división de cabeza; "1 SOL ≈ 123.09 USDT" no. Es la tasa
 * EFECTIVA (lo que llega entre lo que sale), con la comisión dentro.
 */
const rateLine = (from: ExchangeAssetLike, to: ExchangeAssetLike, quote: ExchangeQuote | null): string => {
	if (!quote || !(quote.amountIn > 0) || !(quote.amountOut > 0)) { return '' }
	const direct = quote.amountOut / quote.amountIn
	const [base, counter, value] = direct >= 1 ? [from, to, direct] : [to, from, 1 / direct]
	return `1 ${base?.symbol ?? ''} ≈ ${trim(value, value >= 100 ? 2 : 4)} ${counter?.symbol ?? ''}`
}

/**
 * Avisos. Son la parte con más valor de esta pantalla: la comisión de depósito es FIJA, así
 * que en importes pequeños se lleva un porcentaje brutal y el usuario no tiene forma de
 * saberlo mirando la tasa.
 */
const noticesFor = ({ t, from, quote, quoteError, advice, cheaper, unsupportedReason, sendCost }: Pick<ExchangeViewInput, 't' | 'from' | 'quote' | 'quoteError' | 'advice' | 'cheaper' | 'unsupportedReason' | 'sendCost'>): SwapNotice[] => {
	const notices: SwapNotice[] = []

	if (unsupportedReason) {
		notices.push({ key: 'unsupported', icon: 'triangle-exclamation', tone: 'warning', text: unsupportedReason })
		return notices
	}

	// Por qué no hay cotización, con las palabras del servidor. Sin esto el usuario solo
	// veía un botón que decía "Swap no disponible" y no tenía forma de saber si el problema
	// era el par, el importe, el proveedor o que había pulsado demasiadas veces
	if (quoteError) {
		notices.push({ key: 'quoteError', icon: 'triangle-exclamation', tone: 'warning', text: quoteError })
	}

	// Lo que el proveedor tenga que decir de ESTE par (red congestionada, activo en
	// mantenimiento…). Llegaba en la cotización y se tiraba a la basura
	if (quote?.providerWarning) {
		notices.push({ key: 'providerWarning', icon: 'triangle-exclamation', tone: 'warning', text: quote.providerWarning })
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

	// El envío quemaría TRX por falta de energía: se anuncia ya que al confirmar se podrá
	// rentar, para que el coste de la fila no espante a quien no sabe que hay salida
	if (quote && sendCost?.kind === 'burn' && sendCost.energyShort) {
		notices.push({ key: 'energy', icon: 'gas-pump', tone: 'primary', text: t(`${KEY}energyHint`, { trx: trim(sendCost.trx, 2) }) })
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

/**
 * Las rutas como filas de la hoja. Las que no llegan a su mínimo se enseñan apagadas con su
 * "desde X": un proveedor que no cubre 15 USDT no desaparece, se explica.
 */
export const routeItemsFor = ({ t, from, to, routes = [], selectedProvider }: Pick<ExchangeViewInput, 't' | 'from' | 'to' | 'routes' | 'selectedProvider'>): ExchangeRouteItem[] =>
	routes.map(route => {
		const selectable = isSelectable(route)
		const badges: string[] = []
		if (selectable && route.best) { badges.push(t(`${KEY}routes.best`)) }
		if (selectable && route.fastest) { badges.push(t(`${KEY}routes.fastest`)) }

		const detailParts: string[] = []
		if (!selectable) {
			if (route.min_amount) { detailParts.push(t(`${KEY}routes.belowMin`, { amount: trim(route.min_amount, 6), symbol: from?.symbol ?? '' })) }
		} else {
			if (route.eta) { detailParts.push(t(`${KEY}routes.eta`, { eta: route.eta })) }
			if (route.deposit_fee !== null && route.deposit_fee !== undefined) {
				detailParts.push(t(`${KEY}routes.networkFee`, { amount: trim(route.deposit_fee, 6), symbol: from?.symbol ?? '' }))
			}
		}

		return {
			provider: route.provider,
			label: route.provider_label || route.provider,
			receive: selectable ? `${trim(Number(route.amount_out))} ${to?.symbol ?? ''}`.trim() : '',
			detail: detailParts.join(' · '),
			delta: selectable && !route.best && route.shortfall
				? t(`${KEY}routes.less`, { amount: trim(route.shortfall, 8), symbol: to?.symbol ?? '' })
				: null,
			badges,
			custody: route.custody === 'custodial'
				? t(`${KEY}routes.custodial`)
				// On-chain: nadie custodia; y la comisión de QvaPay, dicha (ya va dentro de "recibes")
				: route.service_fee_bps
					? `${t(`${KEY}routes.onchain`)} · ${t(`${KEY}routes.serviceFee`, { percent: formatPercent(route.service_fee_bps) })}`
					: t(`${KEY}routes.onchain`),
			selected: selectable && route.provider === selectedProvider,
			disabled: !selectable,
		}
	})

/** 40 bps → "0,4" en el idioma del usuario (sin ceros de cola). */
const formatPercent = (bps: number): string => (bps / 100).toLocaleString(getNumberLocale(), { maximumFractionDigits: 2 })

/** La línea "Ruta: ChangeNOW · Mejor tasa · 3 rutas ›" del formulario. */
export const routeSummaryFor = ({ t, routes = [], selectedProvider }: Pick<ExchangeViewInput, 't' | 'routes' | 'selectedProvider'>): ExchangeRouteSummary | null => {
	const selected = routes.find(r => r.provider === selectedProvider && isSelectable(r))
	if (!selected) { return null }
	const count = selectableCount(routes)
	const parts: string[] = []
	if (selected.best) { parts.push(t(`${KEY}routes.best`)) }
	else if (selected.fastest) { parts.push(t(`${KEY}routes.fastest`)) }
	// Se cuentan TODAS las rutas, también las que piden más importe: que existan es
	// información (subiendo un poco hay más donde elegir)
	if (routes.length > 1) { parts.push(t(`${KEY}routes.count`, { count: routes.length })) }
	const label = selected.provider_label || selected.provider
	return {
		title: label,
		caption: parts.join(' · '),
		// Abrir la hoja tiene sentido mientras haya más de una ruta que enseñar, aunque solo
		// una se pueda elegir: así se ve el "desde X" de las demás
		canChoose: routes.length > 1 || count > 1,
		a11yLabel: t(`${KEY}routes.a11yRow`, { provider: label }),
	}
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
		// La tasa se DERIVA de los dos importes en vez de leerse de un campo: el proveedor no
		// manda ninguno, y el que este tipo declaraba nunca existió — la línea salía vacía
		// siempre. Dividir lo que llega entre lo que sale es además la tasa efectiva, ya con
		// la comisión dentro, que es la que el usuario está comparando
		rate: rateLine(from, to, quote),
		rows: detailRows(input),
		notices: noticesFor(input),
		ctaLabel,
		ctaEnabled: cta === 'review' && !busy,
		// Solo se ofrece subir al mínimo si el problema ES el mínimo y se conoce
		suggestedAmount: cta === 'belowMin' && minAmount ? minAmount : advice?.suggestedMinimum ?? null,
		reviewFrom: { amount: amountText, symbol: from?.symbol ?? '', icon: { kind: 'wallet', logoTick: from?.logoTick ?? '', networkTick: from?.networkTick ?? null } },
		reviewTo: { amount: receiveAmount, symbol: to?.symbol ?? '', icon: { kind: 'wallet', logoTick: to?.logoTick ?? '', networkTick: to?.networkTick ?? null } },
		// Lo que el usuario tiene que entender ANTES de confirmar: durante el cambio sus
		// fondos los tiene el proveedor, con nombre y apellidos.
		// Y que, como cualquier casa de cambio, puede pararla para verificar: dicho ANTES es
		// una condición del servicio; descubierto después parece que algo fue mal
		reviewNotice: quote ? `${t(`${KEY}custodyNotice`, { provider: quote.provider })} ${t(`${KEY}kycNotice`, { provider: quote.provider })}` : '',
		confirmLabel: t(`${KEY}confirm`),
		route: routeSummaryFor(input),
		routeItems: routeItemsFor(input),
	}
}
