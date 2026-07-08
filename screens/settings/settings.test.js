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
