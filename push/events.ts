import AsyncStorage from '@react-native-async-storage/async-storage'
import { pushApi } from '../api/pushApi'
import { getAuthToken } from '../api/client'
import type { PushEventName } from '../api/pushApi'

/**
 * Eventos de entrega (`opened` / `received`) por `did` de la push: se encolan
 * en disco y se mandan fire-and-forget (`POST /push/events { did, event }`).
 * Sin red se quedan en la cola y salen en el siguiente arranque o al volver la
 * app al frente (`flushPushEvents`). Un rechazo 4xx (salvo 429) descarta el
 * evento: reintentarlo no lo arregla.
 */
const QUEUE_KEY = '@qppush:events'
/** Tope de la cola: más que esto es una app sin red durante semanas, no vale la pena guardarlo. */
export const MAX_QUEUED_EVENTS = 50
/** `did` válido para qpweb (id de `push_deliveries`): cadena numérica. Otra cosa sería un 400 seguro. */
export const DID_PATTERN = /^\d{1,19}$/

/** Entrada de la cola: lo que se manda más `at` (local), que la identifica y ordena. */
export type QueuedPushEvent = { did: string, event: PushEventName, at: string }

const readQueue = async (): Promise<QueuedPushEvent[]> => {
	try {
		const raw = await AsyncStorage.getItem(QUEUE_KEY)
		const parsed = raw ? JSON.parse(raw) : []
		return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.did === 'string' && typeof e.event === 'string' && typeof e.at === 'string') : []
	} catch {
		return []
	}
}

const writeQueue = async (queue: QueuedPushEvent[]): Promise<void> => {
	try {
		if (queue.length) await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
		else await AsyncStorage.removeItem(QUEUE_KEY)
	} catch { /* sin disco: el evento se pierde */ }
}

/** ¿Este fallo se arregla reintentando más tarde (red, 5xx, 429)? */
export const isRetryableFailure = (status: number | undefined): boolean =>
	status === undefined || status >= 500 || status === 429

let flushing: Promise<void> | null = null

/**
 * Las mutaciones de la cola van en serie: un leer-modificar-escribir suelto
 * perdía eventos cuando un `track` caía entre la relectura del flush y su
 * escritura, o cuando dos `track` se cruzaban.
 */
let mutations: Promise<unknown> = Promise.resolve()
const mutateQueue = (change: (queue: QueuedPushEvent[]) => QueuedPushEvent[]): Promise<void> => {
	const run = async () => { await writeQueue(change(await readQueue())) }
	const next = mutations.then(run, run)
	mutations = next.catch(() => { /* la siguiente mutación no hereda el fallo */ })
	return next
}

const eventKey = (event: QueuedPushEvent): string => `${event.did}|${event.event}|${event.at}`

/**
 * Manda lo encolado, en orden. Al primer fallo recuperable se para y conserva
 * el resto (sin red todos fallarían igual). Sin sesión no se intenta: el
 * endpoint exige el bearer y un 401 sería ruido. Lo que se encoló MIENTRAS
 * se mandaba sobrevive: se quita de la cola solo lo procesado, por identidad.
 */
export const flushPushEvents = (): Promise<void> => {
	if (flushing) return flushing
	flushing = (async () => {
		try {
			const queue = await readQueue()
			if (!queue.length) return
			if (!(await getAuthToken())) return
			let index = 0
			while (index < queue.length) {
				const { did, event } = queue[index]
				const result = await pushApi.sendEvent({ did, event })
				if (!result.success && isRetryableFailure(result.status)) break
				index += 1
			}
			const processed = new Set(queue.slice(0, index).map(eventKey))
			await mutateQueue(current => current.filter(event => !processed.has(eventKey(event))))
		} finally {
			flushing = null
		}
	})()
	return flushing
}

/**
 * Encola un evento para la push `did` y dispara el envío. Sin `did` válido
 * (push de antes del cambio, de prueba, o un valor que qpweb rechazaría) no
 * hay nada que reportar.
 */
export const trackPushEvent = async (did: string | null | undefined, event: PushEventName): Promise<void> => {
	if (!did || !DID_PATTERN.test(did)) return
	const entry: QueuedPushEvent = { did, event, at: new Date().toISOString() }
	await mutateQueue(queue => [...queue, entry].slice(-MAX_QUEUED_EVENTS))
	// Un flush en curso ya leyó la cola sin este evento: se encadena otro detrás
	if (flushing) await flushing.catch(() => {})
	flushPushEvents().catch(() => {})
}
