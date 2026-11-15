/**
 * Aritmética y reglas PURAS del intercambio de la wallet. Sin React ni red: lo que decide si
 * una operación puede intentarse, y cómo se lee su estado.
 *
 * Vive fuera de los componentes porque son las cuentas de las que depende que el usuario no
 * pierda dinero, y conviene poder probarlas en `@jest-environment node` sin montar pantalla.
 */
import { isSameAddress } from '../../../wallet/assets'
import { formatUnits, parseUnits } from '../../../wallet/chains/units'
import type { ChainKind } from '../../../wallet/registry/types'
import type { ExchangeOrder, ExchangeQuote, ExchangeQuotePayload, ExchangeRoute, ExchangeStatus } from '../../../types/domain'

/** `parseUnits` lanza con un decimal a medio teclear; aquí eso vale 0. */
export const parseAmountSafe = (decimal: string, decimals: number): bigint => {
	try { return parseUnits(decimal, decimals) } catch { return 0n }
}

// ── El importe viaja como número ───────────────────────────────────────────

/**
 * Las unidades mínimas a las que equivale un importe DESPUÉS de viajar como `Number`. Es la
 * cuenta que hacen qpweb y `onchainSwapModel.toUnits` con lo que les llega: la
 * representación más corta del número, sin pasar por `toFixed` salvo en notación científica.
 */
export const unitsOfNumber = (amount: number, decimals: number): bigint => {
	if (!Number.isFinite(amount) || amount <= 0) { return 0n }
	const text = /e/i.test(String(amount)) ? amount.toFixed(Math.min(decimals, 20)) : String(amount)
	if (!/^\d+(\.\d+)?$/.test(text)) { return 0n }
	const [whole, frac = ''] = text.split('.')
	return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0')
}

/** Cifras significativas que un `Number` conserva exactas, sea cual sea el decimal. */
const FLOAT_SAFE_DIGITS = 15

/**
 * El mayor importe ≤ `units` que sobrevive al viaje por un `Number` (X-04).
 *
 * El importe de un intercambio va de la app a qpweb y al proveedor como número de coma
 * flotante, que guarda 15-17 cifras significativas. Con más, se REDONDEA, y a veces hacia
 * arriba: MÁX sobre un saldo de 1,234567890123456789 pedía 1,2345678901234568, más de lo
 * que hay. En custodial la orden quedaba sin poder fondearse; on-chain se firmaba el
 * permiso y el swap ya no simulaba. Hasta que el importe viaje como texto de punta a
 * punta, MÁX y los porcentajes se quedan con las cifras que el número guarda exactas (lo
 * que se deja fuera es menos de una milbillonésima del importe).
 */
export const floatSafeUnits = (units: bigint, decimals: number): bigint => {
	if (units <= 0n) { return 0n }
	const survives = (candidate: bigint) => unitsOfNumber(Number(formatUnits(candidate, decimals)), decimals) === candidate
	if (survives(units)) { return units }
	const length = units.toString().length
	for (let digits = FLOAT_SAFE_DIGITS; digits >= 1; digits--) {
		if (length <= digits) { continue }
		const step = 10n ** BigInt(length - digits)
		const floored = units / step * step
		if (floored > 0n && survives(floored)) { return floored }
	}
	return 0n
}

// ── Validación del importe ─────────────────────────────────────────────────

export type AmountCheck =
	| { ok: true, amount: number }
	| { ok: false, reason: 'empty' | 'invalid' | 'below_minimum' | 'insufficient', minAmount?: number }

/**
 * ¿Se puede cotizar este importe?
 *
 * El mínimo del proveedor se valida ANTES de enseñar cotización, no después de que el usuario
 * haya enviado: por debajo de él el proveedor no opera y los fondos se quedan esperando una
 * devolución manual.
 *
 * El saldo se compara en unidades mínimas (bigint), nunca en float: `0.1 + 0.2` en coma
 * flotante bastaría para bloquear un "tengo justo" legítimo o dejar pasar uno imposible.
 */
export const checkAmount = ({ input, balance, decimals, minAmount }: {
	input: string
	/** Saldo crudo en unidades mínimas. */
	balance: bigint
	decimals: number
	minAmount?: number | null
}): AmountCheck => {
	const trimmed = String(input ?? '').trim()
	if (!trimmed) { return { ok: false, reason: 'empty' } }

	const amount = Number(trimmed)
	if (!Number.isFinite(amount) || amount <= 0) { return { ok: false, reason: 'invalid' } }

	if (parseAmountSafe(trimmed, decimals) > balance) { return { ok: false, reason: 'insufficient' } }
	// Lo que VIAJA es el número, no el texto: con más cifras de las que guarda se redondea,
	// y puede quedar por encima de lo que hay aunque lo tecleado no lo esté
	if (unitsOfNumber(amount, decimals) > balance) { return { ok: false, reason: 'insufficient' } }

	if (minAmount && amount < minAmount) { return { ok: false, reason: 'below_minimum', minAmount } }

	return { ok: true, amount }
}

// ── Rutas (varios proveedores) ─────────────────────────────────────────────

/**
 * Una ruta a partir de la cotización suelta de un backend anterior a las rutas. Así la
 * pantalla trabaja SIEMPRE con rutas y no hay dos caminos que mantener.
 */
const routeFromQuote = (quote: ExchangeQuote, quoteId: string | null, expiresAt: string | null): ExchangeRoute => ({
	quote_id: quoteId,
	expires_at: expiresAt,
	provider: quote.provider,
	// El backend viejo no manda etiqueta: el nombre interno es lo único que hay
	provider_label: quote.provider,
	custody: 'custodial',
	kyc_risk: 'possible',
	rate_type: 'floating',
	amount_in: quote.amountIn,
	amount_out: quote.amountOut,
	deposit_fee: quote.depositFee,
	withdrawal_fee: quote.withdrawalFee,
	eta: quote.speedForecast,
	eta_minutes: null,
	warning: quote.providerWarning,
	best: true,
	fastest: false,
	shortfall: 0,
	below_min: false,
	min_amount: null,
})

/** Las rutas de una cotización, con o sin soporte de rutas en el backend. */
export const routesFrom = (payload: ExchangeQuotePayload | null | undefined): ExchangeRoute[] => {
	if (!payload) { return [] }
	if (Array.isArray(payload.routes) && payload.routes.length > 0) { return payload.routes }
	return payload.quote ? [routeFromQuote(payload.quote, payload.quote_id, payload.expires_at)] : []
}

/** Se puede confirmar con ella: tiene precio congelado y llega a su mínimo. */
export const isSelectable = (route: ExchangeRoute | null | undefined): boolean =>
	!!route && !route.below_min && !!route.quote_id && Number(route.amount_out) > 0

/**
 * La ruta en uso: la que eligió el usuario si SIGUE en la lista y se puede confirmar, y si
 * no, la mejor.
 *
 * Cada recotización (cada 45 s, o al tocar el importe) trae rutas nuevas con `quote_id`
 * nuevos, así que la elección se recuerda por PROVEEDOR, no por id. Si ese proveedor deja de
 * cotizar (caído, o el importe bajó de su mínimo), se vuelve a la mejor en vez de dejar al
 * usuario con una ruta que ya no existe.
 */
export const selectRoute = (routes: ExchangeRoute[], chosenProvider: string | null): ExchangeRoute | null => {
	const chosen = chosenProvider ? routes.find(r => r.provider === chosenProvider) : undefined
	if (chosen && isSelectable(chosen)) { return chosen }
	return routes.find(r => isSelectable(r)) ?? null
}

/** Cuántas rutas se pueden elegir de verdad. Con una sola no hay nada que comparar. */
export const selectableCount = (routes: ExchangeRoute[]): number => routes.filter(isSelectable).length

/** La ruta en uso como la cotización suelta que el resto de la pantalla ya sabe pintar. */
export const quoteOfRoute = (route: ExchangeRoute | null): ExchangeQuote | null => (route && isSelectable(route)) ? ({
	provider: route.provider_label || route.provider,
	amountIn: Number(route.amount_in),
	amountOut: Number(route.amount_out),
	depositFee: Number(route.deposit_fee ?? 0),
	withdrawalFee: Number(route.withdrawal_fee ?? 0),
	speedForecast: route.eta,
	providerWarning: route.warning,
}) : null

// ── Lectura del estado ─────────────────────────────────────────────────────

/** Fases visibles del seguimiento. El usuario no necesita los nueve estados del backend. */
export type ExchangePhase = 'deposit' | 'working' | 'done' | 'returned' | 'problem'

const PHASE: Record<ExchangeStatus, ExchangePhase> = {
	awaiting_deposit: 'deposit',
	confirming: 'working',
	exchanging: 'working',
	sending: 'working',
	completed: 'done',
	refunded: 'returned',
	failed: 'problem',
	expired: 'problem',
	needs_review: 'problem',
}

export const phaseOf = (status: ExchangeStatus): ExchangePhase => PHASE[status] ?? 'problem'

/** Una operación viva se sigue consultando; una terminal ya no cambia. */
export const isLive = (status: ExchangeStatus): boolean => {
	const phase = phaseOf(status)
	return phase === 'deposit' || phase === 'working'
}

/**
 * Pasos del timeline, con cuáles están hechos.
 *
 * Cross-chain hay DOS confirmaciones on-chain, no una: la del depósito del usuario y la del
 * pago del proveedor. Enseñarlas por separado es lo que hace que la espera se entienda.
 */
export type ExchangeStep = { key: 'sent' | 'confirmed' | 'exchanged' | 'received', done: boolean, current: boolean }

const ORDER: ExchangeStatus[] = ['awaiting_deposit', 'confirming', 'exchanging', 'sending', 'completed']

export const stepsFor = (order: Pick<ExchangeOrder, 'status' | 'payin_hash' | 'payout_hash'>): ExchangeStep[] => {
	const rank = ORDER.indexOf(order.status)
	// Un estado terminal que no es `completed` (devuelto, fallido, expirado) no avanza pasos:
	// el timeline se queda donde llegó y el motivo se enseña aparte.
	const reached = rank === -1 ? (order.payin_hash ? 1 : 0) : rank

	const flags = [
		{ key: 'sent' as const, done: reached >= 1 || !!order.payin_hash },
		{ key: 'confirmed' as const, done: reached >= 2 },
		{ key: 'exchanged' as const, done: reached >= 3 },
		{ key: 'received' as const, done: order.status === 'completed' && !!order.payout_hash },
	]
	const firstPending = flags.findIndex(f => !f.done)
	return flags.map((f, i) => ({ ...f, current: i === firstPending && isLive(order.status) }))
}

// ── Lo recibido frente a lo prometido ──────────────────────────────────────

/**
 * Desviación de lo recibido, en puntos básicos. Positivo = llegó de más.
 *
 * Con tasa flotante moverse un poco es normal y esperado. Se calcula para poder ENSEÑARLO
 * cuando la desviación es grande, no para esconderlo.
 */
export const deviationBps = (order: Pick<ExchangeOrder, 'expected_out' | 'actual_out'>): number | null => {
	// OJO: `Number(null)` es 0, no NaN. Sin este guardia, una operación que todavía no ha
	// pagado (actual_out null) reportaría -10.000 bps, es decir "recibiste un 100% menos"
	// de algo que simplemente aún no ha llegado.
	const expected = toNumber(order.expected_out)
	const actual = toNumber(order.actual_out)
	if (expected === null || actual === null || expected <= 0) { return null }
	return Math.round(((actual - expected) / expected) * 10000)
}

const toNumber = (value: string | number | null | undefined): number | null => {
	if (value === null || value === undefined || value === '') { return null }
	const n = Number(value)
	return Number.isFinite(n) ? n : null
}

/** A partir de aquí la desviación merece contarse en pantalla. */
export const DEVIATION_NOTABLE_BPS = 300

export const isDeviationNotable = (bps: number | null): boolean => bps !== null && Math.abs(bps) >= DEVIATION_NOTABLE_BPS

/**
 * Qué enseñar en el bloque del depósito. PURO, porque la diferencia entre estos dos estados
 * es lo que separa un envío de dos.
 *
 *   `send`     hay que enviar: dirección, importe exacto y botón.
 *   `sent`     ya se envió y el proveedor todavía no lo ha visto. NADA de dirección ni de
 *              botón: el proveedor espera UN importe, y el segundo envío no se cambia.
 *   `none`     la orden ya avanzó; el depósito dejó de ser el tema.
 */
export type DepositView = 'send' | 'sent' | 'none'

/** La dirección de la propia wallet para un activo, con su familia; null si la wallet no lo tiene. */
export type OwnAddress = (assetId: string) => { kind: ChainKind, address: string } | null

/**
 * ¿Lo que la orden paga y lo que devuelve va a direcciones de ESTA wallet? (X-06)
 *
 * Las órdenes cuelgan del ID de wallet, no de una firma. Con ese ID en otras manos, una orden
 * que cobrara un tercero aparecería en el seguimiento con su «Enviar ahora» como cualquier
 * otra: quien la fondeara pagaría el intercambio de otro. La app solo abre órdenes hacia sus
 * propias direcciones, así que una que no lo sea no es suya.
 *
 * `unknown`: no se puede saber (la wallet no tiene ese activo). Para firmar, eso es «no».
 */
export const orderAddressesCheck = (order: Pick<ExchangeOrder, 'from_asset' | 'to_asset' | 'payout_address' | 'refund_address'>, own: OwnAddress): 'own' | 'foreign' | 'unknown' => {
	const payout = own(order.to_asset)
	const refund = own(order.from_asset)
	if (!payout || !refund) return 'unknown'
	const same = (mine: { kind: ChainKind, address: string }, theirs: unknown) => typeof theirs === 'string' && isSameAddress(mine.kind, mine.address, theirs)
	return same(payout, order.payout_address) && same(refund, order.refund_address) ? 'own' : 'foreign'
}

/**
 * @param noted - Hay una nota en disco de que el depósito salió (o pudo salir) hacia la red,
 *   aunque no tenga hash todavía. Manda igual que un hash: no se vuelve a ofrecer enviar.
 */
export const depositViewFor = ({ status, sentTxid, noted = false }: { status: ExchangeStatus, sentTxid?: string | null, noted?: boolean }): DepositView => {
	if (status !== 'awaiting_deposit') { return 'none' }
	return sentTxid || noted ? 'sent' : 'send'
}

// ── Importe a enviar ───────────────────────────────────────────────────────

/**
 * El importe EXACTO que hay que mandar al depósito, en unidades mínimas.
 *
 * Se re-deriva del `amount_in` que devolvió el backend, no del que el usuario tecleó: entre
 * una cosa y otra pudo normalizarse, y lo que el proveedor espera es lo que él registró.
 */
export const depositAmountRaw = (order: Pick<ExchangeOrder, 'amount_in'>, decimals: number): bigint =>
	parseAmountSafe(String(order.amount_in), decimals)

export const depositAmountLabel = (order: Pick<ExchangeOrder, 'amount_in'>, decimals: number): string =>
	formatUnits(depositAmountRaw(order, decimals), decimals)
