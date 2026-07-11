/**
 * Orchestrator hook for NearbyPay: runs the proximity transports, verifies
 * every announced peer against the server before it reaches the radar, and
 * exposes charge mode + the payment ack channel.
 *
 * Trust model: the proximity channel is 100% untrusted. An announce only
 * tells us WHICH uuid to resolve via userApi.searchUser — the UI renders the
 * server profile exclusively. Peers whose uuid doesn't resolve are dropped.
 *
 * Lifecycle: screen blur → pause (session stays alive so the payment_result
 * ack still flows while the payer sits in SendConfirm); app background or
 * unmount → full stop. Only ever announces while NearbyPay is mounted.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import { userApi } from '../api/userApi'
import playSound from '../helpers/playSound'
import { useSettings } from '../settings/SettingsContext'
import { buildAnnounce, buildPaymentResult, ANNOUNCE_TTL_MS } from './protocol'
import { peersReducer, initialPeersState, selectVerifiedPeers, selectPendingCount } from './peersReducer'
import { getTransports } from './transports'
import { ensureNearbyPermissions } from './permissions'
import { setActiveSession, clearActiveSession } from './session'

const HAPTIC_OPTS = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false }
const TTL_SWEEP_INTERVAL_MS = 5000

/**
 * @typedef {Object} NearbyTransport
 * @property {'multipeer'|'ble'} id
 * @property {() => Promise<boolean>} isAvailable
 * @property {(opts: object) => Promise<void>} start
 * @property {(announce: object) => void} updateAnnounce
 * @property {(peerId: string, msg: object) => Promise<boolean>} send
 * @property {() => void} pause
 * @property {() => void} resume
 * @property {() => Promise<void>} stop
 */

/**
 * @param {object} opts
 * @param {boolean} opts.enabled - Master switch (screen mounted + user ready).
 * @param {object} opts.user - Authenticated user (uuid, username, name, …).
 * @param {(msg: { amount: string, txUuid?: string }) => void} [opts.onPaymentReceived]
 *   Fired when a payer acks a transfer — UNTRUSTED, show "Confirmando…" until
 *   a server balance refetch confirms.
 * @returns {{
 *   state: 'idle'|'starting'|'scanning'|'unavailable'|'permission_denied'|'error',
 *   peers: Array<object>,
 *   pendingCount: number,
 *   chargeMode: { active: boolean, amount: string|null },
 *   startCharging: (amount: string) => void,
 *   stopCharging: () => void,
 * }}
 * The payment ack channel (notifyPaymentSent) is exposed through
 * nearby/session.js instead of the return value, so SendConfirm can reach it
 * without threading props through navigation.
 */
export const useNearbyPeers = ({ enabled, user, onPaymentReceived }) => {

	const [peersState, dispatch] = useReducer(peersReducer, initialPeersState)
	const [state, setState] = useState('idle')
	const [chargeMode, setChargeMode] = useState({ active: false, amount: null })

	const { sounds } = useSettings()
	const transportsRef = useRef([])
	const peersStateRef = useRef(peersState)
	const chargeModeRef = useRef(chargeMode)
	const resolveCacheRef = useRef(new Map()) // uuid → profile | 'pending'
	const callbacksRef = useRef({ onPaymentReceived })
	const soundsRef = useRef(sounds)
	// user/enabled live in refs so startAll keeps a stable identity — a balance
	// refetch mid-session (payment received → updateUser) must NOT restart the
	// transports.
	const userRef = useRef(user)
	const enabledRef = useRef(enabled)

	peersStateRef.current = peersState
	chargeModeRef.current = chargeMode
	callbacksRef.current = { onPaymentReceived }
	soundsRef.current = sounds
	userRef.current = user
	enabledRef.current = enabled

	/** Resolves an announced uuid against the server (cached per session). */
	const resolvePeer = useCallback(async (uuid) => {
		const cache = resolveCacheRef.current
		const cached = cache.get(uuid)
		if (cached === 'pending') { return }
		if (cached) {
			dispatch({ type: 'SERVER_PROFILE_RESOLVED', uuid, profile: cached })
			return
		}
		cache.set(uuid, 'pending')
		const result = await userApi.searchUser(uuid)
		const profile = result.success && Array.isArray(result.data) ? result.data[0] : null
		if (profile && (profile.uuid || '').toLowerCase() === uuid) {
			cache.set(uuid, profile)
			dispatch({ type: 'SERVER_PROFILE_RESOLVED', uuid, profile })
			ReactNativeHapticFeedback.trigger('impactMedium', HAPTIC_OPTS)
		} else {
			cache.delete(uuid)
			dispatch({ type: 'SERVER_PROFILE_FAILED', uuid })
		}
	}, [])

	const currentAnnounce = useCallback(() => {
		const { active, amount } = chargeModeRef.current
		return buildAnnounce(userRef.current, active ? 'charge' : 'browse', amount)
	}, [])

	const stopAll = useCallback(async () => {
		const transports = transportsRef.current
		transportsRef.current = []
		clearActiveSession()
		dispatch({ type: 'RESET' })
		setState('idle')
		await Promise.all(transports.map(tr => tr.stop()))
	}, [])

	const startAll = useCallback(async () => {
		if (transportsRef.current.length > 0) { return }
		setState('starting')

		const permission = await ensureNearbyPermissions()
		if (permission !== 'granted') {
			setState(permission === 'denied' ? 'permission_denied' : 'unavailable')
			return
		}

		const available = []
		for (const transport of getTransports()) {
			if (await transport.isAvailable()) { available.push(transport) }
		}
		if (available.length === 0) {
			setState('unavailable')
			return
		}
		transportsRef.current = available

		const selfUuid = (userRef.current?.uuid || '').toLowerCase()

		await Promise.all(available.map(transport => transport.start({
			selfUuid,
			announce: currentAnnounce(),

			onPeerFound: (peerId, announce) => {
				if (announce.uuid === selfUuid) { return }
				dispatch({ type: 'PEER_ANNOUNCE', peerId, transportId: transport.id, announce, now: Date.now() })
				resolvePeer(announce.uuid)
			},

			onPeerLost: (peerId) => dispatch({ type: 'PEER_LOST', peerId, transportId: transport.id }),

			onMessage: (peerId, msg) => {
				if (msg.t === 'payment_result') {
					if (soundsRef.current?.enabled && soundsRef.current?.transactionSound) { playSound('money_in') }
					ReactNativeHapticFeedback.trigger('notificationSuccess', HAPTIC_OPTS)
					callbacksRef.current.onPaymentReceived?.(msg)
				} else if (msg.t === 'charge_update') {
					const entry = Object.values(peersStateRef.current).find(p => p.peerId === peerId && p.transportId === transport.id)
					if (entry) {
						dispatch({
							type: 'PEER_ANNOUNCE', peerId, transportId: transport.id, now: Date.now(),
							announce: { ...entry.announced, mode: msg.amount ? 'charge' : 'browse', amount: msg.amount },
						})
					}
				}
			},

			onStateChange: (transportState) => {
				if (transportState === 'active') { setState('scanning') }
				else if (transportState === 'error') { setState('error') }
			},
		})))

		setActiveSession({
			notifyPaymentSent: ({ toUuid, amount, txUuid }) => {
				const uuid = (toUuid || '').toLowerCase()
				const peer = peersStateRef.current[uuid]
				if (!peer) { return }
				const transport = transportsRef.current.find(tr => tr.id === peer.transportId)
				transport?.send(peer.peerId, buildPaymentResult({ amount, txUuid }))
			},
		})
	}, [currentAnnounce, resolvePeer])

	// Master switch: mount/user readiness. Keyed on uuid (not the user object)
	// so a balance refetch mid-session never restarts the transports.
	useEffect(() => {
		if (enabled && user?.uuid) { startAll() }
		return () => { stopAll() }
	}, [enabled, user?.uuid, startAll, stopAll])

	// Blur → pause (mute announces, keep the ack channel); focus → resume.
	useFocusEffect(useCallback(() => {
		transportsRef.current.forEach(tr => tr.resume())
		return () => transportsRef.current.forEach(tr => tr.pause())
	}, []))

	// Background → full teardown (privacy: never announce from the background);
	// restart on return while the screen is still mounted.
	useEffect(() => {
		const sub = AppState.addEventListener('change', (next) => {
			if (next === 'background') { stopAll() }
			else if (next === 'active' && enabledRef.current && userRef.current?.uuid) { startAll() }
		})
		return () => sub.remove()
	}, [stopAll, startAll])

	// TTL sweep — BLE peer-lost events are unreliable; Multipeer benefits too.
	useEffect(() => {
		const interval = setInterval(() => {
			dispatch({ type: 'TTL_SWEEP', now: Date.now(), ttlMs: ANNOUNCE_TTL_MS })
		}, TTL_SWEEP_INTERVAL_MS)
		return () => clearInterval(interval)
	}, [])

	const startCharging = useCallback((amount) => {
		setChargeMode({ active: true, amount })
		chargeModeRef.current = { active: true, amount }
		transportsRef.current.forEach(tr => tr.updateAnnounce(currentAnnounce()))
	}, [currentAnnounce])

	const stopCharging = useCallback(() => {
		setChargeMode({ active: false, amount: null })
		chargeModeRef.current = { active: false, amount: null }
		transportsRef.current.forEach(tr => tr.updateAnnounce(currentAnnounce()))
	}, [currentAnnounce])

	return {
		state,
		peers: selectVerifiedPeers(peersState),
		pendingCount: selectPendingCount(peersState),
		chargeMode,
		startCharging,
		stopCharging,
	}
}
