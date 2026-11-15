/**
 * @jest-environment node
 *
 * La nota en disco del alquiler de energía: de la cuenta que paga, con dos casillas que no
 * se pisan (N-02). Antes era una sola nota global: la de una cuenta la leía la siguiente
 * que entrara en el teléfono.
 */
const mockStore = new Map()
jest.mock('@react-native-async-storage/async-storage', () => ({
	__esModule: true,
	default: {
		getItem: jest.fn(async key => (mockStore.has(key) ? mockStore.get(key) : null)),
		setItem: jest.fn(async (key, value) => { mockStore.set(key, value) }),
		removeItem: jest.fn(async key => { mockStore.delete(key) }),
	},
}))

const { clearPendingAttempt, clearPendingOrder, readPendingEnergy, savePendingAttempt, savePendingOrder } = require('./energyPending')

const PARAMS = { targetAddress: 'TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy', volume: 66_000, duration: '1h' }
const KEY = '1800000000000-abcdefgh-ijklmnop'
const NOW = 1_800_000_000_000

beforeEach(() => {
	mockStore.clear()
	jest.spyOn(Date, 'now').mockReturnValue(NOW)
})
afterEach(() => { jest.restoreAllMocks() })

test('cada cuenta tiene la suya: lo de una no lo lee otra', async () => {
	await savePendingOrder('ana', 'order-de-ana')
	expect(await readPendingEnergy('ana')).toEqual({ order: { uuid: 'order-de-ana', at: NOW }, attempt: null })
	expect(await readPendingEnergy('beto')).toEqual({ order: null, attempt: null })
	expect([...mockStore.keys()]).toEqual(['@qpenergy:pending:ana'])
})

test('sin cuenta no se lee ni se escribe nada', async () => {
	await savePendingOrder(null, 'order-1')
	await savePendingAttempt(undefined, { key: KEY, params: PARAMS, at: NOW })
	expect(mockStore.size).toBe(0)
	expect(await readPendingEnergy(null)).toEqual({ order: null, attempt: null })
})

test('el intento y la orden van en casillas distintas', async () => {
	await savePendingOrder('ana', 'order-lenta')
	await savePendingAttempt('ana', { key: KEY, params: PARAMS, at: NOW })
	expect(await readPendingEnergy('ana')).toEqual({ order: { uuid: 'order-lenta', at: NOW }, attempt: { key: KEY, params: PARAMS, at: NOW } })
	await clearPendingAttempt('ana')
	expect(await readPendingEnergy('ana')).toEqual({ order: { uuid: 'order-lenta', at: NOW }, attempt: null })
	await clearPendingOrder('ana')
	expect(mockStore.size).toBe(0)
})

test('con la orden conocida, el intento deja de estar en duda', async () => {
	await savePendingAttempt('ana', { key: KEY, params: PARAMS, at: NOW })
	await savePendingOrder('ana', 'order-1')
	expect(await readPendingEnergy('ana')).toEqual({ order: { uuid: 'order-1', at: NOW }, attempt: null })
})

test('las escrituras seguidas no se pisan aunque no se esperen', async () => {
	const first = savePendingAttempt('ana', { key: KEY, params: PARAMS, at: NOW })
	const second = clearPendingOrder('ana')
	const third = savePendingAttempt('ana', { key: `${KEY}2`, params: PARAMS, at: NOW })
	await Promise.all([first, second, third])
	expect((await readPendingEnergy('ana')).attempt.key).toBe(`${KEY}2`)
})

test('la nota global de una versión anterior pasa, una vez, a quien esté dentro', async () => {
	mockStore.set('@qpenergy:pending', JSON.stringify({ uuid: 'order-vieja', at: NOW - 1000 }))
	expect(await readPendingEnergy('ana')).toEqual({ order: { uuid: 'order-vieja', at: NOW - 1000 }, attempt: null })
	expect(mockStore.has('@qpenergy:pending')).toBe(false)
	expect(mockStore.has('@qpenergy:pending:ana')).toBe(true)
	// La siguiente cuenta ya no la ve
	expect(await readPendingEnergy('beto')).toEqual({ order: null, attempt: null })
})

test('lo caducado no cuenta', async () => {
	mockStore.set('@qpenergy:pending:ana', JSON.stringify({ order: { uuid: 'order-1', at: NOW - 25 * 3600_000 }, attempt: null }))
	expect(await readPendingEnergy('ana')).toEqual({ order: null, attempt: null })
})
