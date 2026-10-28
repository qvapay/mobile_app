/**
 * Unit tests for the app-root navigation side effects (splash gate, update
 * prompt, auth ↔ navigation reconciliation, deep links, push routing) —
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
const pushListeners = {}
jest.mock('../push', () => ({
	subscribeForegroundPush: jest.fn((handler) => { pushListeners.foreground = handler; return jest.fn() }),
	subscribeOpenedPush: jest.fn((handler) => { pushListeners.opened = handler; return jest.fn() }),
	takeInitialPush: jest.fn(async () => null),
	trackPushOpened: jest.fn(async () => {}),
	trackPushReceived: jest.fn(async () => {}),
}))
jest.mock('sonner-native', () => ({ toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() } }))
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../settings/SettingsContext', () => ({ useSettings: jest.fn() }))
jest.mock('../wallet/WalletContext', () => ({ useWallet: jest.fn() }))
jest.mock('../helpers/playSound', () => jest.fn())
jest.mock('../helpers/installReferrer', () => ({ consumeInstallReferrer: jest.fn() }))
jest.mock('../helpers/versionCheck', () => ({ maybePromptUpdate: jest.fn() }))
// El cliente de queries real arrastra el persister (AsyncStorage) a este entorno node
jest.mock('../api/queryClient', () => ({
	queryClient: { invalidateQueries: jest.fn(), setQueriesData: jest.fn() },
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { Linking } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { toast } from 'sonner-native'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import { useWallet } from '../wallet/WalletContext'
import playSound from '../helpers/playSound'
import { consumeInstallReferrer } from '../helpers/installReferrer'
import { maybePromptUpdate } from '../helpers/versionCheck'
import { queryClient } from '../api/queryClient'
import { takeInitialPush, trackPushOpened, trackPushReceived } from '../push'
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
	useWallet.mockReturnValue({ isReady: true, hasWallet: false })
	useSettings.mockReturnValue({
		appearance: { firstTime: false },
		sounds: { enabled: true, transactionSound: true },
		isLoading: false,
	})
	maybePromptUpdate.mockResolvedValue({ needsUpdate: false })
	consumeInstallReferrer.mockResolvedValue(null)
	Linking.getInitialURL.mockResolvedValue(null)
	takeInitialPush.mockResolvedValue(null)
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

	test('a pending mini-app deep link resets to MainStack + MiniAppHost', async () => {
		const pendingRef = { current: 'https://www.qvapay.com/apps/mi-app?utm_source=tg' }
		await renderAppNav(pendingRef)
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({
			index: 1,
			routes: [
				{ name: 'MainStack' },
				{ name: 'MiniAppHost', params: { slug: 'mi-app' } },
			],
		})
		expect(pendingRef.current).toBeNull()
	})

	// Arranque en frío CON sesión desde un enlace: React Navigation monta el
	// destino como única ruta raíz; sin esto se reseteaba a MainStack y el
	// enlace se perdía (pasaba con Pay, P2P y Store)
	test('a cold start on a deep-link screen keeps it on top of MainStack', async () => {
		navigation.getState.mockReturnValue({ index: 0, routes: [{ name: 'MiniAppHost', params: { slug: 'mi-app' } }] })
		await renderAppNav()
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({
			index: 1,
			routes: [
				{ name: 'MainStack' },
				{ name: 'MiniAppHost', params: { slug: 'mi-app' } },
			],
		})
	})

	test('a cold start on Pay keeps the invoice too', async () => {
		navigation.getState.mockReturnValue({ index: 0, routes: [{ name: 'Pay', params: { uuid: P2P_UUID } }] })
		await renderAppNav()
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({
			index: 1,
			routes: [{ name: 'MainStack' }, { name: 'Pay', params: { uuid: P2P_UUID } }],
		})
	})

	test('a cold start on a non deep-link route still resets to a bare MainStack', async () => {
		navigation.getState.mockReturnValue({ index: 0, routes: [{ name: 'Welcome' }] })
		await renderAppNav()
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'MainStack' }] })
	})

	test('unauthenticated launch with a mini-app link stashes it with its toast', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		Linking.getInitialURL.mockResolvedValue('https://qvapay.com/apps/mi-app')
		const { pendingRef } = await renderAppNav()
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Welcome' }] })
		expect(pendingRef.current).toBe('https://qvapay.com/apps/mi-app')
		expect(toast.info).toHaveBeenCalledWith('Inicia sesión para abrir la mini-app')
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

	test('unauthenticated users with a wallet on the phone land on WalletOnly', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		useWallet.mockReturnValue({ isReady: true, hasWallet: true })
		Linking.getInitialURL.mockResolvedValue(null)
		await renderAppNav()
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'WalletOnly' }] })
	})

	test('already on WalletOnly means no reset', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		useWallet.mockReturnValue({ isReady: true, hasWallet: true })
		navigation.getState.mockReturnValueOnce({ index: 0, routes: [{ name: 'WalletOnly' }] })
		await renderAppNav()
		await passSplash()
		expect(navigation.reset).not.toHaveBeenCalled()
	})

	test('nothing navigates until the wallet has hydrated', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		useWallet.mockReturnValue({ isReady: false, hasWallet: false })
		await renderAppNav()
		await passSplash()
		expect(navigation.reset).not.toHaveBeenCalled()
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

	test('stashes mini-app links with the Spanish login toast', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		const { pendingRef } = await renderAppNav()
		await act(async () => { linkingUrlHandler({ url: 'qvapay://apps/mi-app' }) })
		expect(pendingRef.current).toBe('qvapay://apps/mi-app')
		expect(toast.info).toHaveBeenCalledWith('Inicia sesión para abrir la mini-app')
	})

	test('ignores links while authenticated (React Navigation handles those)', async () => {
		const { pendingRef } = await renderAppNav()
		await act(async () => { linkingUrlHandler({ url: `https://qvapay.com/p2p/${P2P_UUID}` }) })
		expect(pendingRef.current).toBeNull()
	})
})

describe('push listeners', () => {
	const makeMessage = (title, body, data) => ({ title, body, data })
	// Con MainStack en la raíz la app está reconciliada: un toque navega en el acto
	const settle = () => navigation.getState.mockReturnValue({ index: 1, routes: [{ name: 'MainStack' }, { name: 'P2POffer' }] })

	test('foreground notifications become toasts and transaction ones play money_in', async () => {
		await renderAppNav()
		const message = makeMessage('Pago recibido', '+$5.00', { type: 'transaction' })
		await act(async () => { pushListeners.foreground(message) })
		expect(playSound).toHaveBeenCalledWith('money_in')
		expect(toast.info).toHaveBeenCalledWith('Pago recibido', { description: '+$5.00' })
	})

	// El backend manda `transfer_received` + `transaction_uuid`: con la
	// comparación vieja ('transaction'/'transfer' + `uuid`) un cobro real sonaba
	// con el tono genérico
	test('an incoming transfer push (backend type) plays money_in and refreshes balance + history', async () => {
		await renderAppNav()
		const message = makeMessage('Has recibido una transferencia', '+$5.00', {
			type: 'transfer_received', transaction_uuid: 't-9',
		})
		await act(async () => { pushListeners.foreground(message) })
		expect(playSound).toHaveBeenCalledWith('money_in')
		expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['home'] })
		expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['transactions'] })
	})

	test('a foreground push reports its delivery as received', async () => {
		await renderAppNav()
		await act(async () => { pushListeners.foreground(makeMessage('Chat', 'nuevo mensaje', { type: 'p2p_chat', p2p_uuid: 'p-1', did: 'd-7' })) })
		expect(trackPushReceived).toHaveBeenCalledWith({ type: 'p2p_chat', p2p_uuid: 'p-1', did: 'd-7' })
	})

	test('an outgoing transfer push is not treated as money in', async () => {
		await renderAppNav()
		const message = makeMessage('Transferencia enviada', '-$5.00', {
			type: 'transfer_sent', transaction_uuid: 't-9',
		})
		await act(async () => { pushListeners.foreground(message) })
		// Ni money_in ni el tono genérico: el envío ya sonó en SendSuccess
		expect(playSound).not.toHaveBeenCalled()
		expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
	})

	test('other notification types play the generic sound; disabled sounds play nothing', async () => {
		await renderAppNav()
		await act(async () => {
			pushListeners.foreground(makeMessage('Hola', null, { type: 'promo' }))
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
			pushListeners.foreground(makeMessage('Hola', null, { type: 'transaction' }))
		})
		expect(playSound).not.toHaveBeenCalled()
	})

	test('tapping a notification routes by type once the app is settled', async () => {
		settle()
		await renderAppNav()
		const tap = (data) => act(async () => { pushListeners.opened({ data }) })
		await tap({ type: 'transaction', uuid: 't-1' })
		expect(navigation.navigate).toHaveBeenCalledWith('Transaction', { uuid: 't-1' })
		await tap({ type: 'transfer_received', transaction_uuid: 't-2' })
		expect(navigation.navigate).toHaveBeenCalledWith('Transaction', { uuid: 't-2' })
		await tap({ type: 'p2p_applied', p2p_uuid: 'p-2' })
		expect(navigation.navigate).toHaveBeenCalledWith('P2POffer', { p2p_uuid: 'p-2' })
		await tap({ type: 'p2p', uuid: 'p-1' })
		expect(navigation.navigate).toHaveBeenCalledWith('P2POffer', { p2p_uuid: 'p-1' })
		await tap({ type: 'transfer' })
		expect(navigation.navigate).toHaveBeenCalledWith('Transactions')
		expect(navigation.reset).not.toHaveBeenCalled()
	})

	test('a tap reports the delivery as opened and follows the deeplink over the type', async () => {
		settle()
		await renderAppNav()
		await act(async () => { pushListeners.opened({ data: { type: 'promo', deeplink: 'https://www.qvapay.com/savings', did: 'd-1' } }) })
		expect(trackPushOpened).toHaveBeenCalledWith({ type: 'promo', deeplink: 'https://www.qvapay.com/savings', did: 'd-1' })
		expect(navigation.navigate).toHaveBeenCalledWith('Savings')
		await act(async () => { pushListeners.opened({ data: { deeplink: 'qvapay://p2p' } }) })
		expect(navigation.navigate).toHaveBeenCalledWith('MainStack', { screen: 'P2P' })
	})

	test('a tap without a destination does nothing', async () => {
		settle()
		await renderAppNav()
		await act(async () => { pushListeners.opened({ data: { type: 'promo' } }) })
		await act(async () => { pushListeners.opened({ data: {} }) })
		expect(navigation.navigate).not.toHaveBeenCalled()
	})

	// Sin sesión el toque se guarda: al entrar, la reconciliación abre el destino
	// encima de MainStack (igual que un deep link capturado antes del login)
	test('a tap while logged out waits for the login', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		await renderAppNav()
		await act(async () => { pushListeners.opened({ data: { type: 'transaction', uuid: 't-1' } }) })
		expect(navigation.navigate).not.toHaveBeenCalled()
		expect(toast.info).toHaveBeenCalledWith('Inicia sesión para abrir la notificación')
	})

	// Arranque en frío desde una push: la raíz aún es Splash cuando llega, así
	// que se consume en la reconciliación con MainStack debajo
	test('the push that launched the app opens its screen on top of MainStack', async () => {
		takeInitialPush.mockResolvedValue({ title: 'Pago', body: '+$5', data: { type: 'transfer_received', transaction_uuid: 't-3', did: 'd-3' } })
		await renderAppNav()
		await passSplash()
		expect(trackPushOpened).toHaveBeenCalledWith({ type: 'transfer_received', transaction_uuid: 't-3', did: 'd-3' })
		expect(navigation.navigate).not.toHaveBeenCalled()
		expect(navigation.reset).toHaveBeenCalledWith({
			index: 1,
			routes: [{ name: 'MainStack' }, { name: 'Transaction', params: { uuid: 't-3' } }],
		})
	})

	// En frío auth aún hidrata el Keychain cuando se consume la push inicial:
	// con sesión cacheada NO se avisa «inicia sesión» (Bugbot, PR #94)
	test('the launch tap stays silent while auth is still loading and opens once the session is known', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true })
		takeInitialPush.mockResolvedValue({ data: { type: 'transfer_received', transaction_uuid: 't-3' } })
		let renderer
		const Harness = () => { useAppNavigation({ current: null }); return null }
		await act(async () => { renderer = create(<Harness />) })
		expect(toast.info).not.toHaveBeenCalled()
		useAuth.mockReturnValue({ user: { uuid: 'me' }, isAuthenticated: true, isLoading: false })
		await act(async () => { renderer.update(<Harness />) })
		await passSplash()
		expect(toast.info).not.toHaveBeenCalled()
		expect(navigation.reset).toHaveBeenCalledWith({
			index: 1,
			routes: [{ name: 'MainStack' }, { name: 'Transaction', params: { uuid: 't-3' } }],
		})
	})

	test('the launch tap asks to log in only once auth resolves without a session', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true })
		takeInitialPush.mockResolvedValue({ data: { type: 'transfer_received', transaction_uuid: 't-3' } })
		let renderer
		const Harness = () => { useAppNavigation({ current: null }); return null }
		await act(async () => { renderer = create(<Harness />) })
		expect(toast.info).not.toHaveBeenCalled()
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		await act(async () => { renderer.update(<Harness />) })
		await passSplash()
		expect(toast.info).toHaveBeenCalledWith('Inicia sesión para abrir la notificación')
		expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Welcome' }] })
	})

	test('a pending deep link wins over a pending push tap', async () => {
		takeInitialPush.mockResolvedValue({ data: { type: 'transfer_received', transaction_uuid: 't-3' } })
		const pendingRef = { current: `https://qvapay.com/pay/${P2P_UUID}` }
		await renderAppNav(pendingRef)
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledTimes(1)
		expect(navigation.reset).toHaveBeenCalledWith({
			index: 1,
			routes: [{ name: 'MainStack' }, { name: 'Pay', params: { uuid: P2P_UUID } }],
		})
	})
})

describe('install referrer deferred deep link', () => {
	test('queues the campaign destination for the post-login reconciliation', async () => {
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		consumeInstallReferrer.mockResolvedValue({ qpLink: `/p2p/${P2P_UUID}` })
		const { pendingRef } = await renderAppNav()
		expect(pendingRef.current).toBe(`https://www.qvapay.com/p2p/${P2P_UUID}`)
	})

	test('an authenticated first launch opens the campaign screen directly', async () => {
		consumeInstallReferrer.mockResolvedValue({ qpLink: `/p2p/${P2P_UUID}` })
		await renderAppNav()
		await passSplash()
		expect(navigation.reset).toHaveBeenCalledWith({
			index: 1,
			routes: [
				{ name: 'MainStack' },
				{ name: 'P2POffer', params: { p2p_uuid: P2P_UUID } },
			],
		})
	})

	test('organic installs leave the pending ref untouched', async () => {
		const { pendingRef } = await renderAppNav()
		expect(pendingRef.current).toBeNull()
	})

	test('never overwrites a deep link already queued', async () => {
		consumeInstallReferrer.mockResolvedValue({ qpLink: `/p2p/${P2P_UUID}` })
		const pendingRef = { current: `https://qvapay.com/pay/${P2P_UUID}` }
		useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
		await renderAppNav(pendingRef)
		expect(pendingRef.current).toBe(`https://qvapay.com/pay/${P2P_UUID}`)
	})
})
