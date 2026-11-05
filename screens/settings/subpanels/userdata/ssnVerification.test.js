/**
 * Vista, acciones y errores de la verificación del SSN (contrato de `/user/cip` y `verify-ssn`).
 * @jest-environment node
 */
import { deriveSsnView, blockActionFor, classifySsnVerifyError, applyVerified } from './ssnVerification'

const ssn = (over = {}) => ({ status: 'none', verified_at: null, attempts_left: 3, attempts_max: 3, can_start: true, block_reason: null, message: null, ...over })

describe('deriveSsnView', () => {
	test('verificado gana a todo', () => {
		expect(deriveSsnView(ssn({ status: 'verified', verified_at: '2026-11-01T00:00:00Z', can_start: false }))).toMatchObject({ phase: 'verified', verifiedAt: '2026-11-01T00:00:00Z' })
	})

	test('puede empezar: ready, o retry si el último intento no casó', () => {
		expect(deriveSsnView(ssn()).phase).toBe('ready')
		expect(deriveSsnView(ssn({ status: 'no_match', attempts_left: 2 }))).toMatchObject({ phase: 'retry', attemptsLeft: 2, attemptsMax: 3 })
		expect(deriveSsnView(ssn({ status: 'partial' })).phase).toBe('retry')
	})

	test('bloqueado lleva el motivo y la prosa del servidor; sin ficha, UNAVAILABLE', () => {
		expect(deriveSsnView(ssn({ can_start: false, block_reason: 'GOLD_REQUIRED', message: 'Solo GOLD' }))).toMatchObject({ phase: 'blocked', blockReason: 'GOLD_REQUIRED', message: 'Solo GOLD' })
		expect(deriveSsnView(null)).toMatchObject({ phase: 'blocked', blockReason: 'UNAVAILABLE', attemptsLeft: 0 })
		expect(deriveSsnView(ssn({ can_start: false }))).toMatchObject({ phase: 'blocked', blockReason: 'UNAVAILABLE' })
	})
})

describe('blockActionFor', () => {
	test('cada motivo a su salida', () => {
		expect(blockActionFor('GOLD_REQUIRED')).toEqual({ kind: 'gold' })
		expect(blockActionFor('KYC_REQUIRED')).toEqual({ kind: 'kyc' })
		expect(blockActionFor('DOCUMENT_REQUIRED')).toEqual({ kind: 'kyc' })
		expect(blockActionFor('NOT_US_PERSON')).toEqual({ kind: 'field', field: 'usPerson' })
		expect(blockActionFor('SSN_MISSING')).toEqual({ kind: 'field', field: 'ssn' })
		expect(blockActionFor('ADDRESS_REQUIRED')).toEqual({ kind: 'field', field: 'address' })
		expect(blockActionFor('ATTEMPTS_EXHAUSTED')).toEqual({ kind: 'support' })
		expect(blockActionFor('SDN_BLOCKED')).toEqual({ kind: 'none' })
		expect(blockActionFor('STAFF_ACCOUNT')).toEqual({ kind: 'none' })
		expect(blockActionFor('UNAVAILABLE')).toEqual({ kind: 'none' })
		expect(blockActionFor(null)).toEqual({ kind: 'none' })
	})
})

describe('classifySsnVerifyError', () => {
	test('por código del body, con los intentos que quedan', () => {
		expect(classifySsnVerifyError(409, { code: 'SSN_NO_MATCH', attempts_left: 2 })).toEqual({ kind: 'no_match', attemptsLeft: 2, blockReason: null })
		expect(classifySsnVerifyError(409, { code: 'SSN_PARTIAL_MATCH', attempts_left: 0 })).toEqual({ kind: 'no_match', attemptsLeft: 0, blockReason: null })
		expect(classifySsnVerifyError(429, { code: 'RATE_LIMITED' })).toEqual({ kind: 'rate_limited', attemptsLeft: null, blockReason: null })
		expect(classifySsnVerifyError(503, { code: 'SSN_VERIFY_UNAVAILABLE', attempts_left: 3 })).toEqual({ kind: 'unavailable', attemptsLeft: 3, blockReason: null })
		expect(classifySsnVerifyError(403, { code: 'ATTEMPTS_EXHAUSTED', attempts_left: 0 })).toEqual({ kind: 'blocked', attemptsLeft: 0, blockReason: 'ATTEMPTS_EXHAUSTED' })
	})

	test('sin código, por HTTP; sin nada, unknown', () => {
		expect(classifySsnVerifyError(409, {}).kind).toBe('no_match')
		expect(classifySsnVerifyError(429, null).kind).toBe('rate_limited')
		expect(classifySsnVerifyError(503, undefined).kind).toBe('unavailable')
		expect(classifySsnVerifyError(403, { code: 'LO_QUE_SEA' })).toEqual({ kind: 'blocked', attemptsLeft: null, blockReason: null })
		expect(classifySsnVerifyError(undefined, undefined).kind).toBe('unknown')
		expect(classifySsnVerifyError(500, { error: 'x' }).kind).toBe('unknown')
	})
})

describe('applyVerified', () => {
	test('deja la ficha como la devolverá el servidor', () => {
		const cip = { us_person: true, ssn_itin_last4: '6789', ssn_verification: ssn({ status: 'no_match', attempts_left: 2 }) }
		expect(applyVerified(cip, { status: 'verified', verified_at: '2026-11-03T10:00:00Z', attempts_left: 1 }).ssn_verification)
			.toEqual({ status: 'verified', verified_at: '2026-11-03T10:00:00Z', attempts_left: 1, attempts_max: 3, can_start: false, block_reason: null, message: null })
		expect(applyVerified(cip, null).ssn_verification).toMatchObject({ status: 'verified', attempts_left: 2 })
	})
})
