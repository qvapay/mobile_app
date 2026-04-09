import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { userApi } from '../api/userApi'

const HEARTBEAT_INTERVAL = 60000 // 60 seconds

const OnlineStatusContext = createContext(null)

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

	// AppState: pause in background, resume on foreground
	useEffect(() => {
		const subscription = AppState.addEventListener('change', (nextState) => {
			if (appStateRef.current !== 'active' && nextState === 'active') {
				startHeartbeat()
			} else if (appStateRef.current === 'active' && nextState !== 'active') {
				stopHeartbeat()
			}
			appStateRef.current = nextState
		})
		return () => {
			subscription.remove()
			stopHeartbeat()
		}
	}, [startHeartbeat, stopHeartbeat])

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

	const untrackUsers = useCallback((userIds) => {
		if (!userIds) return
		const ids = Array.isArray(userIds) ? userIds : [userIds]
		ids.forEach(id => {
			if (id) trackedUsersRef.current.delete(id)
		})
	}, [])

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

export function useOnlineStatus() {
	const context = useContext(OnlineStatusContext)
	if (!context) {
		return {
			statuses: {},
			trackUsers: () => {},
			untrackUsers: () => {},
			isUserOnline: () => false,
			refreshStatuses: () => {},
		}
	}
	return context
}
