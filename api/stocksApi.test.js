/**
 * Unit tests for stocksApi — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import { stocksApi } from './stocksApi'

const ok = (data, status = 200) => ({ data, status })
const apiError = (data, status = 422) => ({ response: { data, status } })

beforeEach(() => jest.clearAllMocks())

describe('priceHistory', () => {

	test('fetches history with the default 24H timeframe', async () => {
		const points = [{ time: 1, value: 200 }]
		apiClient.get.mockResolvedValueOnce(ok(points))
		const result = await stocksApi.priceHistory('AAPL')
		expect(apiClient.get).toHaveBeenCalledWith('/stocks/AAPL?timeframe=24H')
		expect(result).toEqual({ success: true, data: points, status: 200 })
	})

	test('fetches history with a custom timeframe', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await stocksApi.priceHistory('GOOGL', '1Y')
		expect(apiClient.get).toHaveBeenCalledWith('/stocks/GOOGL?timeframe=1Y')
	})

	test('falls back to the Spanish message on API error without an error field', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({}, 500))
		const result = await stocksApi.priceHistory('AAPL', '1W')
		expect(result.error).toBe('No se pudo obtener el historial')
	})

	test('returns the network error message when there is no response', async () => {
		apiClient.get.mockRejectedValueOnce(new Error('timeout of 20000ms exceeded'))
		const result = await stocksApi.priceHistory('AAPL')
		expect(result).toEqual({ success: false, error: 'timeout of 20000ms exceeded', status: undefined })
	})
})
