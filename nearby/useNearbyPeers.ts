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
import type { AnnounceMessage, AnnounceUser, NearbyMessage, PaymentResultMessage } from './protocol'
import { peersReducer, initialPeersState, selectVerifiedPeers, selectPendingCount } from './peersReducer'
import type { TransportId } from './peersReducer'
import { getTransports } from './transports'
import { ensureNearbyPermissions } from './permissions'
import { setActiveSession, clearActiveSession } from './session'

const HAPTIC_OPTS = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false }
const TTL_SWEEP_INTERVAL_MS = 5000

/** Options a transport's `start` receives from the hook. */
export type NearbyTransportStartOpts = {
	selfUuid: string
	announce: AnnounceMessage
	onPeerFound: (peerId: string, announce: AnnounceMessage) => void
	onPeerLost: (peerId: string) => void
	onMessage: (peerId: string, msg: NearbyMessage) => void
	onStateChange: (transportState: string, error?: unknown) => void
}

/** Contract every proximity transport implements (Multipeer today, BLE in phase 2). */
export type NearbyTransport = {
	id: TransportId
	isAvailable: () => Promise<boolean>
	start: (opts: NearbyTransportStartOpts) => Promise<void>
	updateAnnounce: (announce: AnnounceMessage) => void
	send: (peerId: string, msg: NearbyMessage) => Promise<boolean>
	pause: () => void
	resume: () => void
	stop: () => Promise<void>
}

/** Radar session state exposed to the NearbyPay screen. */
export type NearbySessionState = 'idle' | 'starting' | 'scanning' | 'unavailable' | 'permission_denied' | 'error'

type ChargeMode = { active: boolean, amount: string | null }

type UseNearbyPeersOpts = {
	/** Master switch (screen mounted + user ready). */
	enabled: boolean
	/** Authenticated user (uuid, username, name, …). */
	user: AnnounceUser | null | undefined
	/**
	 * Fired when a payer acks a transfer — UNTRUSTED, show "Confirmando…" until
	 * a server balance refetch confirms.
	 */
	onPaymentReceived?: (msg: PaymentResultMessage) => void
}

/**
 * Runs the NearbyPay radar session.
 *
 * Returns the session state, the verified peers (arrival order), the count of
 * peers still resolving, and the charge-mode controls.
 * The payment ack channel (notifyPaymentSent) is exposed through
 * nearby/session.js instead of the return value, so SendConfirm can reach it
 * without threading props through navigation.
 */
export const useNearbyPeers = ({ enabled, user, onPaymentReceived }: UseNearbyPeersOpts) => {

	const [peersState, dispatch] = useReducer(peersReducer, initialPeersState)
	const [state, setState] = useState<NearbySessionState>('idle')
	const [chargeMode, setChargeMode] = useState<ChargeMode>({ active: false, amount: null })

	const { sounds } = useSettings()
	const transportsRef = useRef<NearbyTransport[]>([])
	const peersStateRef = useRef(peersState)
	const chargeModeRef = useRef(chargeMode)
	const resolveCacheRef = useRef(new Map<string, Record<string, unknown> | 'pending'>()) // uuid → profile | 'pending'
	const callbacksRef = useRef({ onPaymentReceived })
	const soundsRef = useRef(sounds)
	// user/enabled live in refs so startAll keeps a stable identity — a balance
	// refetch mid-session (payment received → updateUser) must NOT restart the
	// transports.
	const userRef = useRef(user)
	const enabledRef = useRef(enabled)

	// Espejo de los valores frescos para los callbacks de identidad estable. Va
	// en un EFECTO y no en el cuerpo del render: React puede descartar o repetir
	// un render, y escribir el ref desde uno que nunca llega a commit dejaría el
	// ref con un valor que la UI jamás mostró.
	// Declarado ANTES que el resto de efectos del hook, así que los que leen
	// estos refs (AppState, foco, transportes) siguen viendo el valor del commit.
	useEffect(() => {
		peersStateRef.current = peersState
		chargeModeRef.current = chargeMode
		callbacksRef.current = { onPaymentReceived }
		soundsRef.current = sounds
		userRef.current = user
		enabledRef.current = enabled
	})

	/** Resolves an announced uuid against the server (cached per session). */
	const resolvePeer = useCallback(async (uuid: string) => {
		const cache = resolveCacheRef.current
		const cached = cache.get(uuid)
		if (cached === 'pending') { return }
		if (cached) {
			dispatch({ type: 'SERVER_PROFILE_RESOLVED', uuid, profile: cached })
			return
		}
		cache.set(uuid, 'pending')
		const result = await userApi.searchUser(uuid)
		const profile = (result.success && Array.isArray(result.data) ? result.data[0] : null) as Record<string, unknown> | null
		if (profile && ((profile.uuid as string | undefined) || '').toLowerCase() === uuid) {
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
		return buildAnnounce(userRef.current as AnnounceUser, active ? 'charge' : 'browse', amount)
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

		const transports = getTransports() as NearbyTransport[]
		const availability = await Promise.all(transports.map(transport => transport.isAvailable()))
		const available = transports.filter((_, i) => availability[i])
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

	const startCharging = useCallback((amount: string) => {
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
