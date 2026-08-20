/**
 * Modo de fee en depósitos con tarjeta (moneda CARD): el usuario elige si el
 * fee se SUMA al cobro (`on_top`, default — recibe lo que pidió) o va INCLUIDO
 * (`included` — paga exactamente lo que pidió y recibe el neto).
 *
 * Las fórmulas son espejo EXACTO del backend (qpweb
 * scripts/providers/payment/stripe-deposit.js: cardDepositTotal /
 * cardDepositNet, redondeo a 2 decimales vía toFixed) para que el preview de
 * la app coincida al centavo con `value`/`credited` de la respuesta de
 * POST /topup. El fee (`fee_in` / `fee_in_gold`) viene del catálogo de
 * monedas — nunca hardcodear porcentajes.
 *
 * Lógica pura sin imports nativos: testeable en `@jest-environment node`.
 */

export const FEE_MODES = ['on_top', 'included']

/** Redondeo a 2 decimales idéntico al del backend (Number(x.toFixed(2))). */
export function round2(n) { return Number(Number(n).toFixed(2)) }

/**
 * Fee aplicable al depósito CARD para este usuario (GOLD usa fee_in_gold).
 *
 * @param {Object} coin - Moneda CARD del catálogo (fee_in, fee_in_gold).
 * @param {Object} user - Usuario autenticado (golden_check).
 * @returns {number} Porcentaje de fee (ej. 6).
 */
export function cardFeeRateFor(coin, user) {
	if (!coin) { return 0 }
	return user?.golden_check
		? Number(coin.fee_in_gold ?? coin.fee_in ?? 0)
		: Number(coin.fee_in ?? 0)
}

/**
 * Preview en vivo del depósito según el modo de fee.
 *
 * @param {string|number} amount - Monto tecleado por el usuario.
 * @param {number} feeRate - Porcentaje de fee aplicable.
 * @param {'on_top'|'included'} mode - Modo de fee.
 * @returns {{pays: number, credited: number}|null} null sin monto válido.
 */
export function cardDepositPreview(amount, feeRate, mode) {
	const a = Number(amount)
	if (!a || isNaN(a) || a <= 0) { return null }
	const rate = Number(feeRate || 0) / 100
	if (mode === 'included') { return { pays: round2(a), credited: round2(a * (1 - rate)) } }
	return { pays: round2(a * (1 + rate)), credited: round2(a) }
}
