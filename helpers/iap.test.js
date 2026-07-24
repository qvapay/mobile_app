/**
 * Unit tests for the Gold Check IAP helpers — node environment with Platform
 * mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	Platform: {
		OS: 'ios',
		select: (spec) => spec.ios,
	},
}))

import { Platform } from 'react-native'
import { IAP_SKUS, TOPUP_SKUS, TOPUP_CATALOG, getTopupInfo, getProductId, getAndroidOfferToken, getIAPErrorMessage, isAlreadyOwnedError } from './iap'

afterEach(() => { Platform.OS = 'ios' })

describe('IAP_SKUS', () => {
	test('resolves via Platform.select (two products on iOS)', () => {
		expect(IAP_SKUS).toEqual([
			'com.qvapay.goldcheck.monthly',
			'com.qvapay.goldcheck.yearly',
		])
	})
})

describe('TOPUP_SKUS / TOPUP_CATALOG', () => {
	test('resolve via Platform.select (iOS reverse-DNS SKUs)', () => {
		expect(TOPUP_SKUS).toEqual([
			'com.qvapay.topup.100cup',
			'com.qvapay.topup.250cup',
			'com.qvapay.topup.500cup',
			'com.qvapay.topup.1000cup',
			'com.qvapay.topup.2000cup',
		])
		expect(Object.keys(TOPUP_CATALOG)).toEqual(TOPUP_SKUS)
	})

	test('every SKU has a catalog entry with amountCUP and label', () => {
		for (const sku of TOPUP_SKUS) {
			expect(TOPUP_CATALOG[sku]).toEqual(expect.objectContaining({
				amountCUP: expect.any(Number),
				label: expect.any(String),
			}))
		}
	})
})

describe('getTopupInfo', () => {
	test('returns the catalog entry for a known SKU', () => {
		expect(getTopupInfo('com.qvapay.topup.100cup')).toEqual({ amountCUP: 100, label: '$100 CUP' })
	})

	test('null for unknown SKUs', () => {
		expect(getTopupInfo('999cuptopup')).toBeNull()
		expect(getTopupInfo(undefined)).toBeNull()
	})
})

describe('getProductId', () => {
	test('iOS maps each plan to its own App Store product', () => {
		expect(getProductId('monthly')).toBe('com.qvapay.goldcheck.monthly')
		expect(getProductId('yearly')).toBe('com.qvapay.goldcheck.yearly')
		expect(getProductId('whatever')).toBe('com.qvapay.goldcheck.monthly') // monthly fallback
	})

	test('Android always uses the single Play subscription', () => {
		Platform.OS = 'android'
		expect(getProductId('monthly')).toBe('gold_check')
		expect(getProductId('yearly')).toBe('gold_check')
	})
})

describe('getAndroidOfferToken', () => {
	const subscriptions = [{
		productId: 'gold_check',
		subscriptionOfferDetails: [
			{ basePlanId: 'gold-check-monthly', offerToken: 'tok-monthly' },
			{ basePlanId: 'gold-check-yearly', offerToken: 'tok-yearly' },
		],
	}]

	test('finds the base-plan offer token on Android', () => {
		Platform.OS = 'android'
		expect(getAndroidOfferToken('monthly', subscriptions)).toBe('tok-monthly')
		expect(getAndroidOfferToken('yearly', subscriptions)).toBe('tok-yearly')
	})

	test('undefined on iOS regardless of data', () => {
		expect(getAndroidOfferToken('monthly', subscriptions)).toBeUndefined()
	})

	test('undefined when the subscription or offer is missing', () => {
		Platform.OS = 'android'
		expect(getAndroidOfferToken('monthly', [])).toBeUndefined()
		expect(getAndroidOfferToken('monthly', undefined)).toBeUndefined()
		expect(getAndroidOfferToken('monthly', [{ productId: 'other' }])).toBeUndefined()
		expect(getAndroidOfferToken('monthly', [{ productId: 'gold_check', subscriptionOfferDetails: [] }])).toBeUndefined()
	})
})

describe('getIAPErrorMessage', () => {
	test('user cancellation is silenced (null) so call sites skip the toast', () => {
		// Fixed 2026-07-17: `?? ` treated the stored null as "missing" — now the
		// map is checked with `in` so null survives as a valid "silence" value.
		expect(getIAPErrorMessage({ code: 'E_USER_CANCELLED' })).toBeNull()
		expect(getIAPErrorMessage({ code: 'E_USER_CANCELLED', message: 'user cancelled' })).toBeNull()
		// react-native-iap >= 14 emits OpenIAP kebab-case codes
		expect(getIAPErrorMessage({ code: 'user-cancelled' })).toBeNull()
	})

	test('maps known codes to Spanish messages (code or responseCode)', () => {
		expect(getIAPErrorMessage({ code: 'E_ITEM_UNAVAILABLE' })).toBe('Este producto no está disponible en tu región')
		expect(getIAPErrorMessage({ responseCode: 'E_NETWORK_ERROR' })).toBe('Error de conexión. Verifica tu internet')
		expect(getIAPErrorMessage({ code: 'E_ALREADY_OWNED' })).toBe('Ya tienes una compra activa de este producto')
	})

	test('maps OpenIAP kebab-case codes from react-native-iap >= 14', () => {
		expect(getIAPErrorMessage({ code: 'already-owned' })).toBe('Ya tienes una compra activa de este producto')
		expect(getIAPErrorMessage({ code: 'item-unavailable' })).toBe('Este producto no está disponible en tu región')
		expect(getIAPErrorMessage({ responseCode: 'network-error' })).toBe('Error de conexión. Verifica tu internet')
		expect(getIAPErrorMessage({ code: 'billing-unavailable' })).toBe('El servicio de pagos no está disponible')
		expect(getIAPErrorMessage({ code: 'deferred-payment' })).toBe('El pago está pendiente de aprobación')
	})

	test('falls back to error.message, then to the generic message', () => {
		expect(getIAPErrorMessage({ code: 'E_WEIRD', message: 'raw store error' })).toBe('raw store error')
		expect(getIAPErrorMessage({ code: 'E_WEIRD' })).toBe('Error al procesar la compra')
		expect(getIAPErrorMessage(null)).toBe('Error desconocido')
	})
})

describe('isAlreadyOwnedError', () => {
	test('detects both OpenIAP and legacy codes, via code or responseCode', () => {
		expect(isAlreadyOwnedError({ code: 'already-owned' })).toBe(true)
		expect(isAlreadyOwnedError({ code: 'E_ALREADY_OWNED' })).toBe(true)
		expect(isAlreadyOwnedError({ responseCode: 'already-owned' })).toBe(true)
	})

	test('false for other errors and missing input', () => {
		expect(isAlreadyOwnedError({ code: 'user-cancelled' })).toBe(false)
		expect(isAlreadyOwnedError({})).toBe(false)
		expect(isAlreadyOwnedError(null)).toBe(false)
	})
})
