/**
 * Ciclo de vida del registro del token: coalescing de syncs, logout en medio
 * de un sync, tope del DELETE y re-registro al cambiar de idioma. Todo lo
 * nativo va mockeado; AsyncStorage es el mock en memoria de jest.setup.js.
 * @jest-environment node
 */
const appStateListeners = []
jest.mock('react-native', () => ({
	AppState: { addEventListener: jest.fn((_, handler) => { appStateListeners.push(handler); return { remove: jest.fn() } }) },
	Linking: { openSettings: jest.fn() },
	Platform: { OS: 'ios' },
}))
jest.mock('react-native-device-info', () => ({
	__esModule: true,
	default: { getVersion: () => '3.6.1', getSystemVersion: () => '26.0', getModel: () => 'iPhone' },
}))
jest.mock('../api/client', () => ({ getAuthToken: jest.fn() }))
jest.mock('../api/pushApi', () => ({ pushApi: { registerToken: jest.fn(), deleteToken: jest.fn(), sendEvent: jest.fn() } }))
jest.mock('./deviceId', () => ({ getPushDeviceId: jest.fn(async () => 'device-1') }))
const mockTransport = {
	getPermission: jest.fn(),
	requestPermission: jest.fn(),
	getToken: jest.fn(),
	onTokenRefresh: jest.fn(),
	onMessage: jest.fn(),
	onOpened: jest.fn(),
	getInitialMessage: jest.fn(),
}
jest.mock('./transport', () => ({ getTransport: () => mockTransport }))

import AsyncStorage from '@react-native-async-storage/async-storage'
import i18n from '../i18n'
import { getAuthToken } from '../api/client'
import { pushApi } from '../api/pushApi'
import { initPush, syncPushToken, unregisterPush } from './index'

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

beforeEach(async () => {
	jest.clearAllMocks()
	await AsyncStorage.clear()
	getAuthToken.mockResolvedValue('bearer')
	mockTransport.getPermission.mockResolvedValue('granted')
	mockTransport.getToken.mockResolvedValue({ token: 'tok-1', provider: 'apns', apnsEnv: 'sandbox' })
	pushApi.registerToken.mockResolvedValue({ success: true, data: {} })
	pushApi.deleteToken.mockResolvedValue({ success: true, data: { revoked: 1 } })
})

afterEach(async () => {
	// Deja el módulo sin usuario para la siguiente prueba
	await unregisterPush()
	await i18n.changeLanguage('es')
})

test('a plain sync registers once and the fingerprint makes the next one a no-op', async () => {
	await syncPushToken('u-1')
	await syncPushToken('u-1')
	expect(pushApi.registerToken).toHaveBeenCalledTimes(1)
	expect(pushApi.registerToken.mock.calls[0][0]).toMatchObject({ token: 'tok-1', platform: 'ios', device_id: 'device-1', apns_environment: 'sandbox', locale: 'es' })
})

// El prompt concede el permiso mientras el sync del login aún espera la
// respuesta del sistema: el `force` no puede reutilizar ese sync, que va a
// salir por «sin permiso», sino correr detrás
test('a forced sync queued behind an in-flight one still registers', async () => {
	const permission = deferred()
	mockTransport.getPermission.mockReturnValueOnce(permission.promise)
	const first = syncPushToken('u-1')
	const forced = syncPushToken('u-1', { force: true })
	permission.resolve('undetermined')
	await first
	await forced
	expect(pushApi.registerToken).toHaveBeenCalledTimes(1)
})

test('a logout during an in-flight sync cancels the registration', async () => {
	const token = deferred()
	mockTransport.getToken.mockReturnValueOnce(token.promise)
	const sync = syncPushToken('u-1')
	await tick()
	await unregisterPush()
	token.resolve({ token: 'tok-1', provider: 'apns' })
	await sync
	expect(pushApi.registerToken).not.toHaveBeenCalled()
	expect(pushApi.deleteToken).toHaveBeenCalledWith('device-1')
})

test('switching users while a sync is in flight registers the new user, not the old one', async () => {
	const token = deferred()
	mockTransport.getToken.mockReturnValueOnce(token.promise)
	const first = syncPushToken('u-1')
	const second = syncPushToken('u-2')
	token.resolve({ token: 'tok-1', provider: 'apns' })
	await first
	await second
	expect(pushApi.registerToken).toHaveBeenCalledTimes(1)
	const stored = JSON.parse(await AsyncStorage.getItem('@qppush:registration'))
	expect(stored.fingerprint).toContain('u-2')
})

test('unregisterPush never waits longer than its timeout for the DELETE', async () => {
	jest.useFakeTimers()
	try {
		pushApi.deleteToken.mockReturnValue(new Promise(() => {}))
		let settled = false
		const done = unregisterPush().then(() => { settled = true })
		await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
		jest.advanceTimersByTime(4000)
		await done
		expect(settled).toBe(true)
	} finally {
		jest.useRealTimers()
	}
})

test('changing the language re-registers with the new locale', async () => {
	initPush()
	await syncPushToken('u-1')
	expect(pushApi.registerToken).toHaveBeenCalledTimes(1)
	await i18n.changeLanguage('en')
	await tick(); await tick(); await tick()
	expect(pushApi.registerToken).toHaveBeenCalledTimes(2)
	expect(pushApi.registerToken.mock.calls[1][0].locale).toBe('en')
})
