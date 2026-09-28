/**
 * Qué hacer con la respuesta del backend al canjear un permiso de patrocinio. PURO —
 * sin React ni red, testeado en node.
 *
 * Vive fuera del hook porque aquí se decide algo que no se puede equivocar: **si el
 * permiso se consumió**. Darlo por libre cuando en realidad se gastó deja al usuario
 * reenviando algo que ya salió; darlo por gastado cuando no lo estaba le quita su envío
 * gratis del día por un error de red.
 */
import type { GaslessSubmitResult } from '../../../types/domain'

export type SubmitAction =
	/** Está en la red y se conoce su firma. */
	| { kind: 'done', txid: string }
	/** Difundida sin firma a mano: hay que preguntar por el permiso hasta resolverlo. */
	| { kind: 'poll' }
	/** El blockhash caducó antes de llegar: reconstruir y reenviar con el MISMO permiso. */
	| { kind: 'rebuild' }
	| { kind: 'error', message: string }

export const interpretSubmit = (outcome: GaslessSubmitResult): SubmitAction => {
	if (outcome.status === 'confirmed' && outcome.signature) { return { kind: 'done', txid: outcome.signature } }
	if (outcome.status === 'pending') {
		return outcome.signature ? { kind: 'done', txid: outcome.signature } : { kind: 'poll' }
	}
	// `rebuild` solo llega con el permiso intacto, así que se comprueba antes que el resto
	if (outcome.rebuild) { return { kind: 'rebuild' } }
	return { kind: 'error', message: outcome.message || outcome.reason || 'sponsored_failed' }
}

/**
 * ¿Este desenlace gastó el permiso?
 *
 * Todo lo que llegó a la red lo gasta, y también lo que quedó en revisión: ahí puede
 * haberse cobrado y nadie debería poder reintentarlo por su cuenta. Solo `authorized`
 * —que es lo que devuelve el backend cuando PRUEBA que no se gastó nada— lo conserva.
 */
export const consumesGrant = (outcome: GaslessSubmitResult): boolean => outcome.status !== 'authorized'

/**
 * Qué aviso mostrar cuando el envío VA patrocinado.
 *
 * `remaining_today` del backend es lo que queda DESPUÉS de gastar este permiso, así que con
 * la cuota en 1/día siempre llega como 0. Pintarlo tal cual daba "Te quedan 0 envíos gratis
 * hoy" justo encima de un envío que sí era gratis: se lee como una negativa y hace dudar de
 * si el patrocinio se aplicó.
 */
export const sponsoredNotice = (remainingToday: number | null): 'remaining' | 'lastFree' =>
	remainingToday !== null && remainingToday > 0 ? 'remaining' : 'lastFree'

/** Un permiso caducado no se puede canjear: hay que pedir otro. */
export const isGrantUsable = (expiresAt: string, now: number = Date.now()): boolean => {
	const expiry = Date.parse(expiresAt)
	return Number.isFinite(expiry) && expiry > now
}
