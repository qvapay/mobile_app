/**
 * Reglas puras del cobro desde mini-apps.
 * @jest-environment node
 */
import { invoiceBelongsToApp, payFailureCode, isSecondFactorFailure, requiresOtp } from './miniAppPayModel'

describe('invoiceBelongsToApp', () => {
	test('solo la factura del comercio de la mini-app', () => {
		expect(invoiceBelongsToApp({ app: { uuid: 'A' } }, 'A')).toBe(true)
		expect(invoiceBelongsToApp({ App: { uuid: 'A' } }, 'A')).toBe(true)
		expect(invoiceBelongsToApp({ app: { uuid: 'B' } }, 'A')).toBe(false)
	})
	test('factura sin app o sin appUuid → nunca', () => {
		expect(invoiceBelongsToApp({ app: null }, 'A')).toBe(false)
		expect(invoiceBelongsToApp({}, 'A')).toBe(false)
		expect(invoiceBelongsToApp(null, 'A')).toBe(false)
		expect(invoiceBelongsToApp({ app: { uuid: '' } }, '')).toBe(false)
	})
})

describe('payFailureCode', () => {
	test('mapea a códigos estables del SDK', () => {
		expect(payFailureCode(403, 'INVOICE_APP_MISMATCH')).toBe('INVOICE_APP_MISMATCH')
		expect(payFailureCode(undefined, undefined)).toBe('NETWORK')
		expect(payFailureCode(400, 'INSUFFICIENT_BALANCE')).toBe('FAILED')
	})
})

describe('segundo factor', () => {
	test('códigos del second-factor de qpweb', () => {
		for (const c of ['CODE_REQUIRED', 'CODE_INVALID', 'CODE_FORMAT', 'OTP_REQUIRED', 'CODE_LOCKED']) {
			expect(isSecondFactorFailure(c)).toBe(true)
		}
		expect(isSecondFactorFailure('ALREADY_PAID')).toBe(false)
		expect(isSecondFactorFailure(undefined)).toBe(false)
		expect(requiresOtp('OTP_REQUIRED')).toBe(true)
	})
})
