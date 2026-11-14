/**
 * Qué hacer con la respuesta del backend al canjear un permiso de patrocinio. PURO —
 * sin React ni red, testeado en node.
 *
 * Vive fuera del hook porque aquí se decide algo que no se puede equivocar: **si el
 * permiso se consumió**. Darlo por libre cuando en realidad se gastó deja al usuario
 * reenviando algo que ya salió; darlo por gastado cuando no lo estaba le quita su envío
 * gratis del día por un error de red.
 */
import type { GaslessSubmitResult, SponsorChain } from '../../../types/domain'

/**
 * Activos que el backend patrocina, por cadena y POR CONTRATO: un símbolo lo elige
 * cualquiera, una dirección no. Se comprueban aquí solo para no gastar una petición; quien
 * decide de verdad es qpweb (misma lista en `scripts/gasless/config.js`).
 *
 * - Solana: QvaPay es el fee payer de la tx (hueco 0).
 * - BSC: la tx sale con gasPrice 0 y un paymaster BEP-414 la mete en bloque pagando él.
 *   Solo USDT: USDC queda fuera a propósito.
 */
const SPONSORED_CONTRACTS: Record<SponsorChain, string[]> = {
	solana: ['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
	bsc: ['0x55d398326f99059ff775485246999027b3197955'],
}

/** La cadena de patrocinio de un activo, o null si no se patrocina. EVM compara en minúsculas. */
export const sponsorChainFor = (asset: { chainKey: string, contract: string | null } | undefined): SponsorChain | null => {
	if (!asset?.contract) { return null }
	if (asset.chainKey === 'solana') { return SPONSORED_CONTRACTS.solana.includes(asset.contract) ? 'solana' : null }
	if (asset.chainKey === 'bsc') { return SPONSORED_CONTRACTS.bsc.includes(asset.contract.toLowerCase()) ? 'bsc' : null }
	return null
}

/**
 * La cadena de un permiso. Un qpweb anterior al patrocinio en BSC no manda `chain`: todo
 * lo que emitía era de Solana.
 */
export const grantChain = (grant: { chain?: SponsorChain | null }): SponsorChain => grant.chain ?? 'solana'

/**
 * Motivos con los que el backend contesta `authorized` («no se gastó nada») SIN haberlo
 * probado. `broadcast_failed`: la tx llegó a mandarse a un nodo y falló o no hubo respuesta;
 * el nodo pudo aceptarla igual.
 */
const UNPROVEN_REASONS = new Set(['broadcast_failed'])

/**
 * ¿El backend dice «no se gastó» pero en realidad no se sabe si la tx entró?
 *
 * Solo en Solana. En BSC no hace falta tratarlo aparte: la tx patrocinada y la que el
 * usuario mande pagando llevan el MISMO nonce, así que solo una de las dos puede entrar.
 * En Solana no hay nada parecido: ofrecer ahí «pagar el envío» era mandar dos veces.
 */
export const isUnprovenOutcome = (outcome: GaslessSubmitResult, chain: SponsorChain): boolean =>
	chain === 'solana' && outcome.status === 'authorized' && !outcome.rebuild && UNPROVEN_REASONS.has(outcome.reason ?? '')

export type SubmitAction =
	/** Está en la red, CONFIRMADA, y se conoce su firma. */
	| { kind: 'done', txid: string }
	/** Difundida y aún sin confirmar: hay que preguntar por el permiso hasta resolverlo. */
	| { kind: 'poll' }
	/** No se sabe si entró: ni se da por enviada ni se ofrece pagar. Lo decide la cadena. */
	| { kind: 'unknown' }
	/**
	 * Reconstruir y reenviar con el MISMO permiso: en Solana caducó el blockhash; en BSC
	 * el nonce de la tx ya se usó (NONCE_STALE).
	 */
	| { kind: 'rebuild' }
	| { kind: 'error', message: string }

export const interpretSubmit = (outcome: GaslessSubmitResult, chain: SponsorChain = 'solana'): SubmitAction => {
	if (outcome.status === 'confirmed' && outcome.signature) { return { kind: 'done', txid: outcome.signature } }
	// `pending` = difundida y NO vista confirmar, tenga firma o no. Antes, con firma se daba
	// por «Enviado»; si luego la red la descartaba, la pantalla ya había dicho que sí
	if (outcome.status === 'pending') { return { kind: 'poll' } }
	// `rebuild` solo llega con el permiso intacto, así que se comprueba antes que el resto
	if (outcome.rebuild) { return { kind: 'rebuild' } }
	if (isUnprovenOutcome(outcome, chain)) { return { kind: 'unknown' } }
	return { kind: 'error', message: outcome.message || outcome.reason || 'sponsored_failed' }
}

/**
 * ¿Este desenlace gastó el permiso?
 *
 * Todo lo que llegó a la red lo gasta, y también lo que quedó en revisión: ahí puede
 * haberse cobrado y nadie debería poder reintentarlo por su cuenta. Solo `authorized`
 * —que es lo que devuelve el backend cuando PRUEBA que no se gastó nada— lo conserva, y ni
 * siquiera siempre: con un motivo sin probar (`isUnprovenOutcome`) pudo gastarse.
 */
export const consumesGrant = (outcome: GaslessSubmitResult, chain: SponsorChain = 'solana'): boolean =>
	outcome.status !== 'authorized' || isUnprovenOutcome(outcome, chain)

/**
 * ¿Hay que dejar el patrocinio y ofrecer el envío pagando?
 *
 * Cuando el backend PRUEBA que no se gastó nada (`authorized`) y no se arregla
 * reconstruyendo, reintentar gratis no lleva a ningún sitio: el paymaster no la acepta,
 * hay otra tx del usuario sin minar, el presupuesto se agotó… Sin esta salida, la pantalla
 * se quedaba atrapada reenviando un envío gratis que nunca iba a salir. El permiso se
 * devuelve a la cuota y la tx se reconstruye como un envío normal.
 *
 * Nunca con un desenlace sin probar: si la tx pudo entrar, pagar otra es enviar dos veces.
 */
export const fallsBackToPaid = (outcome: GaslessSubmitResult, chain: SponsorChain = 'solana'): boolean =>
	outcome.status === 'authorized' && !outcome.rebuild && !isUnprovenOutcome(outcome, chain)

/**
 * Qué significa que la PETICIÓN de canje falle (no llegó un desenlace del backend).
 *
 * Antes todo fallo era «no se sabe», y con un permiso caducado la pantalla se quedaba en
 * «no pudimos confirmar» para siempre: reintentar daba el mismo error y nada lo resolvía.
 * Pero el backend rechaza antes de mandar nada a la red cuando el permiso no vale, y eso sí
 * es una respuesta: esa petición no envió nada.
 */
export type SubmitFailure =
	/** Un canje anterior de este permiso ya entró y consta su firma. */
	| { kind: 'done', txid: string }
	/** Esta petición no mandó nada a la red. `grantGone`: el permiso ya no sirve (caducó, no existe, se usó). */
	| { kind: 'rejected', grantGone: boolean }
	/** No se sabe si llegó a mandarse (sin respuesta, error del servidor, u otro canje de este permiso en curso). */
	| { kind: 'unknown' }

export const classifySubmitFailure = (failure: { status?: number, details?: unknown }): SubmitFailure => {
	const details = (failure.details ?? null) as { code?: unknown, status?: unknown, signature?: unknown } | null
	const code = typeof details?.code === 'string' ? details.code : null
	if (code === 'GRANT_NOT_AVAILABLE') {
		if (details?.status === 'confirmed' && typeof details.signature === 'string' && details.signature) { return { kind: 'done', txid: details.signature } }
		// Lo mandó un canje anterior y aún no se sabe qué fue de él
		if (details?.status === 'submitted' || details?.status === 'pending' || details?.status === 'review') { return { kind: 'unknown' } }
		return { kind: 'rejected', grantGone: true }
	}
	if (code === 'GRANT_EXPIRED' || code === 'NOT_FOUND') { return { kind: 'rejected', grantGone: true }	}
	// Cualquier otro 4xx (límite de peticiones, cuerpo inválido, sesión): el servidor dijo que no antes de enviar
	if (typeof failure.status === 'number' && failure.status >= 400 && failure.status < 500) { return { kind: 'rejected', grantGone: false } }
	return { kind: 'unknown' }
}

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
