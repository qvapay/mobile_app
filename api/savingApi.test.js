/**
 * Unit tests for savingApi — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import { savingApi } from './savingApi'

const ok = (data, status = 200) => ({ data, status })
const apiError = (data, status = 422) => ({ response: { data, status } })

beforeEach(() => jest.clearAllMocks())

describe('getSummary', () => {

	test('unwraps a nested data.data payload', async () => {
		const summary = { balance: 120.5, total_earned: 3.2 }
		apiClient.get.mockResolvedValueOnce(ok({ data: summary }))
		const result = await savingApi.getSummary()
		expect(apiClient.get).toHaveBeenCalledWith('/saving')
		expect(result).toEqual({ success: true, data: summary, status: 200 })
	})

	test('returns a flat payload as-is', async () => {
		const summary = { balance: 0 }
		apiClient.get.mockResolvedValueOnce(ok(summary))
		const result = await savingApi.getSummary()
		expect(result).toEqual({ success: true, data: summary, status: 200 })
	})

	test('returns the API error on failure', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({ error: 'No autorizado' }, 403))
		const result = await savingApi.getSummary()
		expect(result).toEqual({
			success: false,
			error: 'No autorizado',
			details: { error: 'No autorizado' },
			status: 403,
		})
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({}, 500))
		const result = await savingApi.getSummary()
		expect(result.error).toBe('No se pudo obtener el resumen de ahorros')
	})

	test('returns the network error message when there is no response', async () => {
		apiClient.get.mockRejectedValueOnce(new Error('Network Error'))
		const result = await savingApi.getSummary()
		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})

	test('falls back to the generic network message when the error has no message', async () => {
		apiClient.get.mockRejectedValueOnce({})
		const result = await savingApi.getSummary()
		expect(result).toEqual({ success: false, error: 'Ha ocurrido un error de red', status: undefined })
	})
})

describe('updateRoundup', () => {

	test('posts the enabled flag', async () => {
		apiClient.post.mockResolvedValueOnce(ok({ roundup: true }))
		const result = await savingApi.updateRoundup(true)
		expect(apiClient.post).toHaveBeenCalledWith('/saving/roundup', { enabled: true })
		expect(result).toEqual({ success: true, data: { roundup: true }, status: 200 })
	})

	test('posts a disable request', async () => {
		apiClient.post.mockResolvedValueOnce(ok({ roundup: false }))
		await savingApi.updateRoundup(false)
		expect(apiClient.post).toHaveBeenCalledWith('/saving/roundup', { enabled: false })
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.post.mockRejectedValueOnce(apiError({}, 500))
		const result = await savingApi.updateRoundup(true)
		expect(result.error).toBe('No se pudo actualizar el ajuste de redondeo')
	})
})

describe('deposit', () => {

	test('posts the amount with an empty default description', async () => {
		apiClient.post.mockResolvedValueOnce(ok({ id: 1 }, 201))
		const result = await savingApi.deposit(50)
		expect(apiClient.post).toHaveBeenCalledWith('/saving/deposit', { amount: 50, description: '' })
		expect(result).toEqual({ success: true, data: { id: 1 }, status: 201 })
	})

	test('posts the amount with a custom description', async () => {
		apiClient.post.mockResolvedValueOnce(ok({ id: 2 }))
		await savingApi.deposit(25.5, 'Ahorro mensual')
		expect(apiClient.post).toHaveBeenCalledWith('/saving/deposit', { amount: 25.5, description: 'Ahorro mensual' })
	})

	test('prefers errorData.message when errorData.error is absent', async () => {
		apiClient.post.mockRejectedValueOnce(apiError({ message: 'Saldo insuficiente' }, 422))
		const result = await savingApi.deposit(9999)
		expect(result.success).toBe(false)
		expect(result.error).toBe('Saldo insuficiente')
		expect(result.status).toBe(422)
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.post.mockRejectedValueOnce(apiError({}, 500))
		const result = await savingApi.deposit(10)
		expect(result.error).toBe('No se pudo realizar el depósito')
	})
})

describe('withdraw', () => {

	test('posts the amount with an empty default description', async () => {
		apiClient.post.mockResolvedValueOnce(ok({ id: 3 }))
		const result = await savingApi.withdraw(30)
		expect(apiClient.post).toHaveBeenCalledWith('/saving/withdraw', { amount: 30, description: '' })
		expect(result).toEqual({ success: true, data: { id: 3 }, status: 200 })
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.post.mockRejectedValueOnce(apiError({}, 500))
		const result = await savingApi.withdraw(30)
		expect(result.error).toBe('No se pudo realizar el retiro')
	})

	test('returns the network error message when there is no response', async () => {
		apiClient.post.mockRejectedValueOnce(new Error('timeout of 20000ms exceeded'))
		const result = await savingApi.withdraw(30)
		expect(result).toEqual({ success: false, error: 'timeout of 20000ms exceeded', status: undefined })
	})
})

describe('getTransactions', () => {

	test('fetches with the default limit and offset', async () => {
		apiClient.get.mockResolvedValueOnce(ok([{ id: 1 }]))
		const result = await savingApi.getTransactions()
		expect(apiClient.get).toHaveBeenCalledWith('/saving/transactions?limit=50&offset=0')
		expect(result).toEqual({ success: true, data: [{ id: 1 }], status: 200 })
	})

	test('fetches with custom pagination and unwraps nested data', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ data: [{ id: 2 }] }))
		const result = await savingApi.getTransactions(10, 20)
		expect(apiClient.get).toHaveBeenCalledWith('/saving/transactions?limit=10&offset=20')
		expect(result.data).toEqual([{ id: 2 }])
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({}, 500))
		const result = await savingApi.getTransactions()
		expect(result.error).toBe('No se pudieron obtener las transacciones')
	})
})

describe('getEarnings', () => {

	test('fetches with the default limit and offset', async () => {
		apiClient.get.mockResolvedValueOnce(ok([{ id: 1, amount: 0.5 }]))
		const result = await savingApi.getEarnings()
		expect(apiClient.get).toHaveBeenCalledWith('/saving/earnings?limit=12&offset=0')
		expect(result).toEqual({ success: true, data: [{ id: 1, amount: 0.5 }], status: 200 })
	})

	test('fetches with custom pagination and unwraps nested data', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ data: [{ id: 9 }] }))
		const result = await savingApi.getEarnings(6, 12)
		expect(apiClient.get).toHaveBeenCalledWith('/saving/earnings?limit=6&offset=12')
		expect(result.data).toEqual([{ id: 9 }])
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({}, 500))
		const result = await savingApi.getEarnings()
		expect(result.error).toBe('No se pudieron obtener las ganancias')
	})
})
