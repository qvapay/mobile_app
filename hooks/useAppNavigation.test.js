/**
 * Unit tests for the app-root navigation side effects (splash gate, update
 * prompt, auth ↔ navigation reconciliation, deep links, OneSignal routing) —
 * node environment with everything native mocked (see keypadAmount.test.js).
 * @jest-environment node
 */
let linkingUrlHandler = null
jest.mock('react-native', () => ({
	Linking: {
		getInitialURL: jest.fn(),
		addEventListener: jest.fn((event, handler) => {
			linkingUrlHandler = handler
			return { remove: jest.fn() }
		}),
	},
}))
jest.mock('@react-navigation/native', () => ({ useNavigation: jest.fn() }))
const oneSignalListeners = {}
jest.mock('react-native-onesignal', () => ({
	OneSignal: {
		Notifications: {
			addEventListener: jest.fn((event, handler) => { oneSignalListeners[event] = handler }),
			removeEventListener: jest.fn(),
		},
	},
}))
jest.mock('sonner-native', () => ({ toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() } }))
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../settings/SettingsContext', () => ({ useSettings: jest.fn() }))
jest.mock('../helpers/playSound', () => jest.fn())
jest.mock('../helpers/versionCheck', () => ({ maybePromptUpdate: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { Linking } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { toast } from 'sonner-native'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import playSound from '../helpers/playSound'
import { maybePromptUpdate } from '../helpers/versionCheck'
import { useAppNavigation } from './useAppNavigation'

const P2P_UUID = '796a9e71-3d67-4a42-9dc2-02a5d069fa23'

const navigation = {
	reset: jest.fn(),
	navigate: jest.fn(),
	getState: jest.fn(() => ({ index: 0, routes: [{ name: 'Splash' }] })),
}

const renderAppNav = async (pendingRef = { current: null }) => {
	const result = { current: null }
	const Harness = () => {
		result.current = useAppNavigation(pendingRef)
		return null
	}
	await act(async () => { create(<Harness />) })
	return { result, pendingRef }
}

// The reconciliation effect only runs once splashReady flips (2s timer)
const passSplash = () => act(async () => { jest.advanceTimersByTime(2000) })

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	linkingUrlHandler = null
	useNavigation.mockReturnValue(navigation)
	useAuth.mockReturnValue({ user: { uuid: 'me' }, isAuthenticated: true, isLoading: false })
	useSettings.mockReturnValue({
		appearance: { firstTime: false },
		sounds: { enabled: true, transactionSound: true },
		isLoading: false,
	})
	maybePromptUpdate.mockResolvedValue({ needsUpdate: false })
	Linking.getInitialURL.mockResolvedValue(null)
	navigation.getState.mockReturnValue({ index: 0, routes: [{ name: 'Splash' }] })
})
afterEach(() => { jest.useRealTimers() })

describe('splash gate', () => {
	test('splashReady flips after the 2s minimum', async () => {
		const { result } = await renderAppNav()
		expect(result.current.splashReady).toBe(false)
		await passSplash()
		expect(result.current.splashReady).toBe(true)
	})

	test('nothing navigates before the splash gate opens', async () => {
		await renderAppNav()
		expect(navigation.reset).not.toHaveBeenCalled()
	})
})

describe('store-update prompt', () => {
	test('surfaces an available update and dismissUpdate clears it', async () => {
		maybePromptUpdate.mockResolvedValue({ needsUpdate: true, latestVersion: '1.9.0' })
		const { result } = await renderAppNav()
		expect(result.current.updateInfo).toMatchObject({ needsUpdate: true, latestVersion: '1.9.0' })
		act(() => { result.current.dismissUpdate() })
		expect(result.current.updateInfo).toBeNull()
	})

	test('stays silent when no update is needed', async () => {
		const { result } = await renderAppNav()
		expect(result.current.updateInfo).toBeNull()
	})
})

describe('auth ↔ navigation reconciliation', () => {
	test('authenticated users land on MainStack', async () => {
		await renderAppNav()
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'MainStack' }] })
	})

	test('already on MainStack means no reset', async () => {
		navigation.getState.mockReturnValue({ index: 0, routes: [{ name: 'MainStack' }] })
		await renderAppNav()
		await passSplash()
		expect(navigation.reset).not.toHaveBeenCalled()
	})

	test('a pending Pay deep link resets to MainStack + Pay so back lands on Home', async () => {
		const pendingRef = { current: `https://qvapay.com/pay/${P2P_UUID}` }
		await renderAppNav(pendingRef)
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({
			index: 1,
			routes: [
				{ name: 'MainStack' },
				{ name: 'Pay', params: { uuid: P2P_UUID } },
			],
		})
		expect(pendingRef.current).toBeNull() // consumed
	})

	test('a pending P2P deep link resets to MainStack + P2POffer', async () => {
		const pendingRef = { current: `qvapay://p2p/${P2P_UUID}` }
		await renderAppNav(pendingRef)
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({
			index: 1,
			routes: [
				{ name: 'MainStack' },
				{ name: 'P2POffer', params: { p2p_uuid: P2P_UUID } },
			],
		})
	})

	test('unauthenticated users land on Welcome, stashing any launch deep link first', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		Linking.getInitialURL.mockResolvedValue(`https://qvapay.com/pay/${P2P_UUID}`)
		const { pendingRef } = await renderAppNav()
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Welcome' }] })
		expect(pendingRef.current).toBe(`https://qvapay.com/pay/${P2P_UUID}`)
		expect(toast.info).toHaveBeenCalledWith('Inicia sesión para pagar la factura')
	})

	test('first-time users are left on the onboarding flow (no reset)', async () => {
		useSettings.mockReturnValue({
			appearance: { firstTime: true },
			sounds: { enabled: false },
			isLoading: false,
		})
		await renderAppNav()
		await passSplash()
		expect(navigation.reset).not.toHaveBeenCalled()
	})
})

describe('foreground deep links while unauthenticated', () => {
	test('stashes P2P links with the Spanish login toast', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		const { pendingRef } = await renderAppNav()
		await act(async () => { linkingUrlHandler({ url: `https://qvapay.com/p2p/${P2P_UUID}` }) })
		expect(pendingRef.current).toBe(`https://qvapay.com/p2p/${P2P_UUID}`)
		expect(toast.info).toHaveBeenCalledWith('Inicia sesión para ver la oferta P2P')
	})

	test('ignores links while authenticated (React Navigation handles those)', async () => {
		const { pendingRef } = await renderAppNav()
		await act(async () => { linkingUrlHandler({ url: `https://qvapay.com/p2p/${P2P_UUID}` }) })
		expect(pendingRef.current).toBeNull()
	})
})

describe('OneSignal listeners', () => {
	const makeForegroundEvent = (title, body, data) => ({
		preventDefault: jest.fn(),
		getNotification: () => ({
			title,
			body,
			additionalData: data,
			display: jest.fn(),
		}),
	})

	test('foreground notifications become toasts and transaction ones play money_in', async () => {
		await renderAppNav()
		const event = makeForegroundEvent('Pago recibido', '+$5.00', { type: 'transaction' })
		await act(async () => { oneSignalListeners.foregroundWillDisplay(event) })
		expect(event.preventDefault).toHaveBeenCalled()
		expect(playSound).toHaveBeenCalledWith('money_in')
		expect(toast.info).toHaveBeenCalledWith('Pago recibido', { description: '+$5.00' })
	})

	test('other notification types play the generic sound; disabled sounds play nothing', async () => {
		await renderAppNav()
		await act(async () => {
			oneSignalListeners.foregroundWillDisplay(makeForegroundEvent('Hola', null, { type: 'promo' }))
		})
		expect(playSound).toHaveBeenCalledWith('notification')

		playSound.mockClear()
		useSettings.mockReturnValue({
			appearance: { firstTime: false },
			sounds: { enabled: false },
			isLoading: false,
		})
		await renderAppNav()
		await act(async () => {
			oneSignalListeners.foregroundWillDisplay(makeForegroundEvent('Hola', null, { type: 'transaction' }))
		})
		expect(playSound).not.toHaveBeenCalled()
	})

	test('tapping a notification routes by type', async () => {
		await renderAppNav()
		const click = (data) => act(async () => {
			oneSignalListeners.click({ notification: { additionalData: data } })
		})
		await click({ type: 'transaction', uuid: 't-1' })
		expect(navigation.navigate).toHaveBeenCalledWith('Transaction', { uuid: 't-1' })
		await click({ type: 'p2p', uuid: 'p-1' })
		expect(navigation.navigate).toHaveBeenCalledWith('P2POffer', { p2p_uuid: 'p-1' })
		await click({ type: 'transfer' })
		expect(navigation.navigate).toHaveBeenCalledWith('Transactions')
	})

	test('taps are ignored while unauthenticated or without a type', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		await renderAppNav()
		await act(async () => {
			oneSignalListeners.click({ notification: { additionalData: { type: 'transaction', uuid: 't-1' } } })
		})
		expect(navigation.navigate).not.toHaveBeenCalled()
	})
})
