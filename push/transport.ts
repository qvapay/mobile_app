import { Platform } from 'react-native'
import type { PushTokenInfo } from './registration'

/**
 * Estado del permiso de notificaciones, igual en las dos plataformas:
 * `undetermined` = se puede preguntar; `denied` = el usuario acaba de decir que
 * no (Android, se puede volver a preguntar); `blocked` = solo se arregla en
 * Ajustes del sistema (iOS tras un no, Android tras "no volver a preguntar"
 * o con las notificaciones de la app apagadas).
 */
export type PushPermission = 'granted' | 'denied' | 'blocked' | 'undetermined'

/** Claves que viajan en el `data` de una push de QvaPay (además del `type` y los ids de siempre). */
export type PushPayload = Record<string, string>

/** Una push ya normalizada: título/cuerpo (si los trae) + `data` con valores string. */
export type PushMessage = { title?: string, body?: string, data: PushPayload }

/**
 * Lo que cada plataforma tiene que saber hacer. Android lo implementa con
 * Firebase Cloud Messaging (`androidTransport`); iOS con el módulo nativo
 * propio `QPPush` sobre APNs, sin Firebase (`iosTransport`): el backend manda
 * a APNs directo, y React Native Firebase en iOS descarta toda notificación
 * que no venga de FCM (sin `gcm.message_id` no reenvía ni el tap a JS).
 */
export type PushTransport = {
	getPermission(): Promise<PushPermission>
	/** Pide el permiso del sistema. Si ya no puede preguntar, devuelve `blocked` sin diálogo. */
	requestPermission(): Promise<PushPermission>
	/** Token actual, o null si aún no hay (simulador, sin red, sin permiso en Android). */
	getToken(): Promise<PushTokenInfo | null>
	onTokenRefresh(listener: (token: PushTokenInfo) => void): () => void
	/** Push recibida con la app DELANTE (el sistema no la muestra: la app decide). */
	onMessage(listener: (message: PushMessage) => void): () => void
	/** Toque en una push con la app viva (al frente o en segundo plano). */
	onOpened(listener: (message: PushMessage) => void): () => void
	/** Toque que ARRANCÓ la app (cerrada); se consume una sola vez. */
	getInitialMessage(): Promise<PushMessage | null>
}

/**
 * `data` de la push con todos los valores como string. En Android FCM ya los
 * entrega así; en iOS las claves van en la raíz del payload junto a `aps` y
 * pueden llegar como número/booleano (un objeto se guarda serializado).
 */
export const normalizePushData = (raw: unknown): PushPayload => {
	const data: PushPayload = {}
	if (!raw || typeof raw !== 'object') return data
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (key === 'aps' || value === null || value === undefined) continue
		if (typeof value === 'string') data[key] = value
		else if (typeof value === 'number' || typeof value === 'boolean') data[key] = String(value)
		else { try { data[key] = JSON.stringify(value) } catch { /* no serializable: fuera */ } }
	}
	return data
}

let transport: PushTransport | null = null

/** La implementación de la plataforma, creada la primera vez que hace falta. */
export const getTransport = (): PushTransport => {
	if (!transport) {
		// Carga perezosa: el módulo de Firebase solo existe (y solo compila) en Android
		transport = Platform.OS === 'android'
			? (require('./androidTransport') as typeof import('./androidTransport')).createAndroidTransport()
			: (require('./iosTransport') as typeof import('./iosTransport')).createIosTransport()
	}
	return transport
}

/** Solo tests: fuerza una implementación. */
export const __setTransportForTests = (next: PushTransport | null): void => { transport = next }
