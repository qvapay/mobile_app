/**
 * Ficha CIP completa antes de sacar valor de la cuenta. PURO: espejo de lo que decide
 * `scripts/compliance/cip-withdraw-gate-rules.ts` de qpweb (CCO, 11-12 nov 2026).
 *
 * Tres salidas responden `403` con `code: 'CIP_REQUIRED'` si a la ficha le falta algo:
 * `POST /withdraw`, `POST /swap` en sentido `out` (saldo → wallet) y la VENTA de saldo en
 * el P2P (`POST /p2p/create` con `type: 'sell'` y `POST /p2p/{uuid}/apply` sobre una
 * oferta de compra). Comprar en el P2P, depositar y transferir no cambian.
 *
 * `GET /user/cip` lo adelanta en `withdraw_requirement`: `required` (hay algo que
 * enseñar), `blocking` (el servidor ya rechaza) y, en los días de aviso, `enforce_from`.
 * La app nunca decide sola quién está afectado: sin ese campo (qpweb anterior, o la regla
 * apagada) no pinta nada, y el 403 sigue siendo la autoridad.
 *
 * El texto se redacta aquí, en el idioma del usuario y con el nombre que la pantalla tiene
 * en la app (el `error` del servidor viene en español y habla de «Datos de tu cuenta»).
 */

import type { CipWithdrawRequirement, UserCip } from '../types/domain'

export const CIP_REQUIRED_CODE = 'CIP_REQUIRED'

/** Las salidas que frena la puerta (mismos nombres que `CIP_GATE_ACTIONS` de qpweb). */
export type CipGateAction = 'withdraw' | 'swap_out' | 'p2p_sell'

/** Qué falta, reducido a lo que la app sabe decir. */
export type CipMissingKind = 'address' | 'ssn' | 'both'

/** ¿El rechazo es el de la ficha CIP? (`details` = cuerpo del error, como llega en `ApiResult`). */
export const isCipRequiredError = (details: unknown): boolean =>
	(details as { code?: unknown } | null | undefined)?.code === CIP_REQUIRED_CODE

/** El requisito vigente de la ficha, o null si no hay nada que enseñar. */
export function activeCipRequirement(cip: Pick<UserCip, 'withdraw_requirement'> | null | undefined): CipWithdrawRequirement | null {
	const requirement = cip?.withdraw_requirement
	return requirement && requirement.required === true ? requirement : null
}

/** `missing` del servidor → qué decir. Vacío o desconocido = la dirección (lo que le falta a casi todos). */
export function cipMissingKind(missing: unknown): CipMissingKind {
	const list = Array.isArray(missing) ? missing.map(String) : []
	const ssn = list.includes('ssn')
	const address = list.includes('address') || !ssn
	if (ssn && address) { return 'both' }
	return ssn ? 'ssn' : 'address'
}

/** Traductor mínimo (el `t` de i18next cabe aquí; los tests pasan uno propio). */
type Translate = (key: string, params?: Record<string, unknown>) => string

/** Día y mes de `enforce_from` en el idioma del usuario, o null si no hay fecha válida. */
export function cipEnforceDay(enforceFrom: unknown, locale: string): string | null {
	if (typeof enforceFrom !== 'string' || !enforceFrom) { return null }
	const date = new Date(enforceFrom)
	if (Number.isNaN(date.getTime())) { return null }
	// La fecha del servidor es medianoche UTC: se enseña ese día, no el anterior del huso local
	return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/**
 * Título y cuerpo del aviso.
 *
 * @param input.blocking - El servidor ya rechaza (un 403 recibido cuenta como tal).
 * @param input.enforceFrom - En los días de aviso, desde cuándo frenará.
 */
export function cipNoticeCopy(
	{ action, blocking, missing, enforceFrom }: { action: CipGateAction, blocking: boolean, missing?: unknown, enforceFrom?: unknown },
	t: Translate,
	locale: string,
): { title: string, body: string } {
	const parts: string[] = []
	const day = blocking ? null : cipEnforceDay(enforceFrom, locale)
	if (day) { parts.push(t(`ui.cipNotice.soon.${action}`, { date: day })) }
	parts.push(t(`ui.cipNotice.missing.${cipMissingKind(missing)}`))
	parts.push(t('ui.cipNotice.where'))
	return {
		title: blocking ? t(`ui.cipNotice.blocked.${action}`) : t('ui.cipNotice.title'),
		body: parts.join(' '),
	}
}
