/**
 * Aritmética y reglas PURAS del intercambio de la wallet. Sin React ni red: lo que decide si
 * una operación puede intentarse, y cómo se lee su estado.
 *
 * Vive fuera de los componentes porque son las cuentas de las que depende que el usuario no
 * pierda dinero, y conviene poder probarlas en `@jest-environment node` sin montar pantalla.
 */
import { formatUnits, parseUnits } from '../../../wallet/chains/units'
import type { ExchangeOrder, ExchangeStatus } from '../../../types/domain'

/** `parseUnits` lanza con un decimal a medio teclear; aquí eso vale 0. */
export const parseAmountSafe = (decimal: string, decimals: number): bigint => {
	try { return parseUnits(decimal, decimals) } catch { return 0n }
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

	if (minAmount && amount < minAmount) { return { ok: false, reason: 'below_minimum', minAmount } }

	return { ok: true, amount }
}

/**
 * En este flujo NO hay "enviar todo".
 *
 * El proveedor cotiza para una cantidad concreta y espera EXACTAMENTE esa en la dirección de
 * depósito; enviar de más o de menos dispara recotización o devolución. Y con el nativo hay
 * además que dejar la comisión de red, que "todo" se comería. Se exporta como constante para
 * que la pantalla lo lea de un sitio y no como un `false` suelto.
 */
export const ALLOWS_SEND_MAX = false

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
