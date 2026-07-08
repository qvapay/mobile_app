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

	test('posts pay_method, numeric amount, details and numeric pin', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		const details = { account: '9224-xxxx', name: 'Erich' }
		const result = await withdrawApi.withdraw('25.50', 'BANK', details, '1234')

		expect(apiClient.post).toHaveBeenCalledWith('/withdraw', {
			pay_method: 'BANK',
			amount: 25.5,
			details,
			pin: 1234,
		})
		expect(result).toEqual({ success: true, data: successResponse.data, status: 200 })
	})

	test('uses the explicit payMethod over the coin ticker when provided', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw(10, 'BTC', {}, 1234, 'BTC_LN')

		expect(apiClient.post).toHaveBeenCalledWith('/withdraw', expect.objectContaining({
			pay_method: 'BTC_LN',
		}))
	})

	test('defaults details to an empty object and omits the note when not provided', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw(10, 'BANK', null, 1234)

		const [, payload] = apiClient.post.mock.calls[0]
		expect(payload.details).toEqual({})
		expect(payload).not.toHaveProperty('note')
	})

	test('includes the note in the payload when provided', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw(10, 'BANK', {}, 1234, undefined, 'para la renta')

		expect(apiClient.post).toHaveBeenCalledWith('/withdraw', expect.objectContaining({
			note: 'para la renta',
		}))
	})

	// KNOWN LATENT BUG (documented, not fixed): `pin` is sent as Number(pin),
	// so a 6-digit TOTP code with a leading zero loses that digit and gets
	// rejected server-side. Emailed 4-digit PINs are safe (always 1000-9999).
	test('current behavior: a TOTP code with a leading zero is mangled by Number(pin)', async () => {
		apiClient.post.mockResolvedValue(successResponse)

		await withdrawApi.withdraw(10, 'BANK', {}, '012345')

		const [, payload] = apiClient.post.mock.calls[0]
		expect(payload.pin).toBe(12345) // '012345' should reach the server intact
	})

	test('returns the API error with details on server error', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'PIN inválido', attempts_left: 2 }))

		const result = await withdrawApi.withdraw(10, 'BANK', {}, 9999)

		expect(result).toEqual({
			success: false,
			error: 'PIN inválido',
			details: { error: 'PIN inválido', attempts_left: 2 },
			status: 422,
		})
	})

	test('falls back to the message field, then to the default Spanish message', async () => {
		apiClient.post.mockRejectedValue(apiError(400, { message: 'Monto fuera de límites' }))
		expect((await withdrawApi.withdraw(1, 'BANK', {}, 1234)).error).toBe('Monto fuera de límites')

		apiClient.post.mockRejectedValue(apiError(500, {}))
		expect((await withdrawApi.withdraw(1, 'BANK', {}, 1234)).error).toBe('No se pudo completar la extracción')
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.post.mockRejectedValue(networkError())

		const result = await withdrawApi.withdraw(10, 'BANK', {}, 1234)

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})
