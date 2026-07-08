import { useState, useEffect, useRef } from "react"
import { AppState } from "react-native"
import EventSource from "react-native-sse"

import config from "../../config"
import { getAuthToken } from "../../api/client"

// Mirrors the web fallback scheme (app/(dashboard)/p2p/[uuid]/chat.js in qpweb)
const INIT_TIMEOUT_MS = 5000 // no `init` event within this window → assume the stream is down
const FALLBACK_POLL_MS = 10000 // poll cadence while the stream is down
const SSE_RETRY_MS = 60000 // how long to poll before attempting the stream again

const ACTIVE_STATUSES = ["open", "processing", "paid"]

/**
 * Real-time P2P chat over SSE (`GET /p2p/{uuid}/chat/stream`, Redis-backed).
 * The stream only pushes NEW messages — history still loads via `getChat`.
 * Falls back to 10s polling when the stream is unavailable and retries it every 60s.
 *
 * @param {string} p2p_uuid - Offer UUID.
 * @param {string|undefined} status - Current offer status; the stream only runs on active statuses.
 * @param {function} appendMessage - From useP2PChat: appends one message with id dedup.
 * @param {function} fetchChat - From useP2PChat: full history refetch (used for catch-up + fallback).
 * @param {object} connectedRef - Screen-owned ref mirroring the connected state, so the
 *   offer-detail 5s interval can skip its chat fetch without re-creating itself.
 * @returns {{ isStreamConnected: boolean }}
 */
export default function useP2PChatSSE({ p2p_uuid, status, appendMessage, fetchChat, connectedRef }) {

	const [isStreamConnected, setIsStreamConnected] = useState(false)

	// Keep callbacks in refs so the connection effect only depends on uuid + activity
	const appendMessageRef = useRef(appendMessage)
	const fetchChatRef = useRef(fetchChat)
	useEffect(() => {
		appendMessageRef.current = appendMessage
		fetchChatRef.current = fetchChat
	}, [appendMessage, fetchChat])

	const isActive = ACTIVE_STATUSES.includes(status)

	useEffect(() => {
		if (!p2p_uuid || !isActive) return

		let es = null
		let pollInterval = null
		let initTimeout = null
		let retryTimeout = null
		let cancelled = false
		let appActive = AppState.currentState === "active"

		const setConnected = (value) => {
			if (connectedRef) connectedRef.current = value
			if (!cancelled) setIsStreamConnected(value)
		}

		const startPolling = () => {
			if (pollInterval) return
			pollInterval = setInterval(() => { fetchChatRef.current?.() }, FALLBACK_POLL_MS)
		}
		const stopPolling = () => {
			clearInterval(pollInterval)
			pollInterval = null
		}
		const clearTimers = () => {
			clearTimeout(initTimeout)
			clearTimeout(retryTimeout)
			initTimeout = null
			retryTimeout = null
		}
		const closeStream = () => {
			clearTimeout(initTimeout)
			initTimeout = null
			const dying = es
			es = null
			if (dying) {
				// Deferred one tick: react-native-sse schedules its internal reconnect timer
				// right AFTER dispatching 'error' (and the server's `retry: 10000` overrides our
				// pollingInterval: 0). Closing synchronously inside the error listener would let
				// that timer survive close() and spawn a zombie stream; a tick later, close()
				// clears it for good.
				setTimeout(() => {
					dying.removeAllEventListeners()
					dying.close()
				}, 0)
			}
			setConnected(false)
		}

		// Stream is down: poll while waiting, retry the stream after a pause
		const fallbackToPolling = () => {
			closeStream()
			if (cancelled || !appActive) return
			startPolling()
			if (!retryTimeout) {
				retryTimeout = setTimeout(() => {
					retryTimeout = null
					connectSSE()
				}, SSE_RETRY_MS)
			}
		}

		const connectSSE = async () => {
			if (cancelled || !appActive || es) return
			const token = await getAuthToken()
			if (cancelled || !appActive || es) return

			es = new EventSource(`${config.API_BASE_URL}/p2p/${p2p_uuid}/chat/stream`, {
				headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
				pollingInterval: 0, // disable the library's auto-reconnect — retries are ours
			})

			initTimeout = setTimeout(fallbackToPolling, INIT_TIMEOUT_MS)

			es.addEventListener("init", () => {
				clearTimeout(initTimeout)
				initTimeout = null
				stopPolling()
				setConnected(true)
				// Catch up on anything sent between the history load / fallback window and now
				fetchChatRef.current?.()
			})

			es.addEventListener("message", (event) => {
				try { appendMessageRef.current?.(JSON.parse(event.data)) } catch { /* ignore malformed */ }
			})

			es.addEventListener("error", fallbackToPolling)
		}

		connectSSE()

		// Close the stream while backgrounded; catch up and reconnect on foreground
		const appStateSub = AppState.addEventListener("change", (nextState) => {
			if (nextState === "active" && !appActive) {
				appActive = true
				stopPolling()
				clearTimers()
				fetchChatRef.current?.()
				connectSSE()
			} else if (/inactive|background/.test(nextState) && appActive) {
				appActive = false
				closeStream()
				stopPolling()
				clearTimers()
			}
		})

		return () => {
			cancelled = true
			appStateSub.remove()
			clearTimers()
			stopPolling()
			closeStream()
			setIsStreamConnected(false)
		}
	}, [p2p_uuid, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

	return { isStreamConnected }
}
