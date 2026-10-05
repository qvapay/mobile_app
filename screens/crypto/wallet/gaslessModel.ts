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

export type SubmitAction =
	/** Está en la red y se conoce su firma. */
	| { kind: 'done', txid: string }
	/** Difundida sin firma a mano: hay que preguntar por el permiso hasta resolverlo. */
	| { kind: 'poll' }
	/**
	 * Reconstruir y reenviar con el MISMO permiso: en Solana caducó el blockhash; en BSC
	 * el nonce de la tx ya se usó (NONCE_STALE).
	 */
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
 * ¿Hay que dejar el patrocinio y ofrecer el envío pagando?
 *
 * Cuando el backend PRUEBA que no se gastó nada (`authorized`) y no se arregla
 * reconstruyendo, reintentar gratis no lleva a ningún sitio: el paymaster no la acepta,
 * hay otra tx del usuario sin minar, el presupuesto se agotó… Sin esta salida, la pantalla
 * se quedaba atrapada reenviando un envío gratis que nunca iba a salir. El permiso se
 * devuelve a la cuota y la tx se reconstruye como un envío normal.
 */
export const fallsBackToPaid = (outcome: GaslessSubmitResult): boolean => outcome.status === 'authorized' && !outcome.rebuild

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
