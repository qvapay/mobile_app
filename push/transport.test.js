/**
 * Normalización de payloads (común) y el transporte de iOS sin módulo nativo
 * (degrada a "sin permiso / sin token" en vez de lanzar).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	Platform: { OS: 'ios' },
	NativeEventEmitter: jest.fn(),
	NativeModules: {},
	TurboModuleRegistry: { get: jest.fn(() => null) },
}))

import { normalizePushData } from './transport'
import { createIosTransport, messageFromUserInfo } from './iosTransport'

describe('normalizePushData', () => {
	test('keeps strings, stringifies scalars and objects, drops aps and empties', () => {
		expect(normalizePushData({ aps: { alert: 'x' }, did: 'd-1', n: 3, ok: true, nested: { a: 1 }, none: null, undef: undefined }))
			.toEqual({ did: 'd-1', n: '3', ok: 'true', nested: '{"a":1}' })
	})

	test('non-objects become an empty payload', () => {
		expect(normalizePushData(null)).toEqual({})
		expect(normalizePushData('x')).toEqual({})
	})
})

describe('messageFromUserInfo', () => {
	test('reads title/body from aps.alert (object or string) and data from the root', () => {
		expect(messageFromUserInfo({ aps: { alert: { title: 'Pago', body: '+$5' } }, type: 'transfer_received', did: 'd-1' }))
			.toEqual({ title: 'Pago', body: '+$5', data: { type: 'transfer_received', did: 'd-1' } })
		expect(messageFromUserInfo({ aps: { alert: 'Hola' }, type: 'promo' }))
			.toEqual({ title: undefined, body: 'Hola', data: { type: 'promo' } })
		expect(messageFromUserInfo(null)).toBeNull()
	})
})

describe('iOS transport without the native module', () => {
	const transport = createIosTransport()
	test('degrades instead of throwing', async () => {
		await expect(transport.getPermission()).resolves.toBe('undetermined')
		await expect(transport.requestPermission()).resolves.toBe('blocked')
		await expect(transport.getToken()).resolves.toBeNull()
		await expect(transport.getInitialMessage()).resolves.toBeNull()
		expect(typeof transport.onMessage(() => {})).toBe('function')
	})
})
