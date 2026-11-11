import { useState, useEffect, useRef } from "react"
import type { MutableRefObject } from "react"
import { AppState } from "react-native"
import EventSource from "react-native-sse"

import { getApiBaseUrl } from "../../api/apiHost"
import { getAuthToken } from "../../api/client"

import { isRefusalStatus } from "./p2pPolling"
import type { ChatMessage } from "./useP2PChat"

/** Tipos de evento propios del stream (además de los estándar de react-native-sse). */
type ChatStreamEvent = "init"

/** Lo que react-native-sse entrega en `error` (`xhrStatus` = 0 en un corte de red). */
type ChatStreamError = { xhrStatus?: number } | null | undefined

/** Dependencias inyectadas en el gestor imperativo del stream. */
type ChatStreamParams = {
	p2p_uuid: string
	/** Orden de una oferta por rango: el stream (canal Redis) es por orden. */
	order?: string | null
	setConnected: (value: boolean) => void
	fetchChat: () => void
	appendMessage: (message: ChatMessage) => void
}

// Mirrors the web fallback scheme (app/(dashboard)/p2p/[uuid]/chat.js in qpweb)
const INIT_TIMEOUT_MS = 5000 // no `init` event within this window → assume the stream is down
const FALLBACK_POLL_MS = 10000 // poll cadence while the stream is down
const SSE_RETRY_MS = 60000 // how long to poll before attempting the stream again
// First drop after a healthy stream: reconnect quickly instead of polling. A one-second
// network blip used to cost six chat fetches (and the offer poll's on top)
const FAST_RETRY_MS = 1500

// `revision` incluida: en una disputa el chat es donde quien pagó sube el comprobante
const ACTIVE_STATUSES = ["open", "processing", "paid", "revision"]

/**
 * Imperative chat-stream manager: opens the SSE connection, owns every timer
 * and listener of the reconnect/fallback state machine, and tears them all
 * down in `dispose()`. Lives outside the hook so the effect owns a single
 * resource with a single cleanup.
 *
 * State machine:
 * - `init` = healthy: stop polling, catch up on the history, and grant ONE fast retry.
 * - `error` with the fast retry available: reconnect in 1.5s without fetching the chat
 *   (the stream counts as connected meanwhile, so the offer poll doesn't fetch it either);
 *   the `init` catch-up covers the gap.
 * - `error` otherwise, or no `init` within 5s: poll the chat every 10s, retry at 60s.
 * - `error` with a 4xx (403 not a party, 404, 401…; not 408/429) is a "no", not a drop:
 *   no retry, no polling, no reconnect on foreground.
 * Every listener is bound to its own stream: react-native-sse can dispatch `error`
 * twice for one failed response (LOADING then DONE), and a dying stream's late event
 * must not spend the next stream's budget.
 *
 * @param params.p2p_uuid - Offer UUID.
 * @param params.order - Order UUID of a range offer (stream scoped to that order).
 * @param params.setConnected - Receives the stream-connected boolean.
 * @param params.fetchChat - Full history refetch (catch-up + fallback poll).
 * @param params.appendMessage - Appends one parsed message.
 */
function openChatStream({ p2p_uuid, order, setConnected, fetchChat, appendMessage }: ChatStreamParams): { dispose: () => void } {

	let es: EventSource<ChatStreamEvent> | null = null
	let pollInterval: ReturnType<typeof setInterval> | null = null
	let initTimeout: ReturnType<typeof setTimeout> | null = null
	let retryTimeout: ReturnType<typeof setTimeout> | null = null
	let fastRetryTimeout: ReturnType<typeof setTimeout> | null = null
	let disposeTimer: ReturnType<typeof setTimeout> | null = null
	let dyingEs: EventSource<ChatStreamEvent> | null = null
	let disposed = false
	// The server refused the stream (4xx): nothing to retry until the hook remounts
	let refused = false
	// Fast-retry budget: granted by every `init`, spent by the first drop after it
	let fastRetryReady = false
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
		clearTimeout(fastRetryTimeout as ReturnType<typeof setTimeout>)
		initTimeout = null
		retryTimeout = null
		fastRetryTimeout = null
	}
	const disposeStream = (stream: EventSource<ChatStreamEvent>) => {
		stream.removeAllEventListeners()
		stream.close()
	}
	// `keepConnected`: a fast reconnect is under way — don't tell the offer poll the
	// stream is down (it would fetch the chat in the 1.5s gap)
	const closeStream = (keepConnected = false) => {
		clearTimeout(initTimeout as ReturnType<typeof setTimeout>)
		initTimeout = null
		const dying = es
		es = null
		if (dying) {
			// Deferred one tick: react-native-sse schedules its internal reconnect timer
			// right AFTER dispatching 'error' (and the server's `retry:` overrides our
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
		if (!keepConnected) emitConnected(false)
	}

	// Stream is down: poll while waiting, retry the stream after a pause
	const fallbackToPolling = () => {
		closeStream()
		if (disposed || refused || !appActive) return
		startPolling()
		if (!retryTimeout) {
			retryTimeout = setTimeout(() => {
				retryTimeout = null
				connectSSE()
			}, SSE_RETRY_MS)
		}
	}

	// First drop after a healthy stream: reconnect soon, no polling. If that attempt
	// fails too (error or no init in 5s), the budget is spent and the fallback takes over
	const reconnectSoon = () => {
		fastRetryReady = false
		if (disposed || !appActive) { closeStream(); return }
		closeStream(true)
		fastRetryTimeout = setTimeout(() => {
			fastRetryTimeout = null
			connectSSE()
		}, FAST_RETRY_MS)
	}

	// A "no" from the server: stop everything for good
	const refuse = () => {
		refused = true
		closeStream()
		stopPolling()
		clearTimers()
	}

	const onInit = (stream: EventSource<ChatStreamEvent>) => {
		if (stream !== es) return
		clearTimeout(initTimeout as ReturnType<typeof setTimeout>)
		initTimeout = null
		stopPolling()
		fastRetryReady = true
		emitConnected(true)
		// Catch up on anything sent between the history load / fallback window and now
		fetchChat()
	}

	const onError = (stream: EventSource<ChatStreamEvent>, event: ChatStreamError) => {
		if (stream !== es) return
		const status = event?.xhrStatus
		if (isRefusalStatus(status)) { refuse(); return }
		// 429: the server asks to slow down — straight to the slow fallback
		if (fastRetryReady && status !== 429) { reconnectSoon(); return }
		fallbackToPolling()
	}

	const onMessage = (event: { data?: string | null }) => {
		try { appendMessage(JSON.parse(event.data as string)) } catch { /* ignore malformed */ }
	}

	const connectSSE = async () => {
		if (disposed || refused || !appActive || es) return
		const token = await getAuthToken()
		if (disposed || refused || !appActive || es) return

		const stream = new EventSource<ChatStreamEvent>(`${getApiBaseUrl()}/p2p/${p2p_uuid}/chat/stream${order ? `?order=${encodeURIComponent(order)}` : ""}`, {
			headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
			pollingInterval: 0, // disable the library's auto-reconnect — retries are ours
		})
		es = stream

		initTimeout = setTimeout(() => { if (stream === es) fallbackToPolling() }, INIT_TIMEOUT_MS)

		stream.addEventListener("init", () => onInit(stream))
		stream.addEventListener("message", onMessage)
		stream.addEventListener("error", (event) => onError(stream, event as ChatStreamError))
	}

	connectSSE()

	// Close the stream while backgrounded; catch up and reconnect on foreground
	const appStateSub = AppState.addEventListener("change", (nextState) => {
		if (nextState === "active" && !appActive) {
			appActive = true
			if (refused) return
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
 * Reconnects once after 1.5s when a healthy stream drops; if that fails, falls back to
 * 10s polling and retries the stream every 60s. A 4xx is final (see openChatStream).
 *
 * @param params.p2p_uuid - Offer UUID.
 * @param params.order - Order UUID of a range offer; changing it reopens the stream.
 * @param params.enabled - Only the deal's parties (owner/peer of what the screen shows)
 *   may open the stream; the server answers 403 to anyone else. False = no stream at all.
 * @param params.status - Current offer status; the stream only runs on active statuses.
 * @param params.appendMessage - From useP2PChat: appends one message with id dedup.
 * @param params.fetchChat - From useP2PChat: full history refetch (used for catch-up + fallback).
 * @param params.connectedRef - Screen-owned ref mirroring the connected state, so the
 *   offer-detail 5s interval can skip its chat fetch without re-creating itself.
 */
export default function useP2PChatSSE({ p2p_uuid, order = null, enabled = true, status, appendMessage, fetchChat, connectedRef }: {
	p2p_uuid: string
	order?: string | null
	enabled?: boolean
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

	const isActive = enabled && ACTIVE_STATUSES.includes(status as string)

	useEffect(() => {
		if (!p2p_uuid || !isActive) return

		const stream = openChatStream({
			p2p_uuid,
			order,
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
	}, [p2p_uuid, order, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

	return { isStreamConnected }
}
