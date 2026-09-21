/**
 * Unit tests for api/energyApi.ts — node environment with ./client mocked.
 * @jest-environment node
 */
import { energyApi } from './energyApi'
import { apiClient } from './client'
import { isDuplicateInFlight } from '../helpers/idempotency'

jest.mock('./client', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }))

const apiError = (status, data) => { const error = new Error(`Request failed with status code ${status}`); error.response = { status, data }; return error }

const RENT = { targetAddress: 'TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy', volume: 66000, duration: '1h', idempotencyKey: 'k-12345678' }

beforeEach(() => { jest.clearAllMocks() })

describe('energyApi.prices', () => {

	test('no enciende la barra de carga global (es un dato de fondo)', async () => {
		apiClient.get.mockResolvedValue({ data: { data: [], meta: {} }, status: 200 })
		await energyApi.prices()
		expect(apiClient.get).toHaveBeenCalledWith('/v2/energy/prices', { silent: true })
	})

	test('el 503 del proveedor llega con su código: es la señal de disponibilidad', async () => {
		apiClient.get.mockRejectedValue(apiError(503, { error: 'no disponible', code: 'PROVIDER_UNAVAILABLE' }))
		const result = await energyApi.prices()
		expect(result).toMatchObject({ success: false, status: 503, details: { code: 'PROVIDER_UNAVAILABLE' } })
	})
})

describe('energyApi.rent', () => {

	test('manda la clave de idempotencia y el techo de precio en snake_case', async () => {
		apiClient.post.mockResolvedValue({ data: { data: { uuid: 'o1', status: 'completed' }, balance: 41.2 }, status: 201 })
		const result = await energyApi.rent({ ...RENT, quoteId: 'q1', maxPriceUsd: 0.57 })
		expect(apiClient.post).toHaveBeenCalledWith('/v2/energy/rent', {
			target_address: RENT.targetAddress, volume: 66000, duration: '1h',
			idempotency_key: 'k-12345678', quote_id: 'q1', max_price_usd: 0.57,
		})
		expect(result).toMatchObject({ success: true, status: 201, data: { balance: 41.2 } })
	})

	test('omite cotización y techo cuando no se dan', async () => {
		apiClient.post.mockResolvedValue({ data: { data: { uuid: 'o1' } }, status: 202 })
		await energyApi.rent(RENT)
		expect(apiClient.post).toHaveBeenCalledWith('/v2/energy/rent', {
			target_address: RENT.targetAddress, volume: 66000, duration: '1h', idempotency_key: 'k-12345678',
		})
	})

	test('el replay de una clave usada es éxito; el 409 en vuelo se reconoce', async () => {
		apiClient.post.mockResolvedValue({ data: { data: { uuid: 'o1' }, duplicate: true }, status: 200 })
		const replay = await energyApi.rent(RENT)
		expect(replay.success).toBe(true)
		expect(replay.data.duplicate).toBe(true)

		apiClient.post.mockRejectedValue(apiError(409, { error: 'en proceso', code: 'DUPLICATE_REQUEST' }))
		const inFlight = await energyApi.rent(RENT)
		expect(isDuplicateInFlight(inFlight)).toBe(true)
	})

	test('el 502 conserva el código: el saldo ya fue devuelto y el copy lo dice', async () => {
		apiClient.post.mockRejectedValue(apiError(502, { error: 'no entregada', code: 'DELIVERY_FAILED' }))
		const result = await energyApi.rent(RENT)
		expect(result).toMatchObject({ success: false, status: 502, details: { code: 'DELIVERY_FAILED' } })
	})

	test('el 403 del tope diario trae lo que queda', async () => {
		apiClient.post.mockRejectedValue(apiError(403, { error: 'límite', code: 'LIMIT_EXCEEDED', remaining: { daily: 12.5 } }))
		const result = await energyApi.rent(RENT)
		expect(result.details.remaining.daily).toBe(12.5)
	})

	test('fallo de red: sin status', async () => {
		apiClient.post.mockRejectedValue(new Error('Network Error'))
		const result = await energyApi.rent(RENT)
		expect(result).toMatchObject({ success: false, error: 'Network Error' })
		expect(result.status).toBeUndefined()
	})
})

describe('energyApi.quote y órdenes', () => {

	test('quote manda volumen y duración', async () => {
		apiClient.post.mockResolvedValue({ data: { data: { quote_id: 'q1' } }, status: 200 })
		await energyApi.quote(132000, '1d')
		expect(apiClient.post).toHaveBeenCalledWith('/v2/energy/quote', { volume: 132000, duration: '1d' })
	})

	test('orders pagina y filtra por estado', async () => {
		apiClient.get.mockResolvedValue({ data: { data: [], meta: { page: 2, last_page: 3 } }, status: 200 })
		await energyApi.orders({ page: 2, status: 'completed' })
		expect(apiClient.get).toHaveBeenCalledWith('/v2/energy/orders?page=2&status=completed', { silent: true })
	})

	test('orders sin argumentos pide la primera página', async () => {
		apiClient.get.mockResolvedValue({ data: { data: [], meta: {} }, status: 200 })
		await energyApi.orders()
		expect(apiClient.get).toHaveBeenCalledWith('/v2/energy/orders?page=1', { silent: true })
	})

	test('order consulta una orden concreta', async () => {
		apiClient.get.mockResolvedValue({ data: { data: { uuid: 'o1', status: 'dispatching' } }, status: 200 })
		const result = await energyApi.order('o1')
		expect(apiClient.get).toHaveBeenCalledWith('/v2/energy/orders/o1', { silent: true })
		expect(result.data.data.status).toBe('dispatching')
	})
})
