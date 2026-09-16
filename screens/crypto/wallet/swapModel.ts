/**
 * Lógica PURA de la pantalla de Swap (sin React Native): qué se paga, qué se recibe, cuánto
 * se puede mover y qué dice el botón. Testeada en node (`swapModel.test.js`).
 *
 * Modelo genérico por PARES: un par une el saldo QvaPay (custodial, USD) con UN activo
 * on-chain de la wallet (hoy QUSD en Stacks; mañana USDT en TRON, USDC en Base…). La
 * pantalla solo sabe de "lado saldo" y "lado wallet"; el sentido decide cuál paga.
 * Añadir una cadena = el backend publica otro par en `GET /swap/pairs` + un firmante para
 * el sentido IN (`useSwapIn`); este módulo no cambia.
 */

/** out = saldo QvaPay → wallet; in = wallet → saldo QvaPay. */
export type SwapDirection = 'out' | 'in'

/** Lo mínimo que la pantalla necesita del par del backend. */
export type SwapPairLike = {
	id: string
	enabled: boolean
	min: number
	max: number
	/** Unidades del lado destino por unidad del origen (1 en pares estables). */
	rate: number
	fee_bps: number
	network: string
	asset: string
	asset_name: string
}

/** Estado del botón principal, en orden de prioridad (el primero que aplica gana). */
export type SwapCta =
	| 'loading'
	| 'unavailable'
	| 'walletNotRegistered'
	| 'enterAmount'
	| 'insufficient'
	| 'belowMin'
	| 'aboveMax'
	| 'overLimit'
	| 'review'

export type SwapFormInput = {
	direction: SwapDirection
	/** Texto del input ya saneado con `sanitizeAmountInput`. */
	amountText: string
	pair: SwapPairLike | null
	/** Saldo del lado que PAGA (USD si es el saldo QvaPay, unidades del token si es la wallet). */
	payBalance: number
	/** Cupo restante hoy en USD; null = sin tope (cuenta verificada). */
	limitAvailable: number | null
	/** La wallet local coincide con la registrada en el backend. */
	walletReady: boolean
	loading: boolean
}

export type SwapForm = {
	/** Importe normalizado a 2 decimales ('5.00') o null si no hay importe. */
	amount: string | null
	value: number | null
	/** Lo que llega al otro lado, ya descontada la comisión. */
	receive: number | null
	/** Comisión QvaPay en unidades del origen. */
	fee: number
	cta: SwapCta
	/** Parámetros de interpolación del texto del botón (símbolo, mínimo…). */
	ctaParams: Record<string, string | number>
	canReview: boolean
	/** Máximo movible ahora mismo: min(saldo, tope del par, cupo del día). */
	max: number
}

const CENT = 100
/** Trunca a centavos hacia abajo (nunca se ofrece mover más de lo que hay). */
export const floorCents = (value: number): number => Math.floor(Math.round(value * CENT * 1e6) / 1e6) / CENT

/**
 * Sanea lo que teclea el usuario: coma → punto, solo dígitos y UN punto, máx 2 decimales,
 * sin ceros a la izquierda ('007' → '7', '.5' → '0.5'). Así el formulario nunca tiene un
 * estado "importe inválido": lo que no es un importe no llega a escribirse.
 */
export const sanitizeAmountInput = (raw: string): string => {
	let text = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
	const firstDot = text.indexOf('.')
	if (firstDot !== -1) text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '')
	let [integer, decimals] = text.split('.') as [string, string | undefined]
	integer = integer.replace(/^0+(?=\d)/, '')
	if (decimals !== undefined) {
		if (integer === '') integer = '0'
		return `${integer.slice(0, 9)}.${decimals.slice(0, 2)}`
	}
	return integer.slice(0, 9)
}

export const maxSwapAmount = ({ payBalance, pair, limitAvailable }: { payBalance: number, pair: SwapPairLike | null, limitAvailable: number | null }): number => {
	if (!pair) return 0
	const caps = [Math.max(0, payBalance), pair.max, ...(limitAvailable === null ? [] : [Math.max(0, limitAvailable)])]
	return floorCents(Math.min(...caps))
}

/** Importe para un chip de porcentaje (25/50/75/100) sobre el máximo movible. */
export const percentAmount = (max: number, percent: number): string => {
	const value = percent >= 100 ? max : floorCents((max * percent) / 100)
	return value > 0 ? value.toFixed(2) : ''
}

export const buildSwapForm = ({ direction, amountText, pair, payBalance, limitAvailable, walletReady, loading }: SwapFormInput): SwapForm => {
	const max = maxSwapAmount({ payBalance, pair, limitAvailable })
	const parsed = Number(amountText)
	const value = amountText && Number.isFinite(parsed) && parsed > 0 ? floorCents(parsed) : null
	const fee = value !== null && pair ? floorCents((value * pair.fee_bps) / 10000) : 0
	const receive = value !== null && pair ? floorCents((value - fee) * pair.rate) : null
	const base = { amount: value === null ? null : value.toFixed(2), value, receive, fee, max }
	const symbol = direction === 'out' ? 'USD' : pair?.asset_name ?? ''

	const result = (cta: SwapCta, ctaParams: Record<string, string | number> = {}): SwapForm => ({ ...base, cta, ctaParams, canReview: cta === 'review' })

	if (loading) return result('loading')
	if (!pair || !pair.enabled) return result('unavailable')
	if (!walletReady) return result('walletNotRegistered')
	if (value === null) return result('enterAmount')
	if (value > floorCents(payBalance)) return result('insufficient', { symbol })
	if (value < pair.min) return result('belowMin', { amount: pair.min.toFixed(2) })
	if (value > pair.max) return result('aboveMax', { amount: pair.max.toFixed(2) })
	if (limitAvailable !== null && value > limitAvailable) return result('overLimit', { amount: floorCents(limitAvailable).toFixed(2) })
	return result('review')
}

/** Familia de dirección que el backend registra por red (`GET /swap/pairs` → `wallet`). */
export const WALLET_FAMILY_BY_NETWORK: Record<string, string> = { stacks: 'stx', tron: 'tron', bitcoin: 'btc', ethereum: 'evm', bsc: 'evm', base: 'evm', polygon: 'evm' }

/** Redes cuyo sentido IN (firmar desde la wallet) ya sabe hacer la app. */
export const SWAP_IN_NETWORKS = new Set(['stacks'])

/** Pasos de la línea de tiempo del estado: índice del paso activo y si terminó mal. */
export type SwapTimeline = { active: 0 | 1 | 2 | 3, failedAt: 1 | 2 | null }

/**
 * 0 = recibido · 1 = enviando a la red · 2 = confirmando · 3 = completado.
 * Un fallo o reembolso marca el paso donde se quedó.
 */
export const swapTimeline = (status: string | undefined): SwapTimeline => {
	switch (status) {
		case 'pending': return { active: 1, failedAt: null }
		case 'dispatching': return { active: 1, failedAt: null }
		case 'sent': return { active: 2, failedAt: null }
		case 'completed': return { active: 3, failedAt: null }
		case 'failed': case 'refunded': case 'needs_review': return { active: 2, failedAt: 2 }
		default: return { active: 0, failedAt: null }
	}
}
