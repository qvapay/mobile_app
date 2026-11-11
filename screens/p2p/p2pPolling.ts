/**
 * Ritmo de consultas de la ficha de una oferta P2P y qué respuestas son un «no».
 * PURO (sin react-native): lo comparten useP2POfferDetail y useP2PChatSSE.
 *
 * El estado de la oferta no tiene stream: la ficha lo consulta (`GET /p2p/{uuid}`).
 * Quien es parte de un trato vivo necesita verlo cambiar enseguida (5 s); una oferta
 * abierta solo cambia cuando alguien la toma, y al dueño le llega push (15 s, como
 * la web). `poll_after_ms` del servidor manda si viene, para mover el ritmo sin
 * sacar versión (también ante un incidente).
 */

/** Parte de un trato vivo (processing/paid, o una orden viva de la que eres parte). */
export const POLL_LIVE_MS = 5000
/** Oferta abierta: el dueño esperando o alguien que solo mira. */
export const POLL_IDLE_MS = 15000
/** Límites de `poll_after_ms`: un valor fuera de rango no puede tumbar ni dormir la ficha. */
export const POLL_MIN_MS = 3000
export const POLL_MAX_MS = 60000

/**
 * Lee `poll_after_ms` de la respuesta de `GET /p2p/{uuid}`: hermano de `p2p` en el
 * sobre (`{ message, p2p, poll_after_ms }`), o dentro de la oferta si llega pelada.
 * Solo un número finito cuenta; cualquier otra cosa es «no vino» (null).
 */
export function readPollAfterMs(data: unknown): number | null {
	if (!data || typeof data !== "object") return null
	const envelope = data as { poll_after_ms?: unknown, p2p?: { poll_after_ms?: unknown } | null }
	const raw = envelope.poll_after_ms ?? envelope.p2p?.poll_after_ms
	return typeof raw === "number" && Number.isFinite(raw) ? raw : null
}

/**
 * Cada cuánto consultar la oferta, o `null` para no consultar.
 *
 * @param params.active - La oferta (o una orden viva) puede cambiar: open/processing/paid.
 * @param params.liveParty - Quien mira es parte de un trato vivo.
 * @param params.serverMs - `poll_after_ms` de la última respuesta fresca (null = no vino).
 *   Manda sobre lo demás: 0 o negativo = no consultar; si no, acotado a 3–60 s.
 */
export function offerPollDelay({ active, liveParty, serverMs = null }: { active: boolean, liveParty: boolean, serverMs?: number | null }): number | null {
	if (serverMs != null) {
		if (serverMs <= 0) return null
		return Math.min(POLL_MAX_MS, Math.max(POLL_MIN_MS, serverMs))
	}
	if (!active) return null
	return liveParty ? POLL_LIVE_MS : POLL_IDLE_MS
}

/**
 * Un «no» del servidor, no una caída: un 4xx que el tiempo no arregla (400 gates del
 * P2P, 401, 403 sin acceso o bloqueo, 404 oferta que ya no ves). Repetir la consulta
 * daría lo mismo. 408 y 429 sí se arreglan esperando; sin status (red caída) tampoco
 * es un «no».
 */
export function isRefusalStatus(status: unknown): boolean {
	return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429
}
