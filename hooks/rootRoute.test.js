/**
 * Pure-logic unit test (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
import { resolveRootRoute } from './rootRoute'

describe('resolveRootRoute', () => {

	test('first launch always goes through the onboarding', () => {
		expect(resolveRootRoute({ firstTime: true, isAuthenticated: true, hasWallet: true })).toBe('Onboard')
		expect(resolveRootRoute({ firstTime: true, isAuthenticated: false, hasWallet: false })).toBe('Onboard')
	})

	test('a session wins over the wallet-only mode', () => {
		expect(resolveRootRoute({ firstTime: false, isAuthenticated: true, hasWallet: true })).toBe('MainStack')
		expect(resolveRootRoute({ firstTime: false, isAuthenticated: true, hasWallet: false })).toBe('MainStack')
	})

	test('no session with a wallet on the phone opens the wallet-only root', () => {
		expect(resolveRootRoute({ firstTime: false, isAuthenticated: false, hasWallet: true })).toBe('WalletOnly')
	})

	test('no session and no wallet lands on Welcome', () => {
		expect(resolveRootRoute({ firstTime: false, isAuthenticated: false, hasWallet: false })).toBe('Welcome')
	})
})
