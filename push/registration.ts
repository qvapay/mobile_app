/**
 * Lógica PURA del registro del token (sin react-native): qué se manda al
 * backend y cuándo hace falta volver a mandarlo. Se testea en node.
 */
import type { ApnsEnvironment, PushPlatform, PushProvider, PushTokenRegistration } from '../api/pushApi'

/** Token tal y como lo entrega la plataforma. `provider` es informativo (qpweb lo deduce por `platform`). */
export type PushTokenInfo = { token: string, provider: PushProvider, apnsEnv?: ApnsEnvironment }

export type RegistrationContext = {
	token: PushTokenInfo
	platform: PushPlatform
	deviceId: string
	appVersion: string
	osVersion: string
	model: string
	locale: string
	timezone: string
}

/** Lo que recuerda la app del último registro que el backend aceptó. */
export type RegistrationRecord = { fingerprint: string, at: number }

/**
 * Un registro aceptado se repite igualmente pasado este tiempo: el backend
 * usa la última vez que vio el dispositivo para limpiar tokens muertos, y un
 * usuario que no cambia de token en meses seguiría contando como vivo.
 */
export const REREGISTER_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Cuerpo de `POST /push/tokens` a partir del contexto del dispositivo, en el
 * snake_case que espera qpweb. `apns_environment` solo viaja en iOS: qpweb
 * asume `production` si falta, así que un build de Xcode (sandbox) que no lo
 * mandara recibiría pushes que APNs rechaza en silencio.
 */
export const buildRegistration = (ctx: RegistrationContext): PushTokenRegistration => ({
	platform: ctx.platform,
	token: ctx.token.token,
	device_id: ctx.deviceId,
	app_version: ctx.appVersion,
	os_version: ctx.osVersion,
	model: ctx.model,
	locale: ctx.locale,
	timezone: ctx.timezone,
	...(ctx.platform === 'ios' && ctx.token.apnsEnv ? { apns_environment: ctx.token.apnsEnv } : {}),
})

/**
 * Huella del registro: el payload entero MÁS la cuenta. Cambiar de usuario con
 * el mismo token tiene que volver a registrar (el token pasa a la cuenta nueva
 * en el backend); cambiar de versión, idioma o zona también.
 */
export const registrationFingerprint = (registration: PushTokenRegistration, userUuid: string): string =>
	JSON.stringify([
		userUuid,
		registration.platform,
		registration.token,
		registration.apns_environment ?? '',
		registration.device_id,
		registration.app_version,
		registration.os_version,
		registration.model,
		registration.locale,
		registration.timezone,
	])

/** ¿Hay que mandar este registro, o el backend ya tiene exactamente esto y es reciente? */
export const needsRegistration = (last: RegistrationRecord | null, fingerprint: string, now: number): boolean => {
	if (!last) return true
	if (last.fingerprint !== fingerprint) return true
	return now - last.at >= REREGISTER_AFTER_MS
}

/** Serializa/parsea el registro guardado (AsyncStorage). Un valor corrupto cuenta como "nunca". */
export const parseRegistrationRecord = (raw: string | null | undefined): RegistrationRecord | null => {
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw) as Partial<RegistrationRecord>
		if (typeof parsed?.fingerprint !== 'string' || typeof parsed?.at !== 'number') return null
		return { fingerprint: parsed.fingerprint, at: parsed.at }
	} catch {
		return null
	}
}
