/**
 * Withdraw fee math — mirror of the server (`qpweb app/api/withdraw/route.js`)
 * and the web wizard preview, so the app quotes the same fee the backend charges.
 *
 * Server rules being mirrored:
 * - Rate: `fee_out_gold` for GOLD users (`golden_check`), `fee_out` otherwise.
 * - `fee_out_fixed` as array `[threshold, fixed]`: amounts STRICTLY ABOVE the
 *   threshold pay the % rate; at or below it they pay the flat fixed fee only.
 * - `fee_out_fixed` as plain number: % rate + fixed, always.
 * - `type: select` fields in `working_data` can carry a per-option `fee_pct`
 *   (e.g. USD Cash province logistics) applied as a % of the gross amount.
 */

import type { Coin, CoinWorkingField, Decimal } from '../../types/domain'

/** Subconjunto de la coin del que depende la matemática de comisiones. */
export type FeeCoin = Pick<Coin, 'fee_out' | 'fee_out_gold' | 'fee_out_fixed'>

/** `fee_out_fixed` ya normalizado: escalar, tupla `[umbral, fijo]` o nada. */
export type FeeOutFixed = number | [Decimal, Decimal] | null

/** Estado del formulario de destino: clave slug → valor tecleado/elegido. */
export type WorkingForm = Record<string, string>

/** Opciones de tarifa comunes a `calculateFee` / `grossFromNet`. */
export type FeeOptions = { isGold?: boolean, selectFeePct?: number }

// Slugified key used by the form state for a working_data field name
export const keyFromFieldName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const round2 = (n: number): number => Math.round(n * 100) / 100

// `fee_out_fixed` is a Prisma Json column — normally arrives parsed, but the
// web wizard guards against the JSON-string form too, so we do the same
export const parseFeeOutFixed = (raw: Coin['fee_out_fixed']): FeeOutFixed => {
	if (typeof raw === 'string') {
		// JSON.parse devuelve `any`: la forma real es la misma unión de la columna
		try { return JSON.parse(raw) as FeeOutFixed } catch (e) { return null }
	}
	return raw ?? null
}

// Percent rate for the user tier (GOLD gets fee_out_gold, like the server)
export const feeOutRate = (coin: FeeCoin | null | undefined, isGold = false): number => {
	const rate = isGold ? Number(coin?.fee_out_gold) : Number(coin?.fee_out)
	return Number.isFinite(rate) ? rate : 0
}

// Sum of per-option logistics surcharge (% of gross) from `type: select`
// fields, matched by the chosen value in the slug-keyed form state
// `skipField` (nombre original) excluye un select: en modo zonas de efectivo el
// `fee_pct` de la provincia lo sustituye el cargo de zona, igual que en el servidor
export const getSelectFeePct = (workingFields: CoinWorkingField[] | null | undefined, workingForm: WorkingForm | null | undefined, skipField: string | null = null): number => {
	if (!Array.isArray(workingFields)) return 0
	let pct = 0
	for (const field of workingFields) {
		if (field.type !== 'select' || !Array.isArray(field.options)) continue
		if (skipField && field.name === skipField) continue
		const chosen = workingForm?.[keyFromFieldName(field.name)]
		if (!chosen) continue
		const match = field.options.find((opt) => String(opt.value) === String(chosen))
		if (match && Number.isFinite(Number(match.fee_pct))) { pct += Number(match.fee_pct) }
	}
	return pct
}

/**
 * Total fee (in QUSD, rounded to cents) for a gross amount on a coin.
 * @param amount - Gross QUSD amount the user withdraws.
 * @param coin - Coin from /coins/v2 (fee_out, fee_out_gold, fee_out_fixed).
 * @param [opts]
 */
export const rawFee = (amount: Decimal | null | undefined, coin: FeeCoin | null | undefined, { isGold = false, selectFeePct = 0 }: FeeOptions = {}): number => {
	if (!coin) return 0
	const amountNum = Number(amount)
	if (!Number.isFinite(amountNum) || amountNum <= 0) return 0

	const rate = feeOutRate(coin, isGold)
	const fixed = parseFeeOutFixed(coin.fee_out_fixed)
	let base: number
	if (Array.isArray(fixed) && fixed.length >= 2) {
		const threshold = Number(fixed[0]) || 0
		const fixedAmount = Number(fixed[1]) || 0
		base = amountNum > threshold ? (amountNum * rate) / 100 : fixedAmount
	} else {
		base = (amountNum * rate) / 100
		if (Number.isFinite(Number(fixed)) && fixed !== null) { base += Number(fixed) }
	}
	return base + (amountNum * selectFeePct) / 100
}

/**
 * Total fee (in QUSD, rounded to cents) for a gross amount on a coin.
 * The unrounded value is `rawFee`: the cash-zone quote adds its charge to it before
 * rounding, exactly like the server's `quoteWithdrawFee`.
 */
export const calculateFee = (amount: Decimal | null | undefined, coin: FeeCoin | null | undefined, opts: FeeOptions = {}): number => round2(rawFee(amount, coin, opts))

/**
 * Inverse: gross QUSD required so that `netUsd` arrives after fees.
 * Mirrors the web wizard's receive→amount solver (and the server's BOLT11
 * re-derivation): the select surcharge folds into the effective % rate.
 * Returns 0 when the fee configuration can't be satisfied (rate >= 100%).
 */
export const grossFromNet = (netUsd: Decimal | null | undefined, coin: FeeCoin | null | undefined, { isGold = false, selectFeePct = 0 }: FeeOptions = {}): number => {
	if (!coin) return 0
	const net = Number(netUsd)
	if (!Number.isFinite(net) || net <= 0) return 0

	const rate = feeOutRate(coin, isGold)
	const effectivePct = rate + selectFeePct
	if (effectivePct >= 100) return 0

	const fixed = parseFeeOutFixed(coin.fee_out_fixed)
	if (Array.isArray(fixed) && fixed.length >= 2) {
		const threshold = Number(fixed[0]) || 0
		const fixedAmount = Number(fixed[1]) || 0
		// Above-threshold branch (% only): gross * (1 - effectivePct/100) = net
		// At/below threshold (fixed base + select %): gross * (1 - selectPct/100) = net + fixed
		const aboveBranch = effectivePct > 0 ? net / (1 - effectivePct / 100) : net
		if (aboveBranch > threshold) return aboveBranch
		return selectFeePct > 0 ? (net + fixedAmount) / (1 - selectFeePct / 100) : net + fixedAmount
	}
	const fixedAmount = Number.isFinite(Number(fixed)) && fixed !== null ? Number(fixed) : 0
	return effectivePct > 0 ? (net + fixedAmount) / (1 - effectivePct / 100) : net + fixedAmount
}

/** Qué límite de la moneda incumple el bruto a extraer, y cuál es. */
export type AmountLimitIssue = { kind: 'belowMin' | 'aboveMax', limit: number }

/**
 * `min_out` / `max_out` de la moneda contra el bruto a extraer, como el servidor.
 * El servidor los comprueba DESPUÉS de validar el PIN: sin este aviso el usuario
 * teclea el PIN para que le digan que no llega al mínimo. Un límite ausente o ≤ 0
 * no cuenta; la redención de sats no pasa por aquí (tiene su propio mínimo).
 *
 * @returns El límite incumplido, o null si el importe cabe (o aún no hay importe).
 */
export const amountLimitIssue = (amount: Decimal | null | undefined, coin: Pick<Coin, 'min_out' | 'max_out'> | null | undefined): AmountLimitIssue | null => {
	const value = Number(amount)
	if (!coin || !Number.isFinite(value) || value <= 0) return null
	const min = Number(coin.min_out)
	if (min > 0 && value < min) return { kind: 'belowMin', limit: min }
	const max = Number(coin.max_out)
	if (max > 0 && value > max) return { kind: 'aboveMax', limit: max }
	return null
}
