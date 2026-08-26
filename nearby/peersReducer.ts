/**
 * Peer-state reducer for NearbyPay — pure module, no RN imports.
 *
 * State is a map `uuid → peer` where a peer only becomes visible on the radar
 * (`verified: true`) after its uuid resolves against the server via
 * userApi.searchUser — the announce itself is untrusted and never rendered
 * as identity. Dedupe across transports (phase 2): a channel with messaging
 * (multipeer) wins over ble for the same uuid.
 */
import type { AnnounceMessage, NearbyMode } from './protocol'

/** Transport identifiers, in messaging-priority order. */
export type TransportId = 'multipeer' | 'ble'

/** Transport preference when the same user is reachable through several. */
const TRANSPORT_PRIORITY: Record<TransportId, number> = { multipeer: 2, ble: 1 }

export type NearbyPeer = {
	/** Lowercased user uuid (dedupe key). */
	uuid: string
	/** Transport-level peer identifier. */
	peerId: string
	/** 'multipeer' | 'ble'. */
	transportId: TransportId
	/** Last valid announce payload (UNTRUSTED). */
	announced: AnnounceMessage
	/** Server-resolved profile (what the UI renders). */
	server: Record<string, unknown> | null
	/** True once `server` is set. */
	verified: boolean
	mode: NearbyMode
	/** Charge amount when mode === 'charge'. */
	amount: string | null
	/** Epoch ms of the last announce/message. */
	lastSeen: number
	/** Phase 3: UWB meters. */
	distance: number | null
	/** Arrival index (stable radar ring slot). */
	order: number
}

/** Map `uuid → peer`. */
export type PeersState = Record<string, NearbyPeer>

/** Discriminated union of every reducer action. */
export type PeersAction =
	| { type: 'PEER_ANNOUNCE', peerId: string, transportId: TransportId, announce: AnnounceMessage, now: number }
	| { type: 'PEER_LOST', peerId: string, transportId: TransportId }
	| { type: 'SERVER_PROFILE_RESOLVED', uuid: string, profile: Record<string, unknown> }
	| { type: 'SERVER_PROFILE_FAILED', uuid: string }
	| { type: 'PEER_DISTANCE', uuid: string, distance: number }
	| { type: 'TTL_SWEEP', now: number, ttlMs: number }
	| { type: 'RESET' }

export const initialPeersState: PeersState = {}

export const peersReducer = (state: PeersState, action: PeersAction): PeersState => {

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
					amount: announce.mode === 'charge' ? (announce.amount as string | null) : null,
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
 */
export const selectVerifiedPeers = (state: PeersState): NearbyPeer[] => Object.values(state).filter(p => p.verified).sort((a, b) => a.order - b.order)

/**
 * Count of peers found but not yet server-resolved (UI: "resolviendo…").
 */
export const selectPendingCount = (state: PeersState): number => Object.values(state).filter(p => !p.verified).length
