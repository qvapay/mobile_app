/**
 * Reglas PURAS de la pausa de una oferta P2P (espejo de `scripts/p2p/pause-rules.js`
 * de qpweb; guía en `content/docs/p2p/pause.mdx`). Una oferta pausada sigue en
 * `status: 'open'`, pero sale del mercado y nadie puede tomarla.
 * Sin react-native: se testea con `@jest-environment node`.
 */

import type { P2POffer, P2POfferPause } from '../../types/domain'

/**
 * La pausa vigente de una oferta, o null. El servidor ya manda `pause: null` al
 * vencer, pero la lista y `p2p_cache_{uuid}` pueden traer una copia vieja: una
 * pausa con `until` pasado ya no cuenta. Una orden proyectada nunca está `open`.
 */
export const activePause = (offer: Pick<P2POffer, 'status' | 'pause'> | null | undefined, now: number = Date.now()): P2POfferPause | null => {
	const pause = offer?.pause
	if (!pause || offer?.status !== 'open') return null
	if (pause.until && Date.parse(pause.until) <= now) return null
	return pause
}

/** Cuándo vuelve sola al mercado (ISO): solo la pausa automática tras irse quien la tomó. */
export const pauseResumesAt = (pause: P2POfferPause | null | undefined): string | null =>
	pause?.reason === 'taker_left' ? pause.until : null
