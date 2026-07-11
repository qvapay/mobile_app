/**
 * Unit tests for the Multipeer transport against the munim-bluetooth manual
 * mock — node environment (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native', () => ({ Platform: { OS: 'ios', Version: 26 } }))
jest.mock('munim-bluetooth')

import {
	startMultipeerSession,
	stopMultipeerSession,
	inviteMultipeerPeer,
	sendMultipeerMessage,
	__emit,
	__reset,
} from 'munim-bluetooth'
import { createMultipeerTransport } from './MultipeerTransport'
import { buildAnnounce, utf8ToHex, hexToUtf8, SERVICE_TYPE } from '../protocol'

const SELF_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-0123456789ab'
const PEER_UUID = 'b2c3d4e5-f6a1-4b2c-9d3e-123456789abc' // > SELF_UUID → we invite
const LOWER_UUID = '01b2c3d4-e5f6-4a1b-8c2d-0123456789ab' // < SELF_UUID → they invite
const SELF = { uuid: SELF_UUID, username: 'me', name: 'Me' }

// Decodes the hex payload of the nth sendMultipeerMessage call.
const sentMessage = (n = 0) => JSON.parse(hexToUtf8(sendMultipeerMessage.mock.calls[n][0]))

const startTransport = async (overrides = {}) => {
	const callbacks = {
		onPeerFound: jest.fn(),
		onPeerLost: jest.fn(),
		onMessage: jest.fn(),
		onStateChange: jest.fn(),
		...overrides,
	}
	const transport = createMultipeerTransport()
	await transport.start({ selfUuid: SELF_UUID, announce: buildAnnounce(SELF), ...callbacks })
	return { transport, callbacks }
}

beforeEach(() => __reset())

describe('start', () => {
	test('starts a session with the qvapay service type, uuid discoveryInfo and required encryption', async () => {
		await startTransport()
		expect(startMultipeerSession).toHaveBeenCalledWith(expect.objectContaining({
			serviceType: SERVICE_TYPE,
			displayName: SELF_UUID,
			discoveryInfo: [{ key: 'uuid', value: SELF_UUID }],
			autoInvite: false,
			autoAcceptInvitations: true,
			encryptionPreference: 'required',
		}))
	})

	test('reports starting → active state transitions', async () => {
		const { callbacks } = await startTransport()
		expect(callbacks.onStateChange).toHaveBeenCalledWith('starting')
		__emit('multipeerStarted', { platform: 'ios', serviceType: SERVICE_TYPE, peerId: 'me', displayName: SELF_UUID })
		expect(callbacks.onStateChange).toHaveBeenCalledWith('active')
	})
})

describe('deterministic invite rule (anti invitation storm)', () => {
	test('invites when our uuid is lexicographically lower', async () => {
		await startTransport()
		__emit('multipeerPeerFound', { id: 'p1', displayName: PEER_UUID, discoveryInfo: [{ key: 'uuid', value: PEER_UUID }] })
		expect(inviteMultipeerPeer).toHaveBeenCalledWith('p1')
	})

	test('waits for the invitation when our uuid is higher', async () => {
		await startTransport()
		__emit('multipeerPeerFound', { id: 'p2', displayName: LOWER_UUID, discoveryInfo: [{ key: 'uuid', value: LOWER_UUID }] })
		expect(inviteMultipeerPeer).not.toHaveBeenCalled()
	})
})

describe('announce exchange', () => {
	test('sends the current announce to a peer as soon as it connects', async () => {
		await startTransport()
		__emit('multipeerPeerStateChanged', { id: 'p1', displayName: PEER_UUID, state: 'connected' })
		expect(sendMultipeerMessage).toHaveBeenCalledTimes(1)
		expect(sentMessage()).toMatchObject({ t: 'announce', uuid: SELF_UUID })
		expect(sendMultipeerMessage.mock.calls[0][1]).toEqual(['p1'])
	})

	test('routes incoming announces to onPeerFound and other messages to onMessage', async () => {
		const { callbacks } = await startTransport()
		const announce = { ...buildAnnounce({ uuid: PEER_UUID, username: 'peer' }, 'charge', '25.50') }
		__emit('multipeerMessageReceived', { peerId: 'p1', displayName: PEER_UUID, value: utf8ToHex(JSON.stringify(announce)) })
		expect(callbacks.onPeerFound).toHaveBeenCalledWith('p1', expect.objectContaining({ t: 'announce', uuid: PEER_UUID, amount: '25.50' }))

		const result = { v: 1, t: 'payment_result', ts: Date.now(), status: 'paid', amount: '25.50' }
		__emit('multipeerMessageReceived', { peerId: 'p1', displayName: PEER_UUID, value: utf8ToHex(JSON.stringify(result)) })
		expect(callbacks.onMessage).toHaveBeenCalledWith('p1', expect.objectContaining({ t: 'payment_result' }))
	})

	test('silently drops malformed hex and invalid messages', async () => {
		const { callbacks } = await startTransport()
		__emit('multipeerMessageReceived', { peerId: 'p1', displayName: PEER_UUID, value: 'zzzz' })
		__emit('multipeerMessageReceived', { peerId: 'p1', displayName: PEER_UUID, value: utf8ToHex('{"t":"evil","v":1,"ts":1}') })
		expect(callbacks.onPeerFound).not.toHaveBeenCalled()
		expect(callbacks.onMessage).not.toHaveBeenCalled()
	})

	test('peer disconnect and bye both surface as onPeerLost', async () => {
		const { callbacks } = await startTransport()
		__emit('multipeerPeerLost', { peerId: 'p1' })
		expect(callbacks.onPeerLost).toHaveBeenCalledWith('p1')
		__emit('multipeerPeerStateChanged', { id: 'p2', displayName: PEER_UUID, state: 'notConnected' })
		expect(callbacks.onPeerLost).toHaveBeenCalledWith('p2')
	})
})

describe('updateAnnounce / pause / resume', () => {
	test('broadcasts announce updates to all peers, muted while paused', async () => {
		const { transport } = await startTransport()
		transport.updateAnnounce(buildAnnounce(SELF, 'charge', '10'))
		expect(sendMultipeerMessage).toHaveBeenCalledTimes(1)
		expect(sendMultipeerMessage.mock.calls[0][1]).toBeUndefined() // broadcast

		transport.pause()
		transport.updateAnnounce(buildAnnounce(SELF, 'charge', '20'))
		expect(sendMultipeerMessage).toHaveBeenCalledTimes(1) // muted

		transport.resume()
		expect(sendMultipeerMessage).toHaveBeenCalledTimes(2) // re-announced
		expect(sentMessage(1)).toMatchObject({ t: 'announce', amount: '20' })
	})

	test('connected-state announce still flows while paused (ack channel alive)', async () => {
		const { transport } = await startTransport()
		transport.pause()
		const sent = await transport.send('p1', { v: 1, t: 'payment_result', ts: Date.now(), status: 'paid', amount: '5' })
		expect(sent).toBe(true)
		expect(sendMultipeerMessage.mock.calls[0][1]).toEqual(['p1'])
	})
})

describe('stop', () => {
	test('says bye, unsubscribes and tears the session down', async () => {
		const { transport, callbacks } = await startTransport()
		await transport.stop()
		expect(sentMessage()).toMatchObject({ t: 'bye' })
		expect(stopMultipeerSession).toHaveBeenCalled()

		// Listeners are gone: events no longer reach the callbacks.
		__emit('multipeerPeerLost', { peerId: 'p9' })
		expect(callbacks.onPeerLost).not.toHaveBeenCalledWith('p9')
	})
})
