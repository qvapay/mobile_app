import { createContext, use, useState, useEffect, useEffectEvent, useCallback, useRef } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { userApi } from '../api/userApi'

const HEARTBEAT_INTERVAL = 60000 // 60 seconds

const OnlineStatusContext = createContext(null)

/**
 * Online presence for P2P peers and chats, driven by a 60s heartbeat.
 *
 * Each beat is a silent `POST /user/heartbeat` that both reports "I'm online"
 * and asks for the status of every tracked peer (screens register peers with
 * `trackUsers`; adding a NEW id fires an immediate extra beat so their dot
 * doesn't wait a full minute). The interval pauses while the app is
 * backgrounded (AppState listener), resumes on foreground, and only runs
 * while authenticated — logout stops it and clears all statuses.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function OnlineStatusProvider({ children }) {

	const { isAuthenticated } = useAuth()
	const [statuses, setStatuses] = useState({})
	const trackedUsersRef = useRef(new Set())
	const intervalRef = useRef(null)
	const appStateRef = useRef(AppState.currentState)

	const sendHeartbeat = useCallback(async () => {
		if (!isAuthenticated) return
		const trackedUserIds = Array.from(trackedUsersRef.current)
		const result = await userApi.heartbeat(trackedUserIds)
		if (result.success && result.data?.statuses) {
			setStatuses(result.data.statuses)
		}
	}, [isAuthenticated])

	const startHeartbeat = useCallback(() => {
		sendHeartbeat()
		if (intervalRef.current) clearInterval(intervalRef.current)
		intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)
	}, [sendHeartbeat])

	const stopHeartbeat = useCallback(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current)
			intervalRef.current = null
		}
	}, [])

	// Effect Event: always sees the latest start/stop callbacks without making
	// the AppState effect re-subscribe when they change (e.g. on auth flips)
	const onAppStateChange = useEffectEvent((nextState) => {
		if (appStateRef.current !== 'active' && nextState === 'active') {
			startHeartbeat()
		} else if (appStateRef.current === 'active' && nextState !== 'active') {
			stopHeartbeat()
		}
		appStateRef.current = nextState
	})

	// AppState: pause in background, resume on foreground
	useEffect(() => {
		const subscription = AppState.addEventListener('change', (nextState) => onAppStateChange(nextState))
		return () => {
			subscription.remove()
			stopHeartbeat()
		}
	}, [stopHeartbeat])

	// Auth gating: start/stop heartbeat based on auth state
	useEffect(() => {
		if (isAuthenticated) {
			startHeartbeat()
		} else {
			stopHeartbeat()
			setStatuses({})
		}
		return () => stopHeartbeat()
	}, [isAuthenticated, startHeartbeat, stopHeartbeat])

	/**
	 * Starts tracking one or more user ids (kept in a ref Set — surviving
	 * re-renders without restarting the interval). New ids trigger an
	 * immediate heartbeat so their status shows up right away.
	 *
	 * @param {string|string[]} userIds - Single id or array of ids.
	 */
	const trackUsers = useCallback((userIds) => {
		if (!userIds) return
		const ids = Array.isArray(userIds) ? userIds : [userIds]
		let hasNew = false
		ids.forEach(id => {
			if (id && !trackedUsersRef.current.has(id)) {
				trackedUsersRef.current.add(id)
				hasNew = true
			}
		})
		if (hasNew) sendHeartbeat()
	}, [sendHeartbeat])

	/**
	 * Stops tracking user ids (call on screen unmount to keep the
	 * heartbeat payload small). Their last known status is kept until
	 * the next beat replaces the map.
	 *
	 * @param {string|string[]} userIds - Single id or array of ids.
	 */
	const untrackUsers = useCallback((userIds) => {
		if (!userIds) return
		const ids = Array.isArray(userIds) ? userIds : [userIds]
		ids.forEach(id => {
			if (id) trackedUsersRef.current.delete(id)
		})
	}, [])

	/**
	 * Whether a user was online as of the last heartbeat.
	 *
	 * @param {string} userId
	 * @returns {boolean}
	 */
	const isUserOnline = useCallback((userId) => {
		if (!userId) return false
		return statuses[userId] === true
	}, [statuses])

	const value = { statuses, trackUsers, untrackUsers, isUserOnline, refreshStatuses: sendHeartbeat }

	return (
		<OnlineStatusContext.Provider value={value}>
			{children}
		</OnlineStatusContext.Provider>
	)
}

/**
 * Consumes the online-status context. Unlike the other context hooks, this one
 * does NOT throw outside its provider — it returns inert no-ops instead, so
 * shared components (avatars, chat rows) can render anywhere safely.
 *
 * @returns {{
 *   statuses: Object<string, boolean>,
 *   trackUsers: (userIds: string|string[]) => void,
 *   untrackUsers: (userIds: string|string[]) => void,
 *   isUserOnline: (userId: string) => boolean,
 *   refreshStatuses: () => Promise<void>,
 * }}
 */
export function useOnlineStatus() {
	const context = use(OnlineStatusContext)
	if (!context) {
		return {
			statuses: {},
			trackUsers: () => { },
			untrackUsers: () => { },
			isUserOnline: () => false,
			refreshStatuses: () => { },
		}
	}
	return context
}
