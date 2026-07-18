/**
 * Unit tests for topupApi — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import { topupApi } from './topupApi'

const ok = (data, status = 200) => ({ data, status })
const apiError = (data, status = 422) => {
	const err = new Error('Request failed')
	err.response = { data, status }
	return err
}
const networkError = (message = 'Network Error') => {
	const err = new Error(message)
	err.response = undefined
	return err
}

beforeEach(() => jest.clearAllMocks())

describe('getTopupProducts', () => {

	test('fetches the backend availability catalog', async () => {
		const products = [{ productId: '100cuptopup', amountCUP: 100, available: true }]
		apiClient.get.mockResolvedValueOnce(ok({ products }))
		const result = await topupApi.getTopupProducts()
		expect(apiClient.get).toHaveBeenCalledWith('/topup/products')
		expect(result).toEqual({ success: true, data: { products }, status: 200 })
	})

	test('surfaces network errors as { success: false }', async () => {
		apiClient.get.mockRejectedValueOnce(networkError())
		const result = await topupApi.getTopupProducts()
		expect(result.success).toBe(false)
		expect(result.error).toBe('Network Error')
	})
})

describe('validateTopupReceipt', () => {

	const receiptData = {
		receipt: 'play-token-abc',
		platform: 'android',
		productId: '100cuptopup',
		transactionId: 'GPA.1234-5678-9012-34567',
		phoneNumber: '+5355123456',
	}

	test('posts the full receipt payload including phoneNumber', async () => {
		const topup = { id: 'topup_abc123', phoneNumber: '+5355123456', amountCUP: 100, status: 'completed' }
		apiClient.post.mockResolvedValueOnce(ok({ success: true, topup }))
		const result = await topupApi.validateTopupReceipt(receiptData)
		expect(apiClient.post).toHaveBeenCalledWith('/topup/validate-receipt', receiptData)
		expect(result).toEqual({ success: true, data: { success: true, topup }, status: 200 })
	})

	test('passes through a 202 pending response as success (caller must NOT consume)', async () => {
		apiClient.post.mockResolvedValueOnce(ok({ pending: true, topup: { id: 'topup_abc123', status: 'processing' } }, 202))
		const result = await topupApi.validateTopupReceipt(receiptData)
		expect(result.success).toBe(true)
		expect(result.status).toBe(202)
		expect(result.data.pending).toBe(true)
	})

	test('extracts the backend error message on API errors', async () => {
		apiClient.post.mockRejectedValueOnce(apiError({ error: 'Receipt ya procesado' }, 409))
		const result = await topupApi.validateTopupReceipt(receiptData)
		expect(result).toEqual({
			success: false,
			error: 'Receipt ya procesado',
			details: { error: 'Receipt ya procesado' },
			status: 409,
		})
	})

	test('falls back to `message` then to the generic Spanish error', async () => {
		apiClient.post.mockRejectedValueOnce(apiError({ message: 'Invalid receipt' }, 400))
		expect((await topupApi.validateTopupReceipt(receiptData)).error).toBe('Invalid receipt')

		apiClient.post.mockRejectedValueOnce(apiError({}, 400))
		expect((await topupApi.validateTopupReceipt(receiptData)).error).toBe('No se pudo validar la compra')
	})

	test('handles network errors without a response body', async () => {
		apiClient.post.mockRejectedValueOnce(networkError('timeout'))
		const result = await topupApi.validateTopupReceipt(receiptData)
		expect(result).toEqual({ success: false, error: 'timeout', status: undefined })
	})
})

describe('getTopupHistory', () => {

	test('fetches the user history', async () => {
		const topups = [{ id: 'topup_1', phoneNumber: '+5355123456', amountCUP: 100, status: 'completed' }]
		apiClient.get.mockResolvedValueOnce(ok({ topups }))
		const result = await topupApi.getTopupHistory()
		expect(apiClient.get).toHaveBeenCalledWith('/topup/history')
		expect(result).toEqual({ success: true, data: { topups }, status: 200 })
	})

	test('surfaces errors', async () => {
		apiClient.get.mockRejectedValueOnce(networkError())
		expect((await topupApi.getTopupHistory()).success).toBe(false)
	})
})

describe('getTopupStatus', () => {

	test('polls one top-up by id', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ topup: { id: 'topup_1', status: 'processing' } }))
		const result = await topupApi.getTopupStatus('topup_1')
		expect(apiClient.get).toHaveBeenCalledWith('/topup/topup_1/status')
		expect(result.data.topup.status).toBe('processing')
	})

	test('surfaces errors', async () => {
		apiClient.get.mockRejectedValueOnce(networkError())
		expect((await topupApi.getTopupStatus('topup_1')).success).toBe(false)
	})
})
