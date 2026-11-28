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
	payloadSignature,
	idempotencyKeyFor,
	settleIdempotencyKey,
	resetIdempotencyKeys,
	isIdempotencyKeyReused,
	isDuplicateReplay,
	runIdempotent,
	duplicateNotice,
	PAYLOAD_KEY_TTL_MS,
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

describe('clave atada a los datos de la operación', () => {

	const purchase = { offer_id: 'off-1', country: 'US', brand: 'amazon', amount: 25 }

	beforeEach(() => resetIdempotencyKeys())

	test('la firma no depende del orden de los campos ni de los undefined', () => {
		expect(payloadSignature('store:voucher', { country: 'US', offer_id: 'off-1', brand: 'amazon', amount: 25, use_satoshis: undefined }))
			.toBe(payloadSignature('store:voucher', purchase))
	})

	test('la firma cambia con cualquier dato y con la operación', () => {
		const base = payloadSignature('store:voucher', purchase)
		expect(payloadSignature('store:voucher', { ...purchase, amount: 50 })).not.toBe(base)
		expect(payloadSignature('store:voucher', { ...purchase, use_satoshis: true })).not.toBe(base)
		expect(payloadSignature('store:topup', purchase)).not.toBe(base)
	})

	test('los mismos datos reciben la misma clave hasta que se suelta', () => {
		const key = idempotencyKeyFor('store:voucher', purchase)
		expect(key).toMatch(/^[A-Za-z0-9._-]{8,64}$/)
		expect(idempotencyKeyFor('store:voucher', { ...purchase })).toBe(key)

		settleIdempotencyKey('store:voucher', purchase)
		expect(idempotencyKeyFor('store:voucher', purchase)).not.toBe(key)
	})

	test('otros datos u otra operación reciben otra clave', () => {
		const key = idempotencyKeyFor('store:voucher', purchase)
		expect(idempotencyKeyFor('store:voucher', { ...purchase, amount: 50 })).not.toBe(key)
		expect(idempotencyKeyFor('store:topup', purchase)).not.toBe(key)
		// Y la primera sigue siendo la suya
		expect(idempotencyKeyFor('store:voucher', purchase)).toBe(key)
	})

	test('la clave caduca con la ventana del servidor', () => {
		const key = idempotencyKeyFor('saving:deposit', { amount: 25 }, 1000)
		expect(idempotencyKeyFor('saving:deposit', { amount: 25 }, 1000 + PAYLOAD_KEY_TTL_MS - 1)).toBe(key)
		expect(idempotencyKeyFor('saving:deposit', { amount: 25 }, 1000 + PAYLOAD_KEY_TTL_MS)).not.toBe(key)
	})

	test('isIdempotencyKeyReused solo con el 422 del contrato', () => {
		expect(isIdempotencyKeyReused({ success: false, status: 422, details: { code: 'IDEMPOTENCY_KEY_REUSED' } })).toBe(true)
		expect(isIdempotencyKeyReused({ success: false, status: 422, details: { message: 'Saldo insuficiente' } })).toBe(false)
		expect(isIdempotencyKeyReused({ success: false, status: 409, details: { code: 'IDEMPOTENCY_KEY_REUSED' } })).toBe(false)
		expect(isIdempotencyKeyReused({ success: true, status: 200 })).toBe(false)
		expect(isIdempotencyKeyReused(null)).toBe(false)
	})

	test('isDuplicateReplay solo con un 2xx que trae duplicate: true', () => {
		expect(isDuplicateReplay({ success: true, status: 200, data: { transaction_uuid: 't-1', duplicate: true } })).toBe(true)
		expect(isDuplicateReplay({ success: true, status: 200, data: { transaction_uuid: 't-1' } })).toBe(false)
		expect(isDuplicateReplay({ success: true, status: 200 })).toBe(false)
		expect(isDuplicateReplay({ success: false, status: 409, details: { duplicate: true } })).toBe(false)
		expect(isDuplicateReplay(null)).toBe(false)
	})

	test('duplicateNotice dice que no se cobró de nuevo', () => {
		expect(duplicateNotice()).toMatch(/ya se había procesado/i)
	})
})

describe('runIdempotent', () => {

	const purchase = { phone_package_id: 38, phone_number: '+5355555555' }
	const networkFailure = { success: false, error: 'No se ha podido conectar con el servidor', status: undefined }

	beforeEach(() => resetIdempotencyKeys())

	test('un reintento tras un corte de red va con la MISMA clave', async () => {
		const call = jest.fn()
			.mockResolvedValueOnce(networkFailure)
			.mockResolvedValueOnce({ success: true, status: 200, data: { transaction_uuid: 't-1', duplicate: true } })

		expect(await runIdempotent('store:phone_package', purchase, call)).toEqual(networkFailure)
		const replay = await runIdempotent('store:phone_package', { ...purchase }, call)

		expect(call).toHaveBeenCalledTimes(2)
		expect(call.mock.calls[1][0]).toBe(call.mock.calls[0][0])
		expect(isDuplicateReplay(replay)).toBe(true)
	})

	test('un rechazo del servidor tampoco cambia la clave', async () => {
		const call = jest.fn()
			.mockResolvedValueOnce({ success: false, status: 400, error: 'Insufficient balance' })
			.mockResolvedValueOnce({ success: false, status: undefined })
			.mockResolvedValueOnce({ success: true, status: 200, data: {} })

		await runIdempotent('store:phone_package', purchase, call)
		await runIdempotent('store:phone_package', purchase, call)
		await runIdempotent('store:phone_package', purchase, call)

		const keys = call.mock.calls.map(args => args[0])
		expect(new Set(keys).size).toBe(1)
	})

	test('tras un 2xx la misma compra otra vez es una operación nueva', async () => {
		const call = jest.fn().mockResolvedValue({ success: true, status: 200, data: { transaction_uuid: 't-1' } })

		await runIdempotent('store:phone_package', purchase, call)
		await runIdempotent('store:phone_package', purchase, call)

		expect(call.mock.calls[1][0]).not.toBe(call.mock.calls[0][0])
	})

	test('cambiar un dato es otra compra: otra clave, y la primera conserva la suya', async () => {
		const call = jest.fn().mockResolvedValue(networkFailure)

		await runIdempotent('store:phone_package', purchase, call)
		await runIdempotent('store:phone_package', { ...purchase, phone_number: '+5354444444' }, call)
		await runIdempotent('store:phone_package', purchase, call)

		const [first, other, again] = call.mock.calls.map(args => args[0])
		expect(other).not.toBe(first)
		expect(again).toBe(first)
	})

	test.each([
		['el 409 «en proceso»', { success: false, status: 409, details: { code: 'DUPLICATE_REQUEST' } }],
		['el 429 del límite de la ruta', { success: false, status: 429, error: 'Too many requests' }],
	])('ante %s espera y repite UNA vez con la misma clave', async (_name, blocked) => {
		const call = jest.fn()
			.mockResolvedValueOnce(blocked)
			.mockResolvedValueOnce({ success: true, status: 200, data: { duplicate: true } })

		const result = await runIdempotent('store:phone_package', purchase, call, { delayMs: 0 })

		expect(call).toHaveBeenCalledTimes(2)
		expect(call.mock.calls[1][0]).toBe(call.mock.calls[0][0])
		expect(result.success).toBe(true)
	})

	test('si sigue bloqueada no insiste, y conserva la clave para el siguiente intento', async () => {
		const blocked = { success: false, status: 409, details: { code: 'DUPLICATE_REQUEST' } }
		const call = jest.fn().mockResolvedValue(blocked)

		expect(await runIdempotent('store:phone_package', purchase, call, { delayMs: 0 })).toEqual(blocked)
		expect(call).toHaveBeenCalledTimes(2)

		await runIdempotent('store:phone_package', purchase, call, { delayMs: 0 })
		expect(new Set(call.mock.calls.map(args => args[0])).size).toBe(1)
	})

	test('un 409 con otro código (destinatario ambiguo de GOLD) no se repite', async () => {
		const ambiguous = { success: false, status: 409, details: { code: 'AMBIGUOUS_RECIPIENT' } }
		const call = jest.fn().mockResolvedValue(ambiguous)

		expect(await runIdempotent('gold:balance', { uuid: 'pepe', duration: 1 }, call, { delayMs: 0 })).toEqual(ambiguous)
		expect(call).toHaveBeenCalledTimes(1)
	})

	test('espera delayMs antes de repetir', async () => {
		jest.useFakeTimers()
		const call = jest.fn()
			.mockResolvedValueOnce({ success: false, status: 429 })
			.mockResolvedValueOnce({ success: true, status: 200 })

		const promise = runIdempotent('store:phone_package', purchase, call, { delayMs: 10200 })
		await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
		expect(call).toHaveBeenCalledTimes(1)

		jest.advanceTimersByTime(10200)
		expect((await promise).success).toBe(true)
		expect(call).toHaveBeenCalledTimes(2)
		jest.useRealTimers()
	})

	test('IDEMPOTENCY_KEY_REUSED: clave nueva para el siguiente intento y un texto que no habla de claves', async () => {
		const reused = { success: false, status: 422, error: 'Esa idempotency_key ya se usó para otra operación.', details: { code: 'IDEMPOTENCY_KEY_REUSED' } }
		const call = jest.fn()
			.mockResolvedValueOnce(reused)
			.mockResolvedValueOnce({ success: true, status: 200, data: {} })

		const first = await runIdempotent('store:phone_package', purchase, call)
		expect(first.success).toBe(false)
		expect(first.status).toBe(422)
		expect(first.error).not.toMatch(/idempotency/i)
		expect(first.error).toMatch(/inténtalo de nuevo/i)

		await runIdempotent('store:phone_package', purchase, call)
		expect(call.mock.calls[1][0]).not.toBe(call.mock.calls[0][0])
	})
})
