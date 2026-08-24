/**
 * Unit tests for helpers/idempotency.js — node environment
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
import {
	makeIdempotencyKey,
	isDuplicateInFlight,
	callWithDuplicateRetry,
	isNetworkFailure,
	safeRetryHint,
} from './idempotency'

describe('makeIdempotencyKey', () => {

	test('matches the backend shape [A-Za-z0-9._-]{8,64}', () => {
		for (let i = 0; i < 50; i++) {
			expect(makeIdempotencyKey()).toMatch(/^[A-Za-z0-9._-]{8,64}$/)
		}
	})

	test('generates a different key on every call', () => {
		expect(makeIdempotencyKey()).not.toBe(makeIdempotencyKey())
	})
})

describe('isDuplicateInFlight', () => {

	test('true for the contract 409 with code DUPLICATE_REQUEST', () => {
		expect(isDuplicateInFlight({
			success: false,
			status: 409,
			details: { error: 'Ya hay una transferencia idéntica en proceso.', code: 'DUPLICATE_REQUEST' },
		})).toBe(true)
	})

	test('true for a 409 without details (modules that only surface status)', () => {
		expect(isDuplicateInFlight({ success: false, status: 409 })).toBe(true)
	})

	test('false for a 409 with a different code', () => {
		expect(isDuplicateInFlight({ success: false, status: 409, details: { code: 'OTHER' } })).toBe(false)
	})

	test('false for non-409 failures, successes and empty results', () => {
		expect(isDuplicateInFlight({ success: false, status: 422 })).toBe(false)
		expect(isDuplicateInFlight({ success: false, status: undefined })).toBe(false)
		expect(isDuplicateInFlight({ success: true, status: 200 })).toBe(false)
		expect(isDuplicateInFlight(null)).toBe(false)
	})
})

describe('callWithDuplicateRetry', () => {

	test('returns the first result directly when it is not a duplicate-in-flight', async () => {
		const fn = jest.fn().mockResolvedValue({ success: true, status: 200 })

		const result = await callWithDuplicateRetry(fn)

		expect(fn).toHaveBeenCalledTimes(1)
		expect(result).toEqual({ success: true, status: 200 })
	})

	test('does not retry plain failures (validation, network)', async () => {
		const fn = jest.fn().mockResolvedValue({ success: false, status: 422 })

		await callWithDuplicateRetry(fn, { delayMs: 0 })

		expect(fn).toHaveBeenCalledTimes(1)
	})

	test('retries ONCE with the same fn after the 409 in-flight and returns the replay', async () => {
		const fn = jest.fn()
			.mockResolvedValueOnce({ success: false, status: 409, details: { code: 'DUPLICATE_REQUEST' } })
			.mockResolvedValueOnce({ success: true, status: 200, data: { duplicate: true } })

		const result = await callWithDuplicateRetry(fn, { delayMs: 0 })

		expect(fn).toHaveBeenCalledTimes(2)
		expect(result).toEqual({ success: true, status: 200, data: { duplicate: true } })
	})

	test('returns the second result even if it is still a failure (no infinite loop)', async () => {
		const fn = jest.fn().mockResolvedValue({ success: false, status: 409, details: { code: 'DUPLICATE_REQUEST' } })

		const result = await callWithDuplicateRetry(fn, { delayMs: 0 })

		expect(fn).toHaveBeenCalledTimes(2)
		expect(result.status).toBe(409)
	})

	test('waits delayMs before the retry', async () => {
		jest.useFakeTimers()
		const fn = jest.fn()
			.mockResolvedValueOnce({ success: false, status: 409 })
			.mockResolvedValueOnce({ success: true, status: 200 })

		const promise = callWithDuplicateRetry(fn, { delayMs: 5200 })
		// Let the first call settle: the retry must be pending on the timer
		await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
		expect(fn).toHaveBeenCalledTimes(1)

		jest.advanceTimersByTime(5200)
		const result = await promise
		expect(fn).toHaveBeenCalledTimes(2)
		expect(result.success).toBe(true)
		jest.useRealTimers()
	})
})

describe('isNetworkFailure', () => {

	test('true only for failures without an HTTP status', () => {
		expect(isNetworkFailure({ success: false, error: 'No se ha podido conectar con el servidor' })).toBe(true)
		expect(isNetworkFailure({ success: false, status: undefined })).toBe(true)
		expect(isNetworkFailure({ success: false, status: 500 })).toBe(false)
		expect(isNetworkFailure({ success: true })).toBe(false)
		expect(isNetworkFailure(null)).toBe(false)
	})
})

describe('safeRetryHint', () => {

	test('promises a safe retry in Spanish', () => {
		expect(safeRetryHint()).toMatch(/reintentar sin riesgo/i)
	})
})
