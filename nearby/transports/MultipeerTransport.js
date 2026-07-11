/**
 * Phase 1 transport — Apple MultipeerConnectivity via munim-bluetooth
 * (iOS↔iOS only; Android joins in phase 2 through BleTransport).
 *
 * Design notes:
 * - The self uuid travels in discoveryInfo so both sides can apply the
 *   deterministic anti-invite-storm rule (the lexicographically LOWER uuid
 *   invites) before any session exists. The full announce (mode, charge
 *   amount, avatar hints) is sent as the first message after connecting —
 *   discoveryInfo can't be updated live and is size-limited.
 * - munim-bluetooth has no separate advertise/browse control: the session is
 *   all-or-nothing. pause() therefore keeps the session alive (needed so the
 *   payment_result ack can still reach the chargee while the payer sits in
 *   SendConfirm) and just mutes outbound announces; stop() tears down.
 * - Messages travel hex-encoded (lib contract) — see protocol utf8ToHex.
 */
import { Platform } from 'react-native'
import {
	startMultipeerSession,
	stopMultipeerSession,
	inviteMultipeerPeer,
	sendMultipeerMessage,
	addEventListener,
} from 'munim-bluetooth'
import { SERVICE_TYPE, parseMessage, serializeMessage, utf8ToHex, hexToUtf8 } from '../protocol'

/**
 * Creates the Multipeer NearbyTransport (see useNearbyPeers for the contract).
 * @returns {import('../useNearbyPeers').NearbyTransport}
 */
export const createMultipeerTransport = () => {

	let subscriptions = []
	let currentAnnounce = null
	let selfUuid = null
	let paused = false
	let running = false

	const sendTo = async (msg, peerIds) => {
		const raw = serializeMessage(msg)
		if (!raw) { return false }
		try {
			await sendMultipeerMessage(utf8ToHex(raw), peerIds, true)
			return true
		} catch {
			return false
		}
	}

	return {
		id: 'multipeer',

		isAvailable: async () => Platform.OS === 'ios',

		/**
		 * Starts advertising + browsing simultaneously (mutual radar).
		 * @param {object} opts - { selfUuid, announce, onPeerFound, onPeerLost, onMessage, onStateChange }
		 */
		start: async ({ selfUuid: uuid, announce, onPeerFound, onPeerLost, onMessage, onStateChange }) => {
			if (running) { return }
			running = true
			paused = false
			selfUuid = uuid.toLowerCase()
			currentAnnounce = announce

			subscriptions = [
				addEventListener('multipeerStarted', () => onStateChange('active')),
				addEventListener('multipeerStartFailed', ({ error }) => onStateChange('error', error)),
				addEventListener('multipeerStopped', () => onStateChange('stopped')),

				// Discovery: apply the deterministic invite rule using the uuid
				// exposed in discoveryInfo (fallback: displayName, also the uuid).
				addEventListener('multipeerPeerFound', (peer) => {
					const info = (peer.discoveryInfo || []).find(e => e.key === 'uuid')
					const peerUuid = (info?.value || peer.displayName || '').toLowerCase()
					if (selfUuid < peerUuid) { inviteMultipeerPeer(peer.id) }
				}),

				addEventListener('multipeerPeerLost', ({ peerId }) => onPeerLost(peerId)),

				// Connected → introduce ourselves with the current announce.
				addEventListener('multipeerPeerStateChanged', (peer) => {
					if (peer.state === 'connected' && currentAnnounce) {
						sendTo({ ...currentAnnounce, ts: Date.now() }, [peer.id])
					} else if (peer.state === 'notConnected') {
						onPeerLost(peer.id)
					}
				}),

				addEventListener('multipeerMessageReceived', ({ peerId, value }) => {
					const raw = hexToUtf8(value)
					if (raw === null) { return }
					const msg = parseMessage(raw)
					if (!msg) { return }
					if (msg.t === 'announce') { onPeerFound(peerId, msg) }
					else if (msg.t === 'bye') { onPeerLost(peerId) }
					else { onMessage(peerId, msg) }
				}),
			]

			onStateChange('starting')
			startMultipeerSession({
				serviceType: SERVICE_TYPE,
				displayName: selfUuid,
				discoveryInfo: [{ key: 'uuid', value: selfUuid }],
				autoInvite: false,
				autoAcceptInvitations: true,
				encryptionPreference: 'required',
			})
		},

		/**
		 * Re-broadcasts the announce to every connected peer (e.g. charge mode
		 * toggled). Muted while paused.
		 * @param {object} announce
		 */
		updateAnnounce: (announce) => {
			currentAnnounce = announce
			if (!paused && running) { sendTo({ ...announce, ts: Date.now() }) }
		},

		/**
		 * @param {string} peerId
		 * @param {object} msg
		 * @returns {Promise<boolean>}
		 */
		send: (peerId, msg) => sendTo(msg, [peerId]),

		pause: () => { paused = true },

		resume: () => {
			if (!paused) { return }
			paused = false
			if (running && currentAnnounce) { sendTo({ ...currentAnnounce, ts: Date.now() }) }
		},

		stop: async () => {
			if (!running) { return }
			running = false
			await sendTo({ v: 1, t: 'bye', ts: Date.now() })
			subscriptions.forEach(unsub => unsub())
			subscriptions = []
			currentAnnounce = null
			try { stopMultipeerSession() } catch { /* already stopped */ }
		},
	}
}
