/**
 * Pure-logic unit tests for the nearby peers reducer — run in the node
 * environment to avoid the React Native jest preset's bundled jest 29 packages.
 * @jest-environment node
 */
import { peersReducer, initialPeersState, selectVerifiedPeers, selectPendingCount } from './peersReducer'

const UUID_A = 'a1b2c3d4-e5f6-4a1b-8c2d-0123456789ab'
const UUID_B = 'b2c3d4e5-f6a1-4b2c-9d3e-123456789abc'
const NOW = 1750000000000

const announce = (uuid, extra = {}) => ({
	v: 1, t: 'announce', ts: NOW, uuid, username: 'peer', name: 'Peer',
	avatarUrl: '', goldenCheck: false, mode: 'browse', amount: null, ...extra,
})

const found = (state, uuid, { peerId = `p-${uuid}`, transportId = 'multipeer', now = NOW, ...extra } = {}) =>
	peersReducer(state, { type: 'PEER_ANNOUNCE', peerId, transportId, announce: announce(uuid, extra), now })

describe('PEER_ANNOUNCE', () => {
	test('adds an unverified peer with stable arrival order', () => {
		let state = found(initialPeersState, UUID_A)
		state = found(state, UUID_B)
		expect(state[UUID_A]).toMatchObject({ verified: false, server: null, order: 0 })
		expect(state[UUID_B].order).toBe(1)
	})

	test('re-announce updates mode/amount and lastSeen but keeps order and verification', () => {
		let state = found(initialPeersState, UUID_A)
		state = peersReducer(state, { type: 'SERVER_PROFILE_RESOLVED', uuid: UUID_A, profile: { name: 'Real' } })
		state = found(state, UUID_A, { mode: 'charge', amount: '25.50', now: NOW + 5000 })
		expect(state[UUID_A]).toMatchObject({ verified: true, mode: 'charge', amount: '25.50', lastSeen: NOW + 5000, order: 0 })
		expect(state[UUID_A].server).toEqual({ name: 'Real' })
	})

	test('dedupe across transports: ble does not displace multipeer', () => {
		let state = found(initialPeersState, UUID_A, { transportId: 'multipeer', peerId: 'mp-1' })
		state = found(state, UUID_A, { transportId: 'ble', peerId: 'ble-1', now: NOW + 1000 })
		expect(state[UUID_A].transportId).toBe('multipeer')
		expect(state[UUID_A].peerId).toBe('mp-1')
		expect(state[UUID_A].lastSeen).toBe(NOW + 1000) // still refreshed
	})

	test('dedupe across transports: multipeer takes over from ble', () => {
		let state = found(initialPeersState, UUID_A, { transportId: 'ble', peerId: 'ble-1' })
		state = found(state, UUID_A, { transportId: 'multipeer', peerId: 'mp-1', now: NOW + 1000 })
		expect(state[UUID_A].transportId).toBe('multipeer')
	})
})

describe('server resolution', () => {
	test('SERVER_PROFILE_RESOLVED verifies the peer', () => {
		let state = found(initialPeersState, UUID_A)
		state = peersReducer(state, { type: 'SERVER_PROFILE_RESOLVED', uuid: UUID_A, profile: { uuid: UUID_A, name: 'Real Name' } })
		expect(state[UUID_A].verified).toBe(true)
		expect(selectVerifiedPeers(state)).toHaveLength(1)
	})

	test('SERVER_PROFILE_FAILED drops the peer entirely', () => {
		let state = found(initialPeersState, UUID_A)
		state = peersReducer(state, { type: 'SERVER_PROFILE_FAILED', uuid: UUID_A })
		expect(state[UUID_A]).toBeUndefined()
	})

	test('resolution for an already-lost peer is a no-op', () => {
		const state = peersReducer(initialPeersState, { type: 'SERVER_PROFILE_RESOLVED', uuid: UUID_A, profile: {} })
		expect(state).toEqual(initialPeersState)
	})
})

describe('PEER_LOST / TTL_SWEEP / RESET', () => {
	test('PEER_LOST removes by transport peerId', () => {
		let state = found(initialPeersState, UUID_A, { peerId: 'mp-1' })
		state = peersReducer(state, { type: 'PEER_LOST', peerId: 'mp-1', transportId: 'multipeer' })
		expect(Object.keys(state)).toHaveLength(0)
	})

	test('PEER_LOST from another transport does not remove a deduped peer', () => {
		let state = found(initialPeersState, UUID_A, { transportId: 'multipeer', peerId: 'mp-1' })
		state = peersReducer(state, { type: 'PEER_LOST', peerId: 'ble-1', transportId: 'ble' })
		expect(state[UUID_A]).toBeDefined()
	})

	test('TTL_SWEEP drops only stale peers', () => {
		let state = found(initialPeersState, UUID_A, { now: NOW })
		state = found(state, UUID_B, { now: NOW + 14000 })
		state = peersReducer(state, { type: 'TTL_SWEEP', now: NOW + 16000, ttlMs: 15000 })
		expect(state[UUID_A]).toBeUndefined()
		expect(state[UUID_B]).toBeDefined()
	})

	test('TTL_SWEEP with nothing stale returns the same reference', () => {
		const state = found(initialPeersState, UUID_A, { now: NOW })
		expect(peersReducer(state, { type: 'TTL_SWEEP', now: NOW + 1000, ttlMs: 15000 })).toBe(state)
	})

	test('RESET clears everything', () => {
		const state = found(initialPeersState, UUID_A)
		expect(peersReducer(state, { type: 'RESET' })).toEqual(initialPeersState)
	})
})

describe('selectors', () => {
	test('selectVerifiedPeers keeps arrival order; selectPendingCount counts the rest', () => {
		let state = found(initialPeersState, UUID_A)
		state = found(state, UUID_B)
		state = peersReducer(state, { type: 'SERVER_PROFILE_RESOLVED', uuid: UUID_B, profile: {} })
		expect(selectVerifiedPeers(state).map(p => p.uuid)).toEqual([UUID_B])
		expect(selectPendingCount(state)).toBe(1)
	})
})
