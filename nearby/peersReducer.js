/**
 * Peer-state reducer for NearbyPay — pure module, no RN imports.
 *
 * State is a map `uuid → peer` where a peer only becomes visible on the radar
 * (`verified: true`) after its uuid resolves against the server via
 * userApi.searchUser — the announce itself is untrusted and never rendered
 * as identity. Dedupe across transports (phase 2): a channel with messaging
 * (multipeer) wins over ble for the same uuid.
 */

/** Transport preference when the same user is reachable through several. */
const TRANSPORT_PRIORITY = { multipeer: 2, ble: 1 }

export const initialPeersState = {}

/**
 * @typedef {Object} NearbyPeer
 * @property {string} uuid - Lowercased user uuid (dedupe key).
 * @property {string} peerId - Transport-level peer identifier.
 * @property {string} transportId - 'multipeer' | 'ble'.
 * @property {object} announced - Last valid announce payload (UNTRUSTED).
 * @property {object|null} server - Server-resolved profile (what the UI renders).
 * @property {boolean} verified - True once `server` is set.
 * @property {'browse'|'charge'} mode
 * @property {string|null} amount - Charge amount when mode === 'charge'.
 * @property {number} lastSeen - Epoch ms of the last announce/message.
 * @property {number|null} distance - Phase 3: UWB meters.
 * @property {number} order - Arrival index (stable radar ring slot).
 */

/**
 * Reducer actions:
 *   PEER_ANNOUNCE            { peerId, transportId, announce, now }
 *   PEER_LOST                { peerId, transportId }
 *   SERVER_PROFILE_RESOLVED  { uuid, profile }
 *   SERVER_PROFILE_FAILED    { uuid }
 *   PEER_DISTANCE            { uuid, distance }
 *   TTL_SWEEP                { now, ttlMs }
 *   RESET                    {}
 *
 * @param {Object<string, NearbyPeer>} state
 * @param {{ type: string, [key: string]: * }} action
 * @returns {Object<string, NearbyPeer>}
 */
export const peersReducer = (state, action) => {
	
	switch (action.type) {

		case 'PEER_ANNOUNCE': {
			const { peerId, transportId, announce, now } = action
			const uuid = announce.uuid
			const existing = state[uuid]

			// Same user through a lower-priority transport → only refresh lastSeen.
			if (existing && existing.transportId !== transportId &&
				(TRANSPORT_PRIORITY[existing.transportId] || 0) >= (TRANSPORT_PRIORITY[transportId] || 0)) {
				return { ...state, [uuid]: { ...existing, lastSeen: now } }
			}

			const order = existing ? existing.order : Object.keys(state).length
			return {
				...state,
				[uuid]: {
					uuid,
					peerId,
					transportId,
					announced: announce,
					server: existing ? existing.server : null,
					verified: existing ? existing.verified : false,
					mode: announce.mode,
					amount: announce.mode === 'charge' ? announce.amount : null,
					lastSeen: now,
					distance: existing ? existing.distance : null,
					order,
				},
			}
		}

		case 'PEER_LOST': {
			const { peerId, transportId } = action
			const entry = Object.values(state).find(p => p.peerId === peerId && p.transportId === transportId)
			if (!entry) { return state }
			const next = { ...state }
			delete next[entry.uuid]
			return next
		}

		case 'SERVER_PROFILE_RESOLVED': {
			const { uuid, profile } = action
			const existing = state[uuid]
			if (!existing) { return state }
			return { ...state, [uuid]: { ...existing, server: profile, verified: true } }
		}

		case 'SERVER_PROFILE_FAILED': {
			// Unresolvable uuid never reaches the radar — drop it entirely.
			const { uuid } = action
			if (!state[uuid]) { return state }
			const next = { ...state }
			delete next[uuid]
			return next
		}

		case 'PEER_DISTANCE': {
			const { uuid, distance } = action
			const existing = state[uuid]
			if (!existing) { return state }
			return { ...state, [uuid]: { ...existing, distance } }
		}

		case 'TTL_SWEEP': {
			const { now, ttlMs } = action
			const stale = Object.values(state).filter(p => now - p.lastSeen > ttlMs)
			if (stale.length === 0) { return state }
			const next = { ...state }
			stale.forEach(p => delete next[p.uuid])
			return next
		}

		case 'RESET':
			return initialPeersState

		default:
			return state
	}
}

/**
 * Verified peers in stable arrival order — what the radar renders.
 * @param {Object<string, NearbyPeer>} state
 * @returns {Array<NearbyPeer>}
 */
export const selectVerifiedPeers = (state) => Object.values(state).filter(p => p.verified).sort((a, b) => a.order - b.order)

/**
 * Count of peers found but not yet server-resolved (UI: "resolviendo…").
 * @param {Object<string, NearbyPeer>} state
 * @returns {number}
 */
export const selectPendingCount = (state) => Object.values(state).filter(p => !p.verified).length
