/**
 * Unit tests for the navigation route constants and deep-linking config —
 * node environment (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import { ROUTES, navItems } from './routes'
import linking from './linking'

describe('ROUTES', () => {
	test('route names are unique (deep links and push routing bind to them)', () => {
		const values = Object.values(ROUTES)
		expect(new Set(values).size).toBe(values.length)
	})

	test('key screens keep their published names — renaming breaks deep links', () => {
		expect(ROUTES.MAIN_STACK).toBe('MainStack')
		expect(ROUTES.HOME_SCREEN).toBe('Home')
		expect(ROUTES.P2P_SCREEN).toBe('P2P')
		expect(ROUTES.P2P_OFFER_SCREEN).toBe('P2POffer')
		expect(ROUTES.PAY_SCREEN).toBe('Pay')
	})

	test('TERMS_AND_CONDITIONS is an external URL, not a screen name', () => {
		expect(ROUTES.TERMS_AND_CONDITIONS).toMatch(/^https:\/\//)
	})
})

describe('navItems (bottom tabs)', () => {
	test('defines the five MainStack tabs in order', () => {
		expect(navItems.map(i => i.key)).toEqual(['Home', 'Invest', 'Keypad', 'P2P', 'Store'])
	})

	test('every tab has a FontAwesome icon name', () => {
		for (const item of navItems) { expect(typeof item.name).toBe('string') }
	})

	test('tab keys are real routes', () => {
		const routeNames = new Set(Object.values(ROUTES))
		for (const item of navItems) { expect(routeNames.has(item.key)).toBe(true) }
	})
})

describe('linking config', () => {
	test('handles both https hosts and the custom scheme', () => {
		expect(linking.prefixes).toEqual([
			'https://qvapay.com',
			'https://www.qvapay.com',
			'qvapay://',
		])
	})

	test('maps offer and invoice paths to their screens', () => {
		expect(linking.config.screens[ROUTES.P2P_OFFER_SCREEN]).toBe('p2p/:p2p_uuid')
		expect(linking.config.screens[ROUTES.PAY_SCREEN]).toBe('pay/:uuid')
	})

	test('maps home and p2p tabs inside MainStack', () => {
		const main = linking.config.screens[ROUTES.MAIN_STACK]
		expect(main.screens[ROUTES.HOME_SCREEN]).toBe('home')
		expect(main.screens[ROUTES.P2P_SCREEN]).toBe('p2p')
	})
})
