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
import { IAP_SKUS, getProductId, getAndroidOfferToken, getIAPErrorMessage } from './iap'

afterEach(() => { Platform.OS = 'ios' })

describe('IAP_SKUS', () => {
	test('resolves via Platform.select (two products on iOS)', () => {
		expect(IAP_SKUS).toEqual([
			'com.qvapay.goldcheck.monthly',
			'com.qvapay.goldcheck.yearly',
		])
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
	test('LATENT BUG: E_USER_CANCELLED is meant to be silenced (null) but ?? skips the null map entry and falls through to the generic message', () => {
		// Intended: null (silence the cancellation). Actual: `messages[code] ?? ...`
		// treats the stored null as "missing" and returns the fallback chain.
		expect(getIAPErrorMessage({ code: 'E_USER_CANCELLED' })).toBe('Error al procesar la compra')
		expect(getIAPErrorMessage({ code: 'E_USER_CANCELLED', message: 'user cancelled' })).toBe('user cancelled')
	})

	test('maps known codes to Spanish messages (code or responseCode)', () => {
		expect(getIAPErrorMessage({ code: 'E_ITEM_UNAVAILABLE' })).toBe('Este producto no está disponible en tu región')
		expect(getIAPErrorMessage({ responseCode: 'E_NETWORK_ERROR' })).toBe('Error de conexión. Verifica tu internet')
		expect(getIAPErrorMessage({ code: 'E_ALREADY_OWNED' })).toBe('Ya tienes una suscripción activa')
	})

	test('falls back to error.message, then to the generic message', () => {
		expect(getIAPErrorMessage({ code: 'E_WEIRD', message: 'raw store error' })).toBe('raw store error')
		expect(getIAPErrorMessage({ code: 'E_WEIRD' })).toBe('Error al procesar la compra')
		expect(getIAPErrorMessage(null)).toBe('Error desconocido')
	})
})
