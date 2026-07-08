/**
 * Unit tests for the settings constants — node environment
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './settingsConstants'

describe('STORAGE_KEYS', () => {
	test('every category persists under its own unique AsyncStorage key', () => {
		const values = Object.values(STORAGE_KEYS)
		expect(new Set(values).size).toBe(values.length)
	})

	test('includes the generic fallback key', () => {
		expect(STORAGE_KEYS.SETTINGS).toBe('app_settings')
	})
})

describe('DEFAULT_SETTINGS', () => {
	test('covers every settings category the app reads', () => {
		expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual([
			'appearance',
			'investment',
			'language',
			'notifications',
			'p2p',
			'privacy',
			'roundup',
			'security',
			'sounds',
			'store',
			'transactions',
			'vibration',
		])
	})

	test('notable defaults: dark theme, Spanish locale, QUSD, onboarding gate on', () => {
		expect(DEFAULT_SETTINGS.appearance.theme).toBe('dark')
		expect(DEFAULT_SETTINGS.appearance.firstTime).toBe(true)
		expect(DEFAULT_SETTINGS.language.currentLanguage).toBe('es')
		expect(DEFAULT_SETTINGS.language.currency).toBe('QUSD')
		expect(DEFAULT_SETTINGS.transactions.defaultCurrency).toBe('QUSD')
	})

	test('security defaults are conservative', () => {
		expect(DEFAULT_SETTINGS.security.biometricsEnabled).toBe(false)
		expect(DEFAULT_SETTINGS.security.twoFactorEnabled).toBe(false)
		expect(DEFAULT_SETTINGS.security.autoLockTimeout).toBe(5)
	})

	test('roundup starts disabled with no destination', () => {
		expect(DEFAULT_SETTINGS.roundup).toEqual({ enabled: false, destination: null })
	})
})
