/**
 * Unit tests for api/payApi.js — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
import { payApi } from './payApi'
import { apiClient } from './client'

jest.mock('./client', () => ({
	apiClient: {
		get: jest.fn(),
		post: jest.fn(),
	},
}))

// Builds an axios-like error carrying a server response
const apiError = (status, data) => {
	const error = new Error(`Request failed with status code ${status}`)
	error.response = { status, data }
	return error
}

const networkError = () => new Error('Network Error')

beforeEach(() => {
	jest.clearAllMocks()
})

describe('payApi.payTransaction', () => {

	test('posts to the pay endpoint with the given comment', async () => {
		const paid = { uuid: 'tx-1', status: 'paid' }
		apiClient.post.mockResolvedValue({ data: paid, status: 200 })

		const result = await payApi.payTransaction('tx-1', 'loved')

		expect(apiClient.post).toHaveBeenCalledWith('/transaction/tx-1/pay', { comment: 'loved' })
		expect(result).toEqual({ success: true, data: paid, status: 200 })
	})

	test('defaults the comment to an empty string', async () => {
		apiClient.post.mockResolvedValue({ data: {}, status: 200 })

		await payApi.payTransaction('tx-1')

		expect(apiClient.post).toHaveBeenCalledWith('/transaction/tx-1/pay', { comment: '' })
	})

	test('returns the API error field on failure (e.g. insufficient balance)', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'Saldo insuficiente' }))

		const result = await payApi.payTransaction('tx-1')

		expect(result).toEqual({ success: false, error: 'Saldo insuficiente', status: 422 })
	})

	test('falls back to the message field when the error body has no error field', async () => {
		apiClient.post.mockRejectedValue(apiError(404, { message: 'Factura no encontrada' }))

		const result = await payApi.payTransaction('missing')

		expect(result).toEqual({ success: false, error: 'Factura no encontrada', status: 404 })
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.post.mockRejectedValue(networkError())

		const result = await payApi.payTransaction('tx-1')

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})
