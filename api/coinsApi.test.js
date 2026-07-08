/**
 * Unit tests for coinsApi — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import coinsApiDefault, { coinsApi } from './coinsApi'

const ok = (data, status = 200) => ({ data, status })
const apiError = (data, status = 422) => ({ response: { data, status } })

beforeEach(() => jest.clearAllMocks())

test('default export is the same object as the named export', () => {
	expect(coinsApiDefault).toBe(coinsApi)
})

describe('index', () => {

	test('fetches all coins without filters', async () => {
		const coins = [{ tick: 'BTC' }, { tick: 'ETH' }]
		apiClient.get.mockResolvedValueOnce(ok(coins))
		const result = await coinsApi.index()
		expect(apiClient.get).toHaveBeenCalledWith('/coins/v2')
		expect(result).toEqual({ success: true, data: coins, status: 200 })
	})

	test('serializes boolean filters as strings in the query', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await coinsApi.index({ enabled_in: true })
		expect(apiClient.get).toHaveBeenCalledWith('/coins/v2?enabled_in=true')
	})

	test('serializes multiple filters preserving insertion order', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await coinsApi.index({ enabled_out: true, enabled_p2p: false })
		expect(apiClient.get).toHaveBeenCalledWith('/coins/v2?enabled_out=true&enabled_p2p=false')
	})

	test('skips undefined and null filter values', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await coinsApi.index({ enabled_in: undefined, enabled_out: null })
		expect(apiClient.get).toHaveBeenCalledWith('/coins/v2')
	})

	test('returns the API error on failure', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({ error: 'Servicio no disponible' }, 503))
		const result = await coinsApi.index()
		expect(result).toEqual({
			success: false,
			error: 'Servicio no disponible',
			details: { error: 'Servicio no disponible' },
			status: 503,
		})
	})

	test('prefers errorData.message when errorData.error is absent', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({ message: 'Demasiadas peticiones' }, 429))
		const result = await coinsApi.index()
		expect(result.error).toBe('Demasiadas peticiones')
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({}, 500))
		const result = await coinsApi.index()
		expect(result.error).toBe('No se pudieron obtener las monedas')
	})

	test('returns the network error message when there is no response', async () => {
		apiClient.get.mockRejectedValueOnce(new Error('Network Error'))
		const result = await coinsApi.index()
		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})

	test('falls back to the generic network message when the error has no message', async () => {
		apiClient.get.mockRejectedValueOnce({})
		const result = await coinsApi.index()
		expect(result).toEqual({ success: false, error: 'Ha ocurrido un error de red', status: undefined })
	})
})

describe('priceHistory', () => {

	test('fetches history with the default 24H timeframe', async () => {
		const points = [{ time: 1, value: 65000 }]
		apiClient.get.mockResolvedValueOnce(ok(points))
		const result = await coinsApi.priceHistory('BTC')
		expect(apiClient.get).toHaveBeenCalledWith('/coins/price-history/BTC?timeframe=24H')
		expect(result).toEqual({ success: true, data: points, status: 200 })
	})

	test('fetches history with a custom timeframe', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await coinsApi.priceHistory('ETH', '7D')
		expect(apiClient.get).toHaveBeenCalledWith('/coins/price-history/ETH?timeframe=7D')
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({}, 500))
		const result = await coinsApi.priceHistory('BTC')
		expect(result.error).toBe('No se pudo obtener el historial de precios')
	})

	test('returns the network error message when there is no response', async () => {
		apiClient.get.mockRejectedValueOnce(new Error('timeout of 20000ms exceeded'))
		const result = await coinsApi.priceHistory('BTC')
		expect(result).toEqual({ success: false, error: 'timeout of 20000ms exceeded', status: undefined })
	})
})
