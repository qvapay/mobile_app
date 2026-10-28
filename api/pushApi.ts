import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'

/** Plataforma del token tal y como la clasifica qpweb (`platform` de `POST /push/tokens`). */
export type PushPlatform = 'ios' | 'android'
/** Quién entrega el token: FCM (Android) o APNs directo (iOS, sin Firebase). Lo deduce qpweb por `platform`; la app no lo manda. */
export type PushProvider = 'fcm' | 'apns'
/** Entorno APNs del build: debug/Xcode = sandbox; TestFlight y App Store = production. */
export type ApnsEnvironment = 'sandbox' | 'production'

/**
 * Cuerpo de `POST /push/tokens` — contrato de qpweb (`content/docs/push/tokens.mdx`,
 * `app/api/push/tokens/route.js`), en snake_case como el resto de la API.
 * `platform` tiene que coincidir con la cabecera `X-QvaPay-Client-Platform`
 * (si no, 400 `PLATFORM_MISMATCH`).
 */
export type PushTokenRegistration = {
	platform: PushPlatform
	/** Token FCM, o token APNs en hex. */
	token: string
	/** uuid de instalación (Keychain): el backend revoca el token anterior del mismo dispositivo. */
	device_id: string
	app_version: string
	os_version: string
	/** Modelo del dispositivo (el mismo que viaja en `X-QvaPay-Client-Device`). */
	model: string
	/** Idioma de la app (`es`, `en`, `pt`). */
	locale: string
	/** Zona IANA: qpweb no manda campañas de noche en la hora local del dispositivo. */
	timezone: string
	/** Solo iOS. qpweb asume `production` si falta: un build de Xcode DEBE mandar `sandbox`. */
	apns_environment?: ApnsEnvironment
}

/** Respuesta de `POST /push/tokens`: 201 al crear, 200 al actualizar. */
export type PushTokenRegistered = { id: string, platform: PushPlatform | 'web', status: 'active', created: boolean }

/** Eventos de entrega que la app reporta por `did` (id de la entrega, viaja en el payload). */
export type PushEventName = 'opened' | 'received'

/** Cuerpo de `POST /push/events`. `did` es una cadena numérica. */
export type PushEventBody = { did: string, event: PushEventName }

/** Respuesta de `POST /push/events`: siempre 200; `applied: false` = ya estaba registrado o el `did` no es del usuario. */
export type PushEventResult = { ok: boolean, applied: boolean }

const failure = (err: unknown, fallbackKey: string): ApiResult<never> => {
	const error = err as ApiClientError
	if (error.response?.data) {
		const errorData = error.response.data
		return { success: false, error: errorData.error || errorData.message || i18n.t(fallbackKey), details: errorData, status: error.response.status }
	}
	return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
}

/**
 * Push propias (sin OneSignal): qpweb guarda el token por dispositivo y manda
 * directo a FCM (Android) y APNs (iOS). Todas las llamadas van con
 * `silent: true`: son fontanería de fondo y nunca encienden la barra de carga.
 */
export const pushApi = {
	/**
	 * Registra (o actualiza) el token del dispositivo para la cuenta en sesión
	 * (`POST /push/tokens`). Idempotente por token: el último login gana, y con
	 * `device_id` el token anterior del mismo dispositivo se revoca.
	 * Errores: 400 `PLATFORM_MISMATCH` / datos inválidos, 429 (10/min por usuario), 503 `PUSH_UNAVAILABLE`.
	 */
	registerToken: async (registration: PushTokenRegistration): Promise<ApiResult<PushTokenRegistered>> => {
		try {
			const response = await apiClient.post<PushTokenRegistered>('/push/tokens', registration, { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			return failure(err, 'api.common.networkError')
		}
	},

	/**
	 * Da de baja el dispositivo (`DELETE /push/tokens { device_id }`) — en el
	 * logout, ANTES de borrar la sesión: el endpoint exige el bearer.
	 */
	deleteToken: async (deviceId: string): Promise<ApiResult<{ revoked: number }>> => {
		try {
			const response = await apiClient.delete<{ revoked: number }>('/push/tokens', { data: { device_id: deviceId }, silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			return failure(err, 'api.common.networkError')
		}
	},

	/** Reporta que una push se recibió o se abrió (`POST /push/events`; 60/min por usuario). */
	sendEvent: async (event: PushEventBody): Promise<ApiResult<PushEventResult>> => {
		try {
			const response = await apiClient.post<PushEventResult>('/push/events', event, { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			return failure(err, 'api.common.networkError')
		}
	},
}
