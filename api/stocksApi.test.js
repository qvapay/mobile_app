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

describe('index', () => {

	test('fetches quotes for all tracked stocks', async () => {
		const stocks = [{ symbol: 'AAPL', price: 210.4 }, { symbol: 'GOOGL', price: 180.1 }]
		apiClient.get.mockResolvedValueOnce(ok(stocks))
		const result = await stocksApi.index()
		expect(apiClient.get).toHaveBeenCalledWith('/stocks/index')
		expect(result).toEqual({ success: true, data: stocks, status: 200 })
	})

	test('returns the API error on failure (no details key in this module)', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({ error: 'Mercado cerrado' }, 503))
		const result = await stocksApi.index()
		expect(result).toEqual({ success: false, error: 'Mercado cerrado', status: 503 })
	})

	test('ignores errorData.message and uses the fallback (documents missing .message fallback)', async () => {
		// Unlike other modules, stocksApi only reads errorData.error — a
		// backend payload with only { message } falls through to the fallback.
		apiClient.get.mockRejectedValueOnce(apiError({ message: 'Rate limited' }, 429))
		const result = await stocksApi.index()
		expect(result.error).toBe('No se pudieron obtener las acciones')
	})

	test('returns the network error message when there is no response', async () => {
		apiClient.get.mockRejectedValueOnce(new Error('Network Error'))
		const result = await stocksApi.index()
		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})

	test('falls back to the generic network message when the error has no message', async () => {
		apiClient.get.mockRejectedValueOnce({})
		const result = await stocksApi.index()
		expect(result).toEqual({ success: false, error: 'Ha ocurrido un error de red', status: undefined })
	})
})

describe('show', () => {

	test('fetches the extended quote for one ticker', async () => {
		const quote = { symbol: 'AAPL', price: 210.4, sector: 'Technology' }
		apiClient.get.mockResolvedValueOnce(ok(quote))
		const result = await stocksApi.show('AAPL')
		expect(apiClient.get).toHaveBeenCalledWith('/stocks/AAPL?type=quote')
		expect(result).toEqual({ success: true, data: quote, status: 200 })
	})

	test('returns the API error on failure', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({ error: 'Ticker no encontrado' }, 404))
		const result = await stocksApi.show('NOPE')
		expect(result).toEqual({ success: false, error: 'Ticker no encontrado', status: 404 })
	})

	test('falls back to the Spanish message on API error without an error field', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({}, 500))
		const result = await stocksApi.show('AAPL')
		expect(result.error).toBe('No se pudo obtener la cotización')
	})
})

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
