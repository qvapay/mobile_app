/**
 * @jest-environment node
 *
 * La compra de energía de punta a punta, con el servidor y el disco de mentira (N-01).
 *
 * Lo que no puede pasar: que una compra que se quedó sin respuesta, y que el servidor SÍ
 * cobró, acabe en una segunda orden. El servidor de estos tests hace lo que el de verdad:
 * valida precio y proveedor ANTES de buscar la orden por clave.
 */
import React from 'react'
import { act, create } from 'react-test-renderer'

const mockStore = new Map()
jest.mock('@react-native-async-storage/async-storage', () => ({
	__esModule: true,
	default: {
		getItem: jest.fn(async key => (mockStore.has(key) ? mockStore.get(key) : null)),
		setItem: jest.fn(async (key, value) => { mockStore.set(key, value) }),
		removeItem: jest.fn(async key => { mockStore.delete(key) }),
	},
}))
jest.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => { } }) } }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }))
const mockUpdateUser = jest.fn()
let mockUser = { uuid: 'ana', balance: 10 }
jest.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser, updateUser: mockUpdateUser }) }))
jest.mock('./energyQueries', () => ({ ENERGY_ORDERS_KEY: ['energy', 'orders'] }))
jest.mock('./walletQueries', () => ({ WALLET_TRON_RESOURCES_KEY: ['wallet', 'tron-resources'] }))
jest.mock('../../home/homeQueries', () => ({ HOME_QUERY_KEY: ['home'] }))
jest.mock('../../../api/energyApi', () => ({ energyApi: { quote: jest.fn(), rent: jest.fn(), orders: jest.fn(), order: jest.fn() } }))

const { energyApi } = require('../../../api/energyApi')
const useEnergyRent = require('./useEnergyRent').default

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const settle = () => act(async () => { await sleep(20) })

const TARGET = 'TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy'
const ARGS = { targetAddress: TARGET, volume: 66_000, duration: '1h', estimatedUsd: 0.55, active: true }
const NOTE = '@qpenergy:pending:ana'

/**
 * El servidor: cobra y crea la orden en cuanto la petición pasa sus validaciones, conteste
 * o no. Con una clave ya usada devuelve esa orden… si la petición llega hasta ahí.
 */
const makeServer = () => {
	const server = {
		orders: [],
		/** Lo que la app oye de la próxima compra: 'ok' | 'lost' (cobra y no contesta) | 'provider' | 'price' */
		next: 'ok',
		/** Estado con el que nacen las órdenes. */
		status: 'completed',
		rentCalls: [],
		diskAtRent: [],
	}
	energyApi.rent.mockImplementation(async (input) => {
		server.rentCalls.push(input)
		server.diskAtRent.push(mockStore.get(NOTE) ?? null)
		const mode = server.next
		server.next = 'ok'
		// Antes de mirar la clave: el proveedor y el precio
		if (mode === 'provider') { return { success: false, error: 'Proveedor no disponible', details: { code: 'PROVIDER_UNAVAILABLE' }, status: 503 } }
		if (mode === 'price') { return { success: false, error: 'Precio por encima', details: { code: 'PRICE_ABOVE_MAX' }, status: 409 } }
		const existing = server.orders.find(order => order.key === input.idempotencyKey)
		if (existing) { return { success: true, data: { data: existing, duplicate: true }, status: 200 } }
		const order = {
			uuid: `order-${server.orders.length + 1}`, key: input.idempotencyKey, resource: 'energy', target_address: input.targetAddress,
			volume: input.volume, duration: input.duration, price_usd: 0.55, status: server.status, created_at: new Date().toISOString(),
		}
		server.orders.push(order)
		if (mode === 'lost') { return { success: false, error: 'timeout of 20000ms exceeded' } }
		return { success: true, data: { data: order, balance: 9.45 }, status: order.status === 'completed' ? 201 : 202 }
	})
	energyApi.orders.mockImplementation(async () => ({ success: true, data: { data: [...server.orders].reverse(), meta: { page: 1, take: 20, total: server.orders.length, last_page: 1 } }, status: 200 }))
	energyApi.order.mockImplementation(async (uuid) => ({ success: true, data: { data: server.orders.find(order => order.uuid === uuid) }, status: 200 }))
	return server
}

const Probe = ({ args, out }) => {
	out.rent = useEnergyRent(args)
	return null
}

const mount = async (args = ARGS) => {
	const out = {}
	let tree
	act(() => { tree = create(<Probe args={args} out={out} />) })
	await settle()
	return { out, rerender: async (next) => { act(() => { tree.update(<Probe args={next} out={out} />) }); await settle() }, unmount: () => act(() => { tree.unmount() }) }
}

const confirm = (out) => act(async () => { await out.rent.confirm(); await sleep(20) })

let server
let mounted
beforeEach(() => {
	mockStore.clear()
	jest.clearAllMocks()
	mockUser = { uuid: 'ana', balance: 10 }
	server = makeServer()
	mounted = null
})
afterEach(() => { mounted?.unmount() })

test('una compra normal: una orden, y nada pendiente en disco', async () => {
	mounted = await mount()
	await confirm(mounted.out)
	expect(mounted.out.rent.state).toMatchObject({ phase: 'done', charged: true, doubt: false })
	expect(server.orders).toHaveLength(1)
	expect(mockStore.has(NOTE)).toBe(false)
})

test('la clave y el pedido están en disco ANTES de que la compra salga', async () => {
	mounted = await mount()
	await confirm(mounted.out)
	const disk = JSON.parse(server.diskAtRent[0])
	expect(disk.attempt).toMatchObject({ key: server.rentCalls[0].idempotencyKey, params: { targetAddress: TARGET, volume: 66_000, duration: '1h' } })
})

// El camino del doble cobro: el servidor cobra, la respuesta se pierde, y el reintento topa
// con un rechazo que el servidor da ANTES de mirar la clave
test('cobrada sin respuesta + reintentos que topan con el proveedor y el precio: sigue siendo UNA orden', async () => {
	mounted = await mount()
	const { out } = mounted
	server.next = 'lost'
	await confirm(out)
	expect(out.rent.state).toMatchObject({ phase: 'failed', doubt: true })
	expect(server.orders).toHaveLength(1)
	const key = server.rentCalls[0].idempotencyKey

	// El historial aún no la enseña (pudo crearse después de mirar) y el reintento topa con el proveedor
	const hidden = server.orders
	energyApi.orders.mockResolvedValueOnce({ success: true, data: { data: [], meta: {} }, status: 200 })
	server.next = 'provider'
	await confirm(out)
	expect(out.rent.state).toMatchObject({ phase: 'failed', errorCode: 'PROVIDER_UNAVAILABLE', doubt: true })

	energyApi.orders.mockResolvedValueOnce({ success: false, error: 'sin red' })
	server.next = 'price'
	await confirm(out)
	expect(out.rent.state).toMatchObject({ phase: 'failed', errorCode: 'PRICE_ABOVE_MAX', doubt: true })

	// Tres peticiones, la MISMA clave: ninguna pudo crear una segunda orden
	expect(server.rentCalls.map(call => call.idempotencyKey)).toEqual([key, key, key])
	expect(JSON.parse(mockStore.get(NOTE)).attempt.key).toBe(key)

	// Y en cuanto el historial la enseña, se da por comprada sin mandar nada más
	await confirm(out)
	expect(server.rentCalls).toHaveLength(3)
	expect(hidden).toHaveLength(1)
	expect(out.rent.state).toMatchObject({ phase: 'done', charged: true, doubt: false })
	expect(out.rent.state.order.uuid).toBe('order-1')
	expect(mockStore.has(NOTE)).toBe(false)
})

test('si el historial no responde, el mismo pedido sale con su clave y el servidor devuelve la orden que ya había', async () => {
	mounted = await mount()
	const { out } = mounted
	server.next = 'lost'
	await confirm(out)
	energyApi.orders.mockResolvedValueOnce({ success: false, error: 'sin red' })
	await confirm(out)
	expect(server.orders).toHaveLength(1)
	expect(out.rent.state).toMatchObject({ phase: 'done', doubt: false })
	// El replay no trae saldo: no se descuenta a ciegas
	expect(mockUpdateUser).not.toHaveBeenCalled()
})

test('la app se cerró con la compra en vuelo: al volver, el mismo pedido usa la clave del disco', async () => {
	// Sesión anterior: la compra salió, el servidor cobró y la app murió sin oír nada
	const first = await mount()
	server.next = 'lost'
	await confirm(first.out)
	first.unmount()
	const key = server.rentCalls[0].idempotencyKey
	expect(JSON.parse(mockStore.get(NOTE)).attempt.key).toBe(key)

	// Sesión nueva, con el historial caído: lo que sale lleva la clave de antes
	energyApi.orders.mockResolvedValueOnce({ success: false, error: 'sin red' })
	mounted = await mount()
	expect(mounted.out.rent.state).toMatchObject({ doubt: true, key })
	await confirm(mounted.out)
	expect(server.rentCalls[1].idempotencyKey).toBe(key)
	expect(server.orders).toHaveLength(1)
	expect(mounted.out.rent.state.phase).toBe('done')
})

test('en duda y con OTRO pedido: si el anterior consta cobrado, se enseña ese y no se compra el nuevo', async () => {
	const onCharged = jest.fn()
	mounted = await mount({ ...ARGS, onCharged })
	const { out } = mounted
	server.status = 'dispatching'
	server.next = 'lost'
	await confirm(out)
	// La pantalla de enviar recalcula la energía que falta: el pedido cambia de volumen
	await mounted.rerender({ ...ARGS, volume: 70_000, onCharged })
	expect(out.rent.state).toMatchObject({ doubt: true })
	await confirm(out)
	expect(server.rentCalls).toHaveLength(1)
	expect(out.rent.state).toMatchObject({ phase: 'polling', charged: true })
	expect(out.rent.state.order).toMatchObject({ uuid: 'order-1', volume: 66_000 })
	expect(onCharged).toHaveBeenCalledTimes(1)
	// Cobrada y sin entregar: queda la nota de la orden, y el intento ya no está en duda
	expect(JSON.parse(mockStore.get(NOTE))).toMatchObject({ order: { uuid: 'order-1' }, attempt: null })
})

test('un rechazo que PRUEBA que no se cobró nada despeja la duda y borra el intento del disco', async () => {
	mounted = await mount()
	const { out } = mounted
	// La petición ni llegó: sin respuesta y sin orden
	energyApi.rent.mockResolvedValueOnce({ success: false, error: 'Network Error' })
	await confirm(out)
	expect(out.rent.state.doubt).toBe(true)
	expect(mockStore.has(NOTE)).toBe(true)
	energyApi.rent.mockResolvedValueOnce({ success: false, error: 'Saldo insuficiente', details: { code: 'INSUFFICIENT_BALANCE' }, status: 400 })
	await confirm(out)
	expect(out.rent.state).toMatchObject({ phase: 'failed', errorCode: 'INSUFFICIENT_BALANCE', doubt: false })
	await settle()
	expect(mockStore.has(NOTE)).toBe(false)
})

test('la nota es de la cuenta que paga: otra cuenta no hereda la duda', async () => {
	const first = await mount()
	server.next = 'lost'
	await confirm(first.out)
	first.unmount()
	mockUser = { uuid: 'beto', balance: 10 }
	mounted = await mount()
	expect(mounted.out.rent.state.doubt).toBe(false)
	expect(mockStore.has('@qpenergy:pending:beto')).toBe(false)
})
