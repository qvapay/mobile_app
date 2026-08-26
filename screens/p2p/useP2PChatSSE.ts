import { useState, useEffect, useRef } from "react"
import type { MutableRefObject } from "react"
import { AppState } from "react-native"
import EventSource from "react-native-sse"

import config from "../../config"
import { getAuthToken } from "../../api/client"

import type { ChatMessage } from "./useP2PChat"

/** Tipos de evento propios del stream (además de los estándar de react-native-sse). */
type ChatStreamEvent = "init"

/** Dependencias inyectadas en el gestor imperativo del stream. */
type ChatStreamParams = {
	p2p_uuid: string
	setConnected: (value: boolean) => void
	fetchChat: () => void
	appendMessage: (message: ChatMessage) => void
}

// Mirrors the web fallback scheme (app/(dashboard)/p2p/[uuid]/chat.js in qpweb)
const INIT_TIMEOUT_MS = 5000 // no `init` event within this window → assume the stream is down
const FALLBACK_POLL_MS = 10000 // poll cadence while the stream is down
const SSE_RETRY_MS = 60000 // how long to poll before attempting the stream again

const ACTIVE_STATUSES = ["open", "processing", "paid"]

/**
 * Imperative chat-stream manager: opens the SSE connection, owns every timer
 * and listener of the reconnect/fallback state machine, and tears them all
 * down in `dispose()`. Lives outside the hook so the effect owns a single
 * resource with a single cleanup.
 *
 * @param params.p2p_uuid - Offer UUID.
 * @param params.setConnected - Receives the stream-connected boolean.
 * @param params.fetchChat - Full history refetch (catch-up + fallback poll).
 * @param params.appendMessage - Appends one parsed message.
 */
function openChatStream({ p2p_uuid, setConnected, fetchChat, appendMessage }: ChatStreamParams): { dispose: () => void } {

	let es: EventSource<ChatStreamEvent> | null = null
	let pollInterval: ReturnType<typeof setInterval> | null = null
	let initTimeout: ReturnType<typeof setTimeout> | null = null
	let retryTimeout: ReturnType<typeof setTimeout> | null = null
	let disposeTimer: ReturnType<typeof setTimeout> | null = null
	let dyingEs: EventSource<ChatStreamEvent> | null = null
	let disposed = false
	let appActive = AppState.currentState === "active"

	const emitConnected = (value: boolean) => {
		if (!disposed) setConnected(value)
	}

	const startPolling = () => {
		if (pollInterval) return
		pollInterval = setInterval(() => { fetchChat() }, FALLBACK_POLL_MS)
	}
	const stopPolling = () => {
		clearInterval(pollInterval as ReturnType<typeof setInterval>)
		pollInterval = null
	}
	const clearTimers = () => {
		clearTimeout(initTimeout as ReturnType<typeof setTimeout>)
		clearTimeout(retryTimeout as ReturnType<typeof setTimeout>)
		initTimeout = null
		retryTimeout = null
	}
	const disposeStream = (stream: EventSource<ChatStreamEvent>) => {
		stream.removeAllEventListeners()
		stream.close()
	}
	const closeStream = () => {
		clearTimeout(initTimeout as ReturnType<typeof setTimeout>)
		initTimeout = null
		const dying = es
		es = null
		if (dying) {
			// Deferred one tick: react-native-sse schedules its internal reconnect timer
			// right AFTER dispatching 'error' (and the server's `retry: 10000` overrides our
			// pollingInterval: 0). Closing synchronously inside the error listener would let
			// that timer survive close() and spawn a zombie stream; a tick later, close()
			// clears it for good. The timer is tracked in `disposeTimer` so dispose() can
			// flush it synchronously (dispose never runs inside the error dispatch).
			dyingEs = dying
			disposeTimer = setTimeout(() => {
				disposeTimer = null
				if (dyingEs === dying) dyingEs = null
				disposeStream(dying)
			}, 0)
		}
		emitConnected(false)
	}

	// Stream is down: poll while waiting, retry the stream after a pause
	const fallbackToPolling = () => {
		closeStream()
		if (disposed || !appActive) return
		startPolling()
		if (!retryTimeout) {
			retryTimeout = setTimeout(() => {
				retryTimeout = null
				connectSSE()
			}, SSE_RETRY_MS)
		}
	}

	const onInit = () => {
		clearTimeout(initTimeout as ReturnType<typeof setTimeout>)
		initTimeout = null
		stopPolling()
		emitConnected(true)
		// Catch up on anything sent between the history load / fallback window and now
		fetchChat()
	}

	const onMessage = (event: { data?: string | null }) => {
		try { appendMessage(JSON.parse(event.data as string)) } catch { /* ignore malformed */ }
	}

	const connectSSE = async () => {
		if (disposed || !appActive || es) return
		const token = await getAuthToken()
		if (disposed || !appActive || es) return

		es = new EventSource(`${config.API_BASE_URL}/p2p/${p2p_uuid}/chat/stream`, {
			headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
			pollingInterval: 0, // disable the library's auto-reconnect — retries are ours
		})

		initTimeout = setTimeout(fallbackToPolling, INIT_TIMEOUT_MS)

		es.addEventListener("init", onInit)
		es.addEventListener("message", onMessage)
		es.addEventListener("error", fallbackToPolling)
	}

	connectSSE()

	// Close the stream while backgrounded; catch up and reconnect on foreground
	const appStateSub = AppState.addEventListener("change", (nextState) => {
		if (nextState === "active" && !appActive) {
			appActive = true
			stopPolling()
			clearTimers()
			fetchChat()
			connectSSE()
		} else if (/inactive|background/.test(nextState) && appActive) {
			appActive = false
			closeStream()
			stopPolling()
			clearTimers()
		}
	})

	const dispose = () => {
		disposed = true
		appStateSub.remove()
		clearTimers()
		stopPolling()
		clearTimeout(disposeTimer as ReturnType<typeof setTimeout>)
		disposeTimer = null
		// dispose() never runs inside the stream's `error` dispatch, so the deferred-
		// close dance isn't needed here — flush any dying stream synchronously.
		if (dyingEs) { disposeStream(dyingEs); dyingEs = null }
		if (es) { disposeStream(es); es = null }
	}

	return { dispose }
}

/**
 * Real-time P2P chat over SSE (`GET /p2p/{uuid}/chat/stream`, Redis-backed).
 * The stream only pushes NEW messages — history still loads via `getChat`.
 * Falls back to 10s polling when the stream is unavailable and retries it every 60s.
 *
 * @param params.p2p_uuid - Offer UUID.
 * @param params.status - Current offer status; the stream only runs on active statuses.
 * @param params.appendMessage - From useP2PChat: appends one message with id dedup.
 * @param params.fetchChat - From useP2PChat: full history refetch (used for catch-up + fallback).
 * @param params.connectedRef - Screen-owned ref mirroring the connected state, so the
 *   offer-detail 5s interval can skip its chat fetch without re-creating itself.
 */
export default function useP2PChatSSE({ p2p_uuid, status, appendMessage, fetchChat, connectedRef }: {
	p2p_uuid: string
	status?: string
	appendMessage: (message: ChatMessage) => void
	fetchChat: () => void
	connectedRef?: MutableRefObject<boolean>
}): { isStreamConnected: boolean } {

	const [isStreamConnected, setIsStreamConnected] = useState(false)

	// Keep callbacks in refs so the connection effect only depends on uuid + activity
	const appendMessageRef = useRef(appendMessage)
	const fetchChatRef = useRef(fetchChat)
	useEffect(() => {
		appendMessageRef.current = appendMessage
		fetchChatRef.current = fetchChat
	}, [appendMessage, fetchChat])

	const isActive = ACTIVE_STATUSES.includes(status as string)

	useEffect(() => {
		if (!p2p_uuid || !isActive) return

		const stream = openChatStream({
			p2p_uuid,
			setConnected: (value) => {
				if (connectedRef) connectedRef.current = value
				setIsStreamConnected(value)
			},
			fetchChat: () => { fetchChatRef.current?.() },
			appendMessage: (message) => { appendMessageRef.current?.(message) },
		})

		return () => {
			stream.dispose()
			if (connectedRef) connectedRef.current = false
			setIsStreamConnected(false)
		}
	}, [p2p_uuid, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

	return { isStreamConnected }
}
