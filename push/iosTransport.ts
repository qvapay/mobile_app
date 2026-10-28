import { NativeEventEmitter, NativeModules, TurboModuleRegistry } from 'react-native'
import type { TurboModule } from 'react-native'
import { normalizePushData } from './transport'
import type { PushMessage, PushPermission, PushTransport } from './transport'
import type { ApnsEnvironment } from '../api/pushApi'

/**
 * Superficie del módulo nativo propio `QPPush` (ios/QvaPay/QPPush.swift):
 * permiso, token APNs en hex con su entorno, la push que arrancó la app y
 * tres eventos (`QPPushToken`, `QPPushForeground`, `QPPushOpened`).
 */
interface QPPushModule extends TurboModule {
	getPermissionStatus(): Promise<string>
	requestPermission(): Promise<string>
	getToken(): Promise<{ token: string, environment: string } | null>
	getInitialNotification(): Promise<Record<string, unknown> | null>
	setBadgeCount(count: number): void
	addListener(eventName: string): void
	removeListeners(count: number): void
}

type NativeToken = { token: string, environment: string }
type NativeNotification = { userInfo: Record<string, unknown> }

/** Se resuelve en call time y sin spread (los métodos de un TurboModule viven en el prototipo). */
const getNative = (): QPPushModule | null =>
	TurboModuleRegistry.get<QPPushModule>('QPPush') ?? (NativeModules.QPPush as QPPushModule | undefined) ?? null

let emitter: NativeEventEmitter | null = null
const getEmitter = (native: QPPushModule): NativeEventEmitter => {
	if (!emitter) emitter = new NativeEventEmitter(native)
	return emitter
}

const toPermission = (status: string | null | undefined): PushPermission => {
	switch (status) {
		case 'authorized':
		case 'provisional':
		case 'ephemeral':
			return 'granted'
		case 'denied':
			// iOS no vuelve a preguntar: solo Ajustes
			return 'blocked'
		default:
			return 'undetermined'
	}
}

const toEnvironment = (value: string | undefined): ApnsEnvironment => (value === 'sandbox' ? 'sandbox' : 'production')

/**
 * `userInfo` de APNs → push normalizada: título/cuerpo salen de `aps.alert`
 * (string u objeto) y el resto de claves de la raíz (`did`, `type`,
 * `deeplink`…) forman el `data`.
 */
export const messageFromUserInfo = (userInfo: Record<string, unknown> | null | undefined): PushMessage | null => {
	if (!userInfo || typeof userInfo !== 'object') return null
	const aps = (userInfo.aps ?? {}) as Record<string, unknown>
	const alert = aps.alert
	let title: string | undefined
	let body: string | undefined
	if (typeof alert === 'string') body = alert
	else if (alert && typeof alert === 'object') {
		const a = alert as Record<string, unknown>
		if (typeof a.title === 'string') title = a.title
		if (typeof a.body === 'string') body = a.body
	}
	return { title, body, data: normalizePushData(userInfo) }
}

export const createIosTransport = (): PushTransport => ({
	getPermission: async () => {
		const native = getNative()
		if (!native) return 'undetermined'
		try { return toPermission(await native.getPermissionStatus()) } catch { return 'undetermined' }
	},
	requestPermission: async () => {
		const native = getNative()
		if (!native) return 'blocked'
		try { return toPermission(await native.requestPermission()) } catch { return 'blocked' }
	},
	getToken: async () => {
		const native = getNative()
		if (!native) return null
		try {
			const result = await native.getToken()
			return result?.token ? { token: result.token, provider: 'apns', apnsEnv: toEnvironment(result.environment) } : null
		} catch {
			return null
		}
	},
	onTokenRefresh: (listener) => {
		const native = getNative()
		if (!native) return () => {}
		const sub = getEmitter(native).addListener('QPPushToken', (event) => {
			const payload = event as NativeToken | undefined
			if (payload?.token) listener({ token: payload.token, provider: 'apns', apnsEnv: toEnvironment(payload.environment) })
		})
		return () => sub.remove()
	},
	onMessage: (listener) => {
		const native = getNative()
		if (!native) return () => {}
		const sub = getEmitter(native).addListener('QPPushForeground', (event) => {
			const message = messageFromUserInfo((event as NativeNotification | undefined)?.userInfo)
			if (message) listener(message)
		})
		return () => sub.remove()
	},
	onOpened: (listener) => {
		const native = getNative()
		if (!native) return () => {}
		const sub = getEmitter(native).addListener('QPPushOpened', (event) => {
			const message = messageFromUserInfo((event as NativeNotification | undefined)?.userInfo)
			if (message) listener(message)
		})
		return () => sub.remove()
	},
	getInitialMessage: async () => {
		const native = getNative()
		if (!native) return null
		try { return messageFromUserInfo(await native.getInitialNotification()) } catch { return null }
	},
})

/** Contador del icono (iOS). Sin módulo no hace nada. */
export const setIosBadgeCount = (count: number): void => {
	try { getNative()?.setBadgeCount(count) } catch { /* sin módulo */ }
}
