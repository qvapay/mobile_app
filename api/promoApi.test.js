/**
 * Unit tests for promoApi — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import { promoApi } from './promoApi'

beforeEach(() => jest.clearAllMocks())

describe('getPromo', () => {

	test('fetches the promo silently and unwraps a nested data.data payload', async () => {
		const promo = { id: 1, title: 'Promo de verano' }
		apiClient.get.mockResolvedValueOnce({ data: { data: promo }, status: 200 })
		const result = await promoApi.getPromo()
		expect(apiClient.get).toHaveBeenCalledWith('/promo', { silent: true })
		expect(result).toEqual({ success: true, data: promo })
	})

	test('returns a flat payload as-is (no status key in this module)', async () => {
		const promo = { id: 2, title: 'Sin anidar' }
		apiClient.get.mockResolvedValueOnce({ data: promo, status: 200 })
		const result = await promoApi.getPromo()
		expect(result).toEqual({ success: true, data: promo })
	})

	test('never rejects: resolves with null data and the error message on failure', async () => {
		apiClient.get.mockRejectedValueOnce(new Error('Network Error'))
		const result = await promoApi.getPromo()
		expect(result).toEqual({ success: false, error: 'Network Error', data: null })
	})

	test('uses error.message even for API errors with a response (documents missing response.data handling)', async () => {
		// Unlike other modules, promoApi never inspects error.response.data —
		// an axios HTTP error surfaces its generic message, not the backend's.
		const err = new Error('Request failed with status code 500')
		err.response = { data: { error: 'Promo caducada' }, status: 500 }
		apiClient.get.mockRejectedValueOnce(err)
		const result = await promoApi.getPromo()
		expect(result).toEqual({ success: false, error: 'Request failed with status code 500', data: null })
	})

	test('falls back to the Spanish message when the error has no message', async () => {
		apiClient.get.mockRejectedValueOnce({})
		const result = await promoApi.getPromo()
		expect(result).toEqual({ success: false, error: 'No se pudo obtener la promoción', data: null })
	})
})
