/**
 * Unit tests for the useNearbyPeers orchestrator, rendered with
 * react-test-renderer — node environment (see keypadAmount.test.js for why).
 * A fake transport is injected through the transports registry so no native
 * module is touched.
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	Platform: { OS: 'ios', Version: 26 },
	AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}))
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }))
jest.mock('react-native-haptic-feedback', () => ({ trigger: jest.fn() }))
jest.mock('../helpers/playSound', () => jest.fn())
jest.mock('../settings/SettingsContext', () => ({
	useSettings: () => ({ sounds: { enabled: true, transactionSound: true } }),
}))
jest.mock('../api/userApi', () => ({ userApi: { searchUser: jest.fn() } }))
jest.mock('./transports', () => ({ getTransports: jest.fn() }))
jest.mock('./permissions', () => ({ ensureNearbyPermissions: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import playSound from '../helpers/playSound'
import { userApi } from '../api/userApi'
import { getTransports } from './transports'
import { ensureNearbyPermissions } from './permissions'
import { useNearbyPeers } from './useNearbyPeers'
import { getActiveSession } from './session'

const SELF = { uuid: 'a1b2c3d4-e5f6-4a1b-8c2d-0123456789ab', username: 'me', name: 'Me' }
const PEER_UUID = 'b2c3d4e5-f6a1-4b2c-9d3e-123456789abc'

const announceFrom = (uuid, extra = {}) => ({
	v: 1, t: 'announce', ts: Date.now(), uuid, username: 'peer', name: 'Peer',
	avatarUrl: '', goldenCheck: false, mode: 'browse', amount: null, ...extra,
})

/** Fake NearbyTransport capturing the callbacks the hook wires in. */
const makeFakeTransport = () => {
	const transport = {
		id: 'multipeer',
		callbacks: null,
		isAvailable: jest.fn(() => Promise.resolve(true)),
		start: jest.fn(function (opts) { transport.callbacks = opts; return Promise.resolve() }),
		updateAnnounce: jest.fn(),
		send: jest.fn(() => Promise.resolve(true)),
		pause: jest.fn(),
		resume: jest.fn(),
		stop: jest.fn(() => Promise.resolve()),
	}
	return transport
}

const flush = () => act(async () => { await Promise.resolve() })

// Every render is tracked and unmounted after each test so the hook's TTL
// interval and AppState listeners never outlive the suite (open handles hang Jest).
const mountedTrees = []

const renderHook = async (props) => {
	const result = { current: null }
	const Harness = () => {
		result.current = useNearbyPeers(props)
		return null
	}
	let tree
	await act(async () => { tree = create(React.createElement(Harness)) })
	const unmount = () => act(() => tree.unmount())
	mountedTrees.push(tree)
	return { result, unmount }
}

let transport

beforeEach(() => {
	jest.clearAllMocks()
	transport = makeFakeTransport()
	getTransports.mockReturnValue([transport])
	ensureNearbyPermissions.mockResolvedValue('granted')
	userApi.searchUser.mockResolvedValue({ success: true, data: [{ uuid: PEER_UUID, username: 'peer', name: 'Peer Real' }] })
})

afterEach(async () => {
	while (mountedTrees.length) {
		const tree = mountedTrees.pop()
		await act(async () => { tree.unmount() })
	}
})

describe('startup', () => {
	test('starts the transport and reaches scanning on active', async () => {
		const { result } = await renderHook({ enabled: true, user: SELF })
		expect(transport.start).toHaveBeenCalled()
		await act(async () => { transport.callbacks.onStateChange('active') })
		expect(result.current.state).toBe('scanning')
	})

	test('denied permission blocks with permission_denied and never starts', async () => {
		ensureNearbyPermissions.mockResolvedValue('denied')
		const { result } = await renderHook({ enabled: true, user: SELF })
		expect(result.current.state).toBe('permission_denied')
		expect(transport.start).not.toHaveBeenCalled()
	})
})

describe('peer verification (server-side identity)', () => {
	test('an announced peer only appears after the server resolves its uuid', async () => {
		const { result } = await renderHook({ enabled: true, user: SELF })
		await act(async () => { transport.callbacks.onPeerFound('p1', announceFrom(PEER_UUID)) })
		await flush()
		expect(userApi.searchUser).toHaveBeenCalledWith(PEER_UUID)
		expect(result.current.peers).toHaveLength(1)
		expect(result.current.peers[0].server.name).toBe('Peer Real') // server profile, not announce
	})

	test('a peer whose uuid does not resolve is dropped', async () => {
		userApi.searchUser.mockResolvedValue({ success: true, data: [] })
		const { result } = await renderHook({ enabled: true, user: SELF })
		await act(async () => { transport.callbacks.onPeerFound('p1', announceFrom(PEER_UUID)) })
		await flush()
		expect(result.current.peers).toHaveLength(0)
		expect(result.current.pendingCount).toBe(0)
	})

	test('a server profile with a mismatched uuid is rejected (spoof guard)', async () => {
		userApi.searchUser.mockResolvedValue({ success: true, data: [{ uuid: SELF.uuid, name: 'Impostor' }] })
		const { result } = await renderHook({ enabled: true, user: SELF })
		await act(async () => { transport.callbacks.onPeerFound('p1', announceFrom(PEER_UUID)) })
		await flush()
		expect(result.current.peers).toHaveLength(0)
	})
})

describe('charge mode', () => {
	test('startCharging/stopCharging re-announce with the right mode', async () => {
		const { result } = await renderHook({ enabled: true, user: SELF })
		await act(async () => { result.current.startCharging('25.50') })
		expect(result.current.chargeMode).toEqual({ active: true, amount: '25.50' })
		expect(transport.updateAnnounce).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'charge', amount: '25.50' }))

		await act(async () => { result.current.stopCharging() })
		expect(result.current.chargeMode).toEqual({ active: false, amount: null })
		expect(transport.updateAnnounce).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'browse' }))
	})
})

describe('payment ack channel', () => {
	test('payment_result fires the callback and the money_in sound', async () => {
		const onPaymentReceived = jest.fn()
		await renderHook({ enabled: true, user: SELF, onPaymentReceived })
		await act(async () => {
			transport.callbacks.onMessage('p1', { v: 1, t: 'payment_result', ts: Date.now(), status: 'paid', amount: '25.50' })
		})
		expect(onPaymentReceived).toHaveBeenCalledWith(expect.objectContaining({ amount: '25.50' }))
		expect(playSound).toHaveBeenCalledWith('money_in')
	})

	test('notifyPaymentSent routes the ack to the right peer through the session singleton', async () => {
		await renderHook({ enabled: true, user: SELF })
		await act(async () => { transport.callbacks.onPeerFound('p1', announceFrom(PEER_UUID)) })
		await flush()

		getActiveSession().notifyPaymentSent({ toUuid: PEER_UUID.toUpperCase(), amount: '25.50', txUuid: 'tx-1' })
		expect(transport.send).toHaveBeenCalledWith('p1', expect.objectContaining({ t: 'payment_result', amount: '25.50', txUuid: 'tx-1' }))
	})

	test('notifyPaymentSent is a no-op for unknown peers (QR flow untouched)', async () => {
		await renderHook({ enabled: true, user: SELF })
		getActiveSession().notifyPaymentSent({ toUuid: PEER_UUID, amount: '5' })
		expect(transport.send).not.toHaveBeenCalled()
	})
})

describe('teardown', () => {
	test('unmount stops the transport and clears the session singleton', async () => {
		const { unmount } = await renderHook({ enabled: true, user: SELF })
		await flush()
		unmount()
		expect(transport.stop).toHaveBeenCalled()
		expect(getActiveSession()).toBeNull()
	})
})
