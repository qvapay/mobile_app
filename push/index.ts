import { AppState, Linking, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import DeviceInfo from 'react-native-device-info'
import i18n from '../i18n'
import { getAuthToken } from '../api/client'
import { pushApi } from '../api/pushApi'
import { getPushDeviceId } from './deviceId'
import { flushPushEvents, trackPushEvent } from './events'
import { buildRegistration, needsRegistration, parseRegistrationRecord, registrationFingerprint } from './registration'
import { getTransport } from './transport'
import type { PushMessage, PushPayload, PushPermission } from './transport'

/**
 * Push propias de QvaPay (sin OneSignal): el token del dispositivo se registra
 * en qpweb (`POST /push/tokens`), que manda directo a FCM (Android) y APNs
 * (iOS). Este módulo es la única puerta: permiso, registro/baja del token,
 * eventos de entrega y las suscripciones que consume `hooks/useAppNavigation`.
 *
 * Ciclo de vida:
 * - `initPush()` una vez al arrancar (App.tsx, fuera del árbol): refresco de
 *   token y vaciado de la cola de eventos al volver al frente.
 * - `syncPushToken(uuid)` al abrir sesión y en cada arranque con sesión: solo
 *   manda si hay permiso, token y algo cambió (huella en disco; ver
 *   `registration.ts`).
 * - `requestPushPermission()` desde los prompts (usePushPrompt / Ajustes); al
 *   concederse registra en el acto.
 * - `unregisterPush()` en el logout, ANTES de borrar el bearer.
 */
const REGISTRATION_KEY = '@qppush:registration'
/** Tope de espera por la vuelta desde Ajustes del sistema. */
const SETTINGS_RETURN_TIMEOUT_MS = 5 * 60 * 1000

let currentUserUuid: string | null = null
let initialized = false
let syncing: Promise<void> | null = null

const deviceTimezone = (): string => {
	try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

const doSync = async (userUuid: string, force: boolean): Promise<void> => {
	const transport = getTransport()
	if ((await transport.getPermission()) !== 'granted') return
	if (!(await getAuthToken())) return
	const token = await transport.getToken()
	if (!token) return
	const deviceId = await getPushDeviceId()
	if (!deviceId) return

	const registration = buildRegistration({
		token,
		platform: Platform.OS === 'android' ? 'android' : 'ios',
		deviceId,
		appVersion: DeviceInfo.getVersion(),
		osVersion: DeviceInfo.getSystemVersion(),
		model: DeviceInfo.getModel(),
		locale: i18n.language || 'es',
		timezone: deviceTimezone(),
	})
	const fingerprint = registrationFingerprint(registration, userUuid)
	if (!force) {
		let raw: string | null = null
		try { raw = await AsyncStorage.getItem(REGISTRATION_KEY) } catch { /* sin disco: se registra */ }
		if (!needsRegistration(parseRegistrationRecord(raw), fingerprint, Date.now())) return
	}
	const result = await pushApi.registerToken(registration)
	if (result.success) {
		try { await AsyncStorage.setItem(REGISTRATION_KEY, JSON.stringify({ fingerprint, at: Date.now() })) } catch { /* se repetirá */ }
	}
}

/**
 * Registra el token para `userUuid` si hace falta. Nunca lanza; una llamada
 * en curso se reutiliza. `force` salta la huella (permiso recién concedido).
 */
export const syncPushToken = (userUuid: string, options: { force?: boolean } = {}): Promise<void> => {
	currentUserUuid = userUuid
	if (syncing) return syncing
	syncing = doSync(userUuid, !!options.force)
		.catch(() => { /* fire-and-forget: el siguiente arranque lo reintenta */ })
		.finally(() => { syncing = null })
	return syncing
}

/**
 * Baja del dispositivo en el backend (logout, ANTES de borrar el bearer) y
 * olvido del registro local. Sin bearer no se llama al endpoint. Nunca lanza.
 */
export const unregisterPush = async (): Promise<void> => {
	currentUserUuid = null
	try { await AsyncStorage.removeItem(REGISTRATION_KEY) } catch { /* nada que limpiar */ }
	try {
		if (!(await getAuthToken())) return
		const deviceId = await getPushDeviceId()
		if (deviceId) await pushApi.deleteToken(deviceId)
	} catch { /* el backend limpia tokens muertos por su cuenta */ }
}

/** Estado actual del permiso del sistema. */
export const getPushPermission = (): Promise<PushPermission> => getTransport().getPermission()

/** Resuelve cuando la app vuelve al frente (o pasado el tope). */
const waitForForeground = (): Promise<void> => new Promise(resolve => {
	let done = false
	const finish = () => {
		if (done) return
		done = true
		clearTimeout(timer)
		subscription.remove()
		resolve()
	}
	const timer = setTimeout(finish, SETTINGS_RETURN_TIMEOUT_MS)
	const subscription = AppState.addEventListener('change', state => { if (state === 'active') finish() })
})

/**
 * Pide el permiso de notificaciones. Si el sistema ya no puede preguntar
 * (`blocked`) y `fallbackToSettings`, abre los Ajustes de la app y espera a que
 * el usuario vuelva (así quien llama no sigue su flujo con la app en segundo
 * plano). Concedido → registra el token en el acto si hay sesión.
 *
 * @returns El estado final del permiso.
 */
export const requestPushPermission = async ({ fallbackToSettings = false }: { fallbackToSettings?: boolean } = {}): Promise<PushPermission> => {
	const transport = getTransport()
	let status = await transport.getPermission()
	if (status === 'undetermined' || status === 'denied') status = await transport.requestPermission()
	if (status === 'blocked' && fallbackToSettings) {
		try {
			await Linking.openSettings()
			await waitForForeground()
		} catch { /* sin pantalla de ajustes */ }
		status = await transport.getPermission()
	}
	if (status === 'granted' && currentUserUuid) syncPushToken(currentUserUuid, { force: true }).catch(() => {})
	return status
}

/** Push recibida con la app delante. */
export const subscribeForegroundPush = (listener: (message: PushMessage) => void): (() => void) => getTransport().onMessage(listener)

/** Toque en una push con la app viva. */
export const subscribeOpenedPush = (listener: (message: PushMessage) => void): (() => void) => getTransport().onOpened(listener)

/** La push que arrancó la app, una sola vez. */
export const takeInitialPush = (): Promise<PushMessage | null> => getTransport().getInitialMessage()

/** Evento `opened` por `did` (`POST /push/events`). */
export const trackPushOpened = (data: PushPayload | null | undefined): Promise<void> => trackPushEvent(data?.did, 'opened')

/** Evento `received` por `did` (solo con la app delante: en segundo plano la entrega la cuenta el proveedor). */
export const trackPushReceived = (data: PushPayload | null | undefined): Promise<void> => trackPushEvent(data?.did, 'received')

/**
 * Arranque: refresco de token (re-registra si cambia) y vaciado de la cola de
 * eventos ahora y cada vez que la app vuelve al frente. Idempotente.
 */
export const initPush = (): void => {
	if (initialized) return
	initialized = true
	try {
		getTransport().onTokenRefresh(() => {
			if (currentUserUuid) syncPushToken(currentUserUuid).catch(() => {})
		})
	} catch { /* sin transporte en este build */ }
	AppState.addEventListener('change', state => { if (state === 'active') flushPushEvents().catch(() => {}) })
	flushPushEvents().catch(() => {})
}
