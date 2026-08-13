/**
 * Unit tests for api/withdrawApi.js — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
import { withdrawApi } from './withdrawApi'
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

describe('withdrawApi.requestPin', () => {

	test('posts to /user/reset-pin with no body', async () => {
		apiClient.post.mockResolvedValue({ data: { message: 'PIN enviado' }, status: 200 })

		const result = await withdrawApi.requestPin()

		expect(apiClient.post).toHaveBeenCalledWith('/user/reset-pin')
		expect(result).toEqual({ success: true, data: { message: 'PIN enviado' }, status: 200 })
	})

	test('returns the API error with details on server error', async () => {
		apiClient.post.mockRejectedValue(apiError(429, { error: 'Demasiados intentos' }))

		const result = await withdrawApi.requestPin()

		expect(result).toEqual({
			success: false,
			error: 'Demasiados intentos',
			details: { error: 'Demasiados intentos' },
			status: 429,
		})
	})

	test('falls back to the default Spanish message when the error body has no hints', async () => {
		apiClient.post.mockRejectedValue(apiError(500, {}))

		const result = await withdrawApi.requestPin()

		expect(result.error).toBe('No se pudo enviar el PIN')
		expect(result.status).toBe(500)
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.post.mockRejectedValue(networkError())

		const result = await withdrawApi.requestPin()

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('withdrawApi.withdraw', () => {

	const successResponse = { data: { withdraw: { id: 1 }, transaction: { uuid: 'tx-1' } }, status: 200 }

	test('posts pay_method, numeric amount, details and the pin as a string', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		const details = { account: '9224-xxxx', name: 'Erich' }
		const result = await withdrawApi.withdraw({ amount: '25.50', coin: 'BANK', details, pin: '1234' })

		expect(apiClient.post).toHaveBeenCalledWith('/withdraw', {
			pay_method: 'BANK',
			amount: 25.5,
			details,
			pin: '1234',
		})
		expect(result).toEqual({ success: true, data: successResponse.data, status: 200 })
	})

	test('uses the explicit payMethod over the coin ticker when provided', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw({ amount: 10, coin: 'BTC', details: {}, pin: 1234, payMethod: 'BTC_LN' })

		expect(apiClient.post).toHaveBeenCalledWith('/withdraw', expect.objectContaining({
			pay_method: 'BTC_LN',
		}))
	})

	test('defaults details to an empty object and omits the note when not provided', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw({ amount: 10, coin: 'BANK', details: null, pin: 1234 })

		const [, payload] = apiClient.post.mock.calls[0]
		expect(payload.details).toEqual({})
		expect(payload).not.toHaveProperty('note')
	})

	test('includes the note in the payload when provided', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw({ amount: 10, coin: 'BANK', details: {}, pin: 1234, note: 'para la renta' })

		expect(apiClient.post).toHaveBeenCalledWith('/withdraw', expect.objectContaining({
			note: 'para la renta',
		}))
	})

	// Regression for the old Number(pin) bug: a 6-digit TOTP with a leading zero
	// must reach the server intact (the backend does String(pin) on its side).
	test('a TOTP code with a leading zero survives serialization', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw({ amount: 10, coin: 'BANK', details: {}, pin: '012345' })

		const [, payload] = apiClient.post.mock.calls[0]
		expect(payload.pin).toBe('012345')
	})

	test('includes idempotency_key in the payload when idempotencyKey is passed', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw({ amount: 10, coin: 'BANK', details: {}, pin: 1234, idempotencyKey: 'attempt-abc123' })

		expect(apiClient.post).toHaveBeenCalledWith('/withdraw', expect.objectContaining({
			idempotency_key: 'attempt-abc123',
		}))
	})

	test('omits idempotency_key from the payload when no key is passed', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw({ amount: 10, coin: 'BANK', details: {}, pin: 1234 })

		expect(apiClient.post.mock.calls[0][1]).not.toHaveProperty('idempotency_key')
	})

	test('treats a duplicate replay (200 + duplicate: true) as a normal success', async () => {
		const replay = { result: 'OK', duplicate: true, data: { withdraw_id: 1, transaction_id: 'tx-original' } }
		apiClient.post.mockResolvedValue({ data: replay, status: 200 })

		const result = await withdrawApi.withdraw({ amount: 10, coin: 'BANK', details: {}, pin: 1234, idempotencyKey: 'attempt-abc123' })

		expect(result).toEqual({ success: true, data: replay, status: 200 })
	})

	test('source satoshis replaces amount with amount_sats in the payload', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw({ coin: 'BTCLN', details: { Wallet: 'lnbc1...' }, pin: '1234', source: 'satoshis', amountSats: 21000 })

		expect(apiClient.post).toHaveBeenCalledWith('/withdraw', {
			pay_method: 'BTCLN',
			details: { Wallet: 'lnbc1...' },
			pin: '1234',
			source: 'satoshis',
			amount_sats: 21000,
		})
		const [, payload] = apiClient.post.mock.calls[0]
		expect(payload).not.toHaveProperty('amount')
	})

	test('returns the API error with details on server error', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'PIN inválido', attempts_left: 2 }))

		const result = await withdrawApi.withdraw({ amount: 10, coin: 'BANK', details: {}, pin: 9999 })

		expect(result).toEqual({
			success: false,
			error: 'PIN inválido',
			details: { error: 'PIN inválido', attempts_left: 2 },
			status: 422,
		})
	})

	test('falls back to the message field, then to the default Spanish message', async () => {
		apiClient.post.mockRejectedValue(apiError(400, { message: 'Monto fuera de límites' }))
		expect((await withdrawApi.withdraw({ amount: 1, coin: 'BANK', details: {}, pin: 1234 })).error).toBe('Monto fuera de límites')

		apiClient.post.mockRejectedValue(apiError(500, {}))
		expect((await withdrawApi.withdraw({ amount: 1, coin: 'BANK', details: {}, pin: 1234 })).error).toBe('No se pudo completar la extracción')
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.post.mockRejectedValue(networkError())

		const result = await withdrawApi.withdraw({ amount: 10, coin: 'BANK', details: {}, pin: 1234 })

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('withdrawApi.decodeLightning', () => {

	test('posts the invoice silently and returns the decode payload', async () => {
		apiClient.post.mockResolvedValue({ data: { kind: 'bolt11', amount_sat: 150000 }, status: 200 })

		const result = await withdrawApi.decodeLightning('lnbc1500n1qq...')

		expect(apiClient.post).toHaveBeenCalledWith('/lightning/decode', { invoice: 'lnbc1500n1qq...' }, { silent: true })
		expect(result).toEqual({ success: true, data: { kind: 'bolt11', amount_sat: 150000 }, status: 200 })
	})

	test('surfaces the backend validation error', async () => {
		apiClient.post.mockRejectedValue(apiError(400, { error: 'Este invoice está por expirar o ya expiró. Genera uno nuevo.' }))

		const result = await withdrawApi.decodeLightning('lnbc...')

		expect(result.success).toBe(false)
		expect(result.error).toMatch(/expirar/)
	})
})
