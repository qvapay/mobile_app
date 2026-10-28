/**
 * Cola de eventos de entrega: se guarda en disco, sale en orden con el cuerpo
 * `{ did, event }` de qpweb y conserva lo que falló por red. AsyncStorage
 * viene del mock en memoria de jest.setup.js.
 * @jest-environment node
 */
jest.mock('../api/pushApi', () => ({ pushApi: { sendEvent: jest.fn() } }))
jest.mock('../api/client', () => ({ getAuthToken: jest.fn() }))

import AsyncStorage from '@react-native-async-storage/async-storage'
import { pushApi } from '../api/pushApi'
import { getAuthToken } from '../api/client'
import { flushPushEvents, trackPushEvent, MAX_QUEUED_EVENTS, isRetryableFailure, DID_PATTERN } from './events'

const QUEUE_KEY = '@qppush:events'
const queued = async () => JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) || '[]')

beforeEach(async () => {
	jest.clearAllMocks()
	await AsyncStorage.clear()
	getAuthToken.mockResolvedValue('token')
	pushApi.sendEvent.mockResolvedValue({ success: true })
})

test('trackPushEvent sends exactly { did, event } and leaves the queue empty on success', async () => {
	await trackPushEvent('8412', 'opened')
	await flushPushEvents()
	expect(pushApi.sendEvent).toHaveBeenCalledWith({ did: '8412', event: 'opened' })
	expect(await queued()).toEqual([])
})

test('without a valid numeric did nothing is queued', async () => {
	await trackPushEvent(undefined, 'received')
	await trackPushEvent(null, 'received')
	await trackPushEvent('', 'received')
	await trackPushEvent('abc-123', 'received')
	await trackPushEvent('1'.repeat(20), 'received')
	expect(pushApi.sendEvent).not.toHaveBeenCalled()
	expect(await queued()).toEqual([])
	expect(DID_PATTERN.test('1')).toBe(true)
	expect(DID_PATTERN.test('1'.repeat(19))).toBe(true)
})

test('a network failure keeps the event (and the ones after it) for later', async () => {
	pushApi.sendEvent.mockResolvedValue({ success: false, status: undefined })
	await trackPushEvent('1', 'received')
	await trackPushEvent('2', 'opened')
	await flushPushEvents()
	expect((await queued()).map(e => e.did)).toEqual(['1', '2'])

	pushApi.sendEvent.mockResolvedValue({ success: true })
	await flushPushEvents()
	expect(await queued()).toEqual([])
	expect(pushApi.sendEvent).toHaveBeenLastCalledWith({ did: '2', event: 'opened' })
})

test('a 4xx rejection drops the event instead of retrying forever', async () => {
	pushApi.sendEvent.mockResolvedValueOnce({ success: false, status: 422 }).mockResolvedValue({ success: true })
	await trackPushEvent('7', 'opened')
	await trackPushEvent('8', 'opened')
	await flushPushEvents()
	expect(await queued()).toEqual([])
	expect(pushApi.sendEvent).toHaveBeenCalledTimes(2)
})

test('nothing is sent without a session, and the queue survives', async () => {
	getAuthToken.mockResolvedValue(null)
	await trackPushEvent('1', 'opened')
	await flushPushEvents()
	expect(pushApi.sendEvent).not.toHaveBeenCalled()
	expect((await queued()).map(e => e.did)).toEqual(['1'])
})

test('entries from an older queue format are ignored', async () => {
	await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([{ deliveryId: 'd-1', event: 'opened', at: 'x' }, { did: '5', event: 'received', at: 'y' }]))
	await flushPushEvents()
	expect(pushApi.sendEvent).toHaveBeenCalledTimes(1)
	expect(pushApi.sendEvent).toHaveBeenCalledWith({ did: '5', event: 'received' })
	expect(await queued()).toEqual([])
})

test('the queue is capped', async () => {
	getAuthToken.mockResolvedValue(null)
	for (let i = 0; i < MAX_QUEUED_EVENTS + 5; i += 1) await trackPushEvent(String(i), 'received')
	const queue = await queued()
	expect(queue).toHaveLength(MAX_QUEUED_EVENTS)
	expect(queue[0].did).toBe('5')
})

test('isRetryableFailure: network, 5xx and 429 retry; other 4xx do not', () => {
	expect(isRetryableFailure(undefined)).toBe(true)
	expect(isRetryableFailure(503)).toBe(true)
	expect(isRetryableFailure(429)).toBe(true)
	expect(isRetryableFailure(401)).toBe(false)
	expect(isRetryableFailure(422)).toBe(false)
})

// Dos `track` a la vez (p. ej. `received` y `opened` de la misma push) y un
// `track` que cae mientras el flush reescribe la cola: nada se pierde
test('concurrent tracks and a flush rewrite never drop an event', async () => {
	getAuthToken.mockResolvedValue(null)
	await Promise.all([trackPushEvent('1', 'received'), trackPushEvent('1', 'opened'), trackPushEvent('2', 'received')])
	expect((await queued()).map(e => `${e.did}:${e.event}`)).toEqual(['1:received', '1:opened', '2:received'])

	getAuthToken.mockResolvedValue('token')
	let release
	pushApi.sendEvent.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
	const flush = flushPushEvents()
	await new Promise(r => setImmediate(r))
	const late = trackPushEvent('3', 'opened')
	release({ success: true })
	await Promise.all([flush, late])
	// `late` encadenó un segundo flush detrás del primero: se espera a que salga
	await flushPushEvents()
	expect(pushApi.sendEvent.mock.calls.map(([body]) => `${body.did}:${body.event}`)).toEqual(['1:received', '1:opened', '2:received', '3:opened'])
	expect(await queued()).toEqual([])
})
