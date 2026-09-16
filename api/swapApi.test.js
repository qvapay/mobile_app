/**
 * Unit tests for api/swapApi.ts — node environment with ./client mocked.
 * @jest-environment node
 */
import { swapApi } from './swapApi'
import { apiClient } from './client'
import { isDuplicateInFlight } from '../helpers/idempotency'

jest.mock('./client', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }))

const apiError = (status, data) => { const error = new Error(`Request failed with status code ${status}`); error.response = { status, data }; return error }

beforeEach(() => { jest.clearAllMocks() })

describe('swapApi.create', () => {
	test('OUT: pin como string, to_address e idempotency_key; 201 → data + balance', async () => {
		apiClient.post.mockResolvedValue({ data: { data: { uuid: 'u1', status: 'pending' }, balance: 95 }, status: 201 })
		const result = await swapApi.create({ direction: 'out', pair: 'QVAPAY:QUSD_STACKS', amount: '5.00', toAddress: 'SPUSER', pin: 1234, idempotencyKey: 'k-12345678' })
		expect(apiClient.post).toHaveBeenCalledWith('/swap', { pair: 'QVAPAY:QUSD_STACKS', direction: 'out', amount: 5, to_address: 'SPUSER', pin: '1234', idempotency_key: 'k-12345678' })
		expect(result).toEqual({ success: true, data: { data: { uuid: 'u1', status: 'pending' }, balance: 95 }, status: 201 })
	})

	test('IN: signed_tx y asset del par, sin PIN', async () => {
		apiClient.post.mockResolvedValue({ data: { data: { uuid: 'u2', status: 'pending' } }, status: 201 })
		await swapApi.create({ direction: 'in', pair: 'QVAPAY:QUSD_STACKS', amount: 5, signedTx: 'deadbeef', asset: 'SP1.QUSD::QUSD', idempotencyKey: 'k-12345678' })
		expect(apiClient.post).toHaveBeenCalledWith('/swap', { pair: 'QVAPAY:QUSD_STACKS', direction: 'in', amount: 5, signed_tx: 'deadbeef', asset: 'SP1.QUSD::QUSD', idempotency_key: 'k-12345678' })
	})

	test('replay 200 duplicate:true es éxito; 409 DUPLICATE_REQUEST se reconoce como en vuelo', async () => {
		apiClient.post.mockResolvedValue({ data: { data: { uuid: 'u1' }, duplicate: true }, status: 200 })
		const replay = await swapApi.create({ direction: 'out', pair: 'p', amount: 1, toAddress: 'SP', pin: '1', idempotencyKey: 'k-12345678' })
		expect(replay.success).toBe(true)
		expect(replay.data.duplicate).toBe(true)

		apiClient.post.mockRejectedValue(apiError(409, { error: 'en proceso', code: 'DUPLICATE_REQUEST' }))
		const inFlight = await swapApi.create({ direction: 'out', pair: 'p', amount: 1, toAddress: 'SP', pin: '1', idempotencyKey: 'k-12345678' })
		expect(inFlight.success).toBe(false)
		expect(isDuplicateInFlight(inFlight)).toBe(true)
	})

	test('402 sponsor_budget y 400 nonce exponen code/reason en details', async () => {
		apiClient.post.mockRejectedValue(apiError(402, { error: 'agotado', code: 'SPONSOR_BUDGET', reason: 'sponsor_budget' }))
		const budget = await swapApi.create({ direction: 'in', pair: 'p', amount: 1, signedTx: '00', asset: 'a', idempotencyKey: 'k-12345678' })
		expect(budget).toMatchObject({ success: false, status: 402, error: 'agotado', details: { code: 'SPONSOR_BUDGET', reason: 'sponsor_budget' } })

		apiClient.post.mockRejectedValue(apiError(400, { error: 'nonce', code: 'ORIGIN_NONCE_MISMATCH', reason: 'nonce' }))
		const nonce = await swapApi.create({ direction: 'in', pair: 'p', amount: 1, signedTx: '00', asset: 'a', idempotencyKey: 'k-12345678' })
		expect(nonce.details.reason).toBe('nonce')
	})

	test('fallo de red: sin status (isNetworkFailure)', async () => {
		apiClient.post.mockRejectedValue(new Error('Network Error'))
		const result = await swapApi.create({ direction: 'out', pair: 'p', amount: 1, toAddress: 'SP', pin: '1', idempotencyKey: 'k-12345678' })
		expect(result).toMatchObject({ success: false, error: 'Network Error' })
		expect(result.status).toBeUndefined()
	})
})

describe('swapApi.getPairs / get / cancel', () => {
	test('rutas y modo silent en las lecturas', async () => {
		apiClient.get.mockResolvedValue({ data: { data: [], limits: {}, sponsor: {}, wallet: { stx: null } }, status: 200 })
		await swapApi.getPairs()
		expect(apiClient.get).toHaveBeenCalledWith('/swap/pairs', { silent: true })
		await swapApi.get('abc')
		expect(apiClient.get).toHaveBeenCalledWith('/swap/abc', { silent: true })
		apiClient.delete.mockResolvedValue({ data: { data: { uuid: 'abc', status: 'refunded' }, balance: 100 }, status: 200 })
		const cancelled = await swapApi.cancel('abc')
		expect(apiClient.delete).toHaveBeenCalledWith('/swap/abc')
		expect(cancelled.data.balance).toBe(100)
	})
})
