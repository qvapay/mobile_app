/**
 * Reglas del gate de rieles del depósito (tarjeta y PayPal) sobre la respuesta de
 * `GET /user/deposit-eligibility`. PURO (cero react-native): lo testea un entorno node.
 *
 * El servidor es la autoridad — aquí solo se decide qué se PINTA y qué se avisa antes
 * de pedir: qué monedas salen del selector, cuánto cupo queda en el nivel `ssn`
 * ($500 combinados por ventana rodante de 30 días) y si conviene ofrecer la
 * verificación del SSN a quien aún no tiene estos rieles.
 */

import { cardDepositPreview, round2 } from '../../helpers/cardFeeMode'
import { getDateLocale } from '../../i18n'

import type { CardFeeMode } from '../../helpers/cardFeeMode'
import type { DepositEligibility, UserCip } from '../../types/domain'

/** Rieles gateados por tick del catálogo. `BANK` queda fuera a propósito en esta entrega. */
export const GATED_RAILS = { CARD: 'card', PAYPAL: 'paypal' } as const

type GatedRail = typeof GATED_RAILS[keyof typeof GATED_RAILS]

/** Cupo del nivel `ssn` para un riel: lo que aún se puede cobrar y cuándo se libera. */
export type SsnCap = { cap: number, remaining: number, resetsAt: string | null }

/** Qué pasa con el cobro frente al cupo: sin cupo, se pasa, o nada. */
export type CapIssue = 'exhausted' | 'exceeds' | null

/**
 * Riel gateado de una moneda del catálogo, o null si la moneda no se gatea.
 *
 * @param tick - Tick de la moneda (`CARD`, `PAYPAL`, `USDT`…).
 */
export function railFor(tick: string | null | undefined): GatedRail | null {
	const key = String(tick ?? '').toUpperCase()
	return key in GATED_RAILS ? GATED_RAILS[key as keyof typeof GATED_RAILS] : null
}

/**
 * Quita del catálogo las monedas gateadas que el servidor no acepta para esta cuenta.
 * Sin respuesta (carga fallida sin caché) se quitan TODAS las gateadas: pedir un
 * depósito que el backend va a rechazar con un 400 genérico es peor que no ofrecerlo.
 * Devuelve la MISMA referencia si no hay nada que quitar.
 *
 * @param coins - Catálogo depositable (lista plana de useCoins).
 * @param eligibility - Respuesta de deposit-eligibility, o null/undefined sin ella.
 */
export function filterGatedCoins<C extends { tick: string }>(coins: C[], eligibility: DepositEligibility | null | undefined): C[] {
	const keep = (coin: C) => {
		const rail = railFor(coin.tick)
		if (!rail) { return true }
		return eligibility?.[rail]?.eligible === true
	}
	return coins.every(keep) ? coins : coins.filter(keep)
}

/**
 * Cupo del nivel `ssn` que aplica a una moneda, o null si la moneda no se gatea o la
 * cuenta la tiene en nivel `full` (sin tope).
 *
 * @param eligibility - Respuesta de deposit-eligibility.
 * @param tick - Moneda elegida.
 */
export function ssnCapFor(eligibility: DepositEligibility | null | undefined, tick: string | null | undefined): SsnCap | null {
	const rail = railFor(tick)
	if (!rail || !eligibility) { return null }
	if (eligibility[rail]?.tier !== 'ssn') { return null }
	const tier = eligibility.ssn_tier
	return {
		cap: Number(tier?.cap ?? 0),
		remaining: Math.max(0, Number(tier?.remaining ?? 0)),
		resetsAt: tier?.resets_at ?? null,
	}
}

/**
 * Lo que el servidor contará contra el cupo: en CARD con el fee aparte es el cobro BRUTO
 * (importe + fee); con el fee incluido, o en PayPal, el importe tecleado. Espejo de
 * `cardDepositTotal` del route `/api/topup` de qpweb.
 *
 * @param args.tick - Moneda elegida.
 * @param args.amount - Importe tecleado (string del formulario).
 * @param args.feeMode - Modo de fee de CARD.
 * @param args.feeRate - Porcentaje de fee aplicable (`cardFeeRateFor`).
 */
export function chargeTotalFor({ tick, amount, feeMode, feeRate }: { tick: string | null | undefined, amount: string | number, feeMode: CardFeeMode, feeRate: number }): number {
	const value = Number(amount)
	if (!Number.isFinite(value) || value <= 0) { return 0 }
	if (String(tick ?? '').toUpperCase() === 'CARD' && feeMode !== 'included') {
		return cardDepositPreview(value, feeRate, 'on_top')?.pays ?? round2(value)
	}
	return round2(value)
}

/**
 * Compara el cobro con el cupo. `exhausted` = no queda nada (la moneda va apagada);
 * `exceeds` = queda cupo pero este cobro se pasa (bajar el importe).
 *
 * @param chargeTotal - Resultado de `chargeTotalFor`.
 * @param cap - Resultado de `ssnCapFor` (null = sin tope).
 */
export function capIssue(chargeTotal: number, cap: SsnCap | null | undefined): CapIssue {
	if (!cap) { return null }
	if (cap.remaining <= 0) { return 'exhausted' }
	if (chargeTotal > cap.remaining) { return 'exceeds' }
	return null
}

/**
 * ¿Ofrecer «Verifica tu SSN para depositar con tarjeta o PayPal»? Solo a quien no tiene
 * ninguno de los dos rieles, se declaró persona de EE. UU. y puede verificar (o le falta
 * únicamente GOLD, que la pantalla de la ficha resuelve). Con el nivel apagado en el
 * servidor (`SSN_TIER_OFF`) o ya verificado no hay nada que ofrecer.
 *
 * @param eligibility - Respuesta de deposit-eligibility (null = sin dato: no se ofrece).
 * @param cip - Ficha CIP (null = sin dato: no se ofrece).
 */
export function ssnCtaVisible(eligibility: DepositEligibility | null | undefined, cip: UserCip | null | undefined): boolean {
	if (!eligibility || !cip?.us_person) { return false }
	if (eligibility.card?.eligible || eligibility.paypal?.eligible) { return false }
	const ssn = cip.ssn_verification
	if (!ssn || ssn.status === 'verified') { return false }
	return ssn.can_start === true || ssn.block_reason === 'GOLD_REQUIRED'
}

/** Importe del cupo para el copy: dos decimales, sin ceros muertos («500», «320.5», «106.01»). */
export function formatCapAmount(value: number): string {
	const fixed = round2(value).toFixed(2)
	return fixed.replace(/\.?0+$/, '')
}

/**
 * Fecha en que se libera cupo, corta y en el idioma activo («1 dic», «Dec 1»); '' sin fecha
 * o con una inválida.
 */
export function formatCapDate(iso: string | null | undefined): string {
	if (!iso) { return '' }
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) { return '' }
	return date.toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short' })
}
