/**
 * Unit tests for the settings menu catalog — node environment
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import settings from './settings'
import { ROUTES } from '../../routes'

const allOptions = Object.values(settings).flatMap(group => group.options)

describe('settings menu catalog', () => {
	test('mirrors the web dashboard grouping', () => {
		expect(Object.keys(settings)).toEqual([
			'appearance', 'profile', 'gold', 'security', 'notifications', 'payments',
		])
	})

	test('every group has an uppercase Spanish title and at least one option', () => {
		for (const group of Object.values(settings)) {
			expect(group.title).toBe(group.title.toUpperCase())
			expect(group.options.length).toBeGreaterThan(0)
		}
	})

	test('every option points at a real route and carries the SettingsItem shape', () => {
		const routeNames = new Set(Object.values(ROUTES))
		for (const option of allOptions) {
			expect(routeNames.has(option.screen)).toBe(true)
			expect(typeof option.title).toBe('string')
			expect(option.enabled).toBe(true)
			expect(option.notifications).toBe(0)
		}
	})

	test('every option carries a FontAwesome icon and a hex tint color', () => {
		for (const option of allOptions) {
			expect(typeof option.icon).toBe('string')
			expect(option.icon.length).toBeGreaterThan(0)
			expect(option.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
		}
	})

	test('tint colors are unique within each group', () => {
		for (const group of Object.values(settings)) {
			const colors = group.options.map(o => o.color)
			expect(new Set(colors).size).toBe(colors.length)
		}
	})

	test('every icon exists in the bundled FontAwesome6 solid set', () => {
		const glyphs = require('@react-native-vector-icons/fontawesome6/glyphmaps/FontAwesome6.json')
		const meta = require('@react-native-vector-icons/fontawesome6/glyphmaps/FontAwesome6_meta.json')
		for (const option of allOptions) {
			expect(glyphs[option.icon]).toBeDefined()
			expect(meta.solid).toContain(option.icon)
		}
	})

	test('every option carries search keywords as non-empty strings', () => {
		for (const option of allOptions) {
			expect(Array.isArray(option.keywords)).toBe(true)
			expect(option.keywords.length).toBeGreaterThan(0)
			for (const keyword of option.keywords) {
				expect(typeof keyword).toBe('string')
				expect(keyword.trim().length).toBeGreaterThan(0)
			}
		}
	})

	test('verifiedKey only takes values SettingsMenu knows how to resolve', () => {
		const known = new Set(['phone', 'telegram', 'kyc', 'gold'])
		for (const option of allOptions) {
			if (option.verifiedKey !== undefined) { expect(known.has(option.verifiedKey)).toBe(true) }
		}
	})

	test('no two options navigate to the same screen', () => {
		const screens = allOptions.map(o => o.screen)
		expect(new Set(screens).size).toBe(screens.length)
	})

	test('security group covers the sensitive flows', () => {
		const screens = settings.security.options.map(o => o.screen)
		expect(screens).toEqual(expect.arrayContaining([
			ROUTES.PASSWORD, ROUTES.BIOMETRICS, ROUTES.PASSKEYS,
			ROUTES.APP_LOCK, ROUTES.KYC, ROUTES.DELETE_ACCOUNT,
		]))
	})
})
