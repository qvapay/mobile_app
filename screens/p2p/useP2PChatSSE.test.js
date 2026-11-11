/**
 * Unit tests for the P2P chat SSE hook, rendered with react-test-renderer —
 * node environment with react-native-sse mocked by a controllable fake
 * EventSource and fake timers driving the init-timeout / 10s polling
 * fallback / 60s stream retry scheme (see useSettingsState.test.js for the
 * harness pattern).
 * @jest-environment node
 */
jest.mock('react-native', () => {
	const listeners = []
	const AppState = {
		currentState: 'active',
		addEventListener: jest.fn((type, handler) => {
			listeners.push(handler)
			return {
				remove: jest.fn(() => {
					const index = listeners.indexOf(handler)
					if (index !== -1) { listeners.splice(index, 1) }
				}),
			}
		}),
		// Test helpers (not part of the real API)
		emitChange: (nextState) => {
			AppState.currentState = nextState
			;[...listeners].forEach((handler) => handler(nextState))
		},
		reset: () => {
			listeners.length = 0
			AppState.currentState = 'active'
		},
	}
	return { AppState }
})

jest.mock('react-native-sse', () => {
	class MockEventSource {
		constructor(url, options) {
			this.url = url
			this.options = options
			this.listeners = {}
			this.close = jest.fn()
			this.removeAllEventListeners = jest.fn(() => { this.listeners = {} })
			MockEventSource.instances.push(this)
		}
		addEventListener(type, handler) {
			if (!this.listeners[type]) { this.listeners[type] = [] }
			this.listeners[type].push(handler)
		}
		emit(type, event = {}) {
			;(this.listeners[type] || []).forEach((handler) => handler(event))
		}
	}
	MockEventSource.instances = []
	return { __esModule: true, default: MockEventSource }
})

jest.mock('../../config', () => ({
	__esModule: true,
	default: { API_BASE_URL: 'https://api.test' },
}))

jest.mock('../../api/client', () => ({
	getAuthToken: jest.fn(),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { AppState } from 'react-native'
import EventSource from 'react-native-sse'
import { getAuthToken } from '../../api/client'
import useP2PChatSSE from './useP2PChatSSE'

const INIT_TIMEOUT_MS = 5000
const FALLBACK_POLL_MS = 10000
const SSE_RETRY_MS = 60000
const FAST_RETRY_MS = 1500

// Minimal hook harness: renders the hook inside a throwaway component and
// exposes its latest return value through `result.current`.
const renderHook = async (initialProps) => {
	const result = { current: null }
	const Harness = (props) => {
		result.current = useP2PChatSSE(props)
		return null
	}
	let root
	await act(async () => { root = create(React.createElement(Harness, initialProps)) })
	return {
		result,
		rerender: async (props) => { await act(async () => { root.update(React.createElement(Harness, props)) }) },
		unmount: async () => { await act(async () => { root.unmount() }) },
	}
}

const lastStream = () => EventSource.instances[EventSource.instances.length - 1]
const emit = async (es, type, event) => { await act(async () => { es.emit(type, event) }) }
const advance = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms) }) }

let props

beforeEach(() => {
	jest.useFakeTimers()
	jest.clearAllMocks()
	EventSource.instances.length = 0
	AppState.reset()
	getAuthToken.mockResolvedValue('token-123')
	props = {
		p2p_uuid: 'offer-1',
		status: 'processing',
		appendMessage: jest.fn(),
		fetchChat: jest.fn(),
		connectedRef: { current: false },
	}
})

afterEach(() => {
	jest.useRealTimers()
})

describe('connection', () => {
	test('stays idle without a uuid', async () => {
		const { result } = await renderHook({ ...props, p2p_uuid: null })
		expect(EventSource.instances).toHaveLength(0)
		expect(result.current.isStreamConnected).toBe(false)
	})

	test.each(['completed', 'cancelled', undefined])('stays idle on inactive status %s', async (status) => {
		await renderHook({ ...props, status })
		expect(EventSource.instances).toHaveLength(0)
	})

	test('stays idle when the viewer is not a party (enabled: false), whatever the status', async () => {
		const { result } = await renderHook({ ...props, enabled: false })
		await advance(SSE_RETRY_MS * 2)
		expect(EventSource.instances).toHaveLength(0)
		expect(props.fetchChat).not.toHaveBeenCalled()
		expect(result.current.isStreamConnected).toBe(false)
	})

	test('opens the stream once the viewer turns out to be a party', async () => {
		const { rerender } = await renderHook({ ...props, enabled: false })
		expect(EventSource.instances).toHaveLength(0)
		await rerender({ ...props, enabled: true })
		expect(EventSource.instances).toHaveLength(1)
	})

	test.each(['open', 'processing', 'paid', 'revision'])('connects on active status %s', async (status) => {
		await renderHook({ ...props, status })
		expect(EventSource.instances).toHaveLength(1)
	})

	test('connects to the chat stream with Bearer auth and library auto-reconnect disabled', async () => {
		await renderHook(props)
		const es = lastStream()
		expect(es.url).toBe('https://api.test/p2p/offer-1/chat/stream')
		expect(es.options.headers).toEqual({ Authorization: 'Bearer token-123' })
		expect(es.options.pollingInterval).toBe(0)
	})

	test('the init event connects, mirrors the ref and catches up on missed messages', async () => {
		const { result } = await renderHook(props)
		expect(result.current.isStreamConnected).toBe(false)
		await emit(lastStream(), 'init')
		expect(result.current.isStreamConnected).toBe(true)
		expect(props.connectedRef.current).toBe(true)
		expect(props.fetchChat).toHaveBeenCalledTimes(1)
	})

	test('a timely init disarms the 5s fallback timeout', async () => {
		await renderHook(props)
		const es = lastStream()
		await emit(es, 'init')
		await advance(INIT_TIMEOUT_MS + FALLBACK_POLL_MS)
		expect(es.close).not.toHaveBeenCalled()
		// only the init catch-up fetch — no fallback polling kicked in
		expect(props.fetchChat).toHaveBeenCalledTimes(1)
	})
})

describe('messages', () => {
	test('pushed messages are JSON-parsed and appended', async () => {
		await renderHook(props)
		const message = { id: 7, message: 'hola', peer_id: 3 }
		await emit(lastStream(), 'message', { data: JSON.stringify(message) })
		expect(props.appendMessage).toHaveBeenCalledWith(message)
	})

	test('malformed payloads are ignored without crashing', async () => {
		await renderHook(props)
		await emit(lastStream(), 'message', { data: 'not-json{' })
		expect(props.appendMessage).not.toHaveBeenCalled()
	})
})

describe('error fallback', () => {
	test('KNOWN GOTCHA: a stream error defers the close one tick — closing synchronously inside the error listener would leave a zombie reconnect', async () => {
		const { result } = await renderHook(props)
		const es = lastStream()
		await emit(es, 'error')
		// disconnected immediately, but the close itself must NOT have happened yet
		expect(result.current.isStreamConnected).toBe(false)
		expect(props.connectedRef.current).toBe(false)
		expect(es.close).not.toHaveBeenCalled()
		expect(es.removeAllEventListeners).not.toHaveBeenCalled()
		// one tick later the dying stream is fully torn down
		await advance(0)
		expect(es.removeAllEventListeners).toHaveBeenCalledTimes(1)
		expect(es.close).toHaveBeenCalledTimes(1)
	})

	test('falls back to 10s polling while the stream is down', async () => {
		await renderHook(props)
		await emit(lastStream(), 'error')
		expect(props.fetchChat).not.toHaveBeenCalled()
		await advance(FALLBACK_POLL_MS)
		expect(props.fetchChat).toHaveBeenCalledTimes(1)
		await advance(FALLBACK_POLL_MS)
		expect(props.fetchChat).toHaveBeenCalledTimes(2)
	})

	test('retries the stream after 60s and stops polling once it reconnects', async () => {
		await renderHook(props)
		await emit(lastStream(), 'error')
		expect(EventSource.instances).toHaveLength(1)
		await advance(SSE_RETRY_MS)
		// six polls happened during the wait, then a fresh stream was opened
		expect(props.fetchChat).toHaveBeenCalledTimes(6)
		expect(EventSource.instances).toHaveLength(2)
		props.fetchChat.mockClear()
		await emit(lastStream(), 'init')
		expect(props.fetchChat).toHaveBeenCalledTimes(1) // catch-up only
		await advance(FALLBACK_POLL_MS)
		expect(props.fetchChat).toHaveBeenCalledTimes(1) // polling stopped
	})

	test('a stream that never sends init falls back to polling after 5s', async () => {
		const { result } = await renderHook(props)
		const es = lastStream()
		await advance(INIT_TIMEOUT_MS)
		// the close itself is deferred one tick — a 0ms timer queued inside another
		// timer's callback needs a strictly later fake-timer tick to fire
		await advance(1)
		expect(es.close).toHaveBeenCalledTimes(1)
		expect(result.current.isStreamConnected).toBe(false)
		await advance(FALLBACK_POLL_MS)
		expect(props.fetchChat).toHaveBeenCalledTimes(1)
	})
})

describe('fast reconnect after a healthy stream', () => {
	test('the first drop after init reconnects in 1.5s without fetching the chat and stays "connected"', async () => {
		const { result } = await renderHook(props)
		const first = lastStream()
		await emit(first, 'init')
		props.fetchChat.mockClear()
		await emit(first, 'error', { xhrStatus: 0 })
		// the offer poll must not see the stream as down during the gap
		expect(props.connectedRef.current).toBe(true)
		expect(result.current.isStreamConnected).toBe(true)
		// the dying stream is still closed one tick later (zombie gotcha)
		expect(first.close).not.toHaveBeenCalled()
		await advance(0)
		expect(first.close).toHaveBeenCalledTimes(1)
		await advance(FAST_RETRY_MS - 1)
		expect(EventSource.instances).toHaveLength(1)
		await advance(1)
		expect(EventSource.instances).toHaveLength(2)
		expect(props.fetchChat).not.toHaveBeenCalled()
		// the new stream's init catches up on the gap: one fetch, no polling
		await emit(lastStream(), 'init')
		expect(props.fetchChat).toHaveBeenCalledTimes(1)
		await advance(SSE_RETRY_MS)
		expect(props.fetchChat).toHaveBeenCalledTimes(1)
	})

	test('if the fast retry fails too, the usual fallback takes over (10s polling, 60s retry)', async () => {
		const { result } = await renderHook(props)
		await emit(lastStream(), 'init')
		await emit(lastStream(), 'error')
		await advance(FAST_RETRY_MS)
		props.fetchChat.mockClear()
		await emit(lastStream(), 'error')
		expect(props.connectedRef.current).toBe(false)
		expect(result.current.isStreamConnected).toBe(false)
		await advance(FALLBACK_POLL_MS)
		expect(props.fetchChat).toHaveBeenCalledTimes(1)
		expect(EventSource.instances).toHaveLength(2)
		await advance(SSE_RETRY_MS - FALLBACK_POLL_MS)
		expect(EventSource.instances).toHaveLength(3)
	})

	test('a fast retry that never gets init falls back after 5s', async () => {
		await renderHook(props)
		await emit(lastStream(), 'init')
		await emit(lastStream(), 'error')
		await advance(FAST_RETRY_MS)
		props.fetchChat.mockClear()
		await advance(INIT_TIMEOUT_MS)
		expect(props.connectedRef.current).toBe(false)
		await advance(FALLBACK_POLL_MS)
		expect(props.fetchChat).toHaveBeenCalledTimes(1)
	})

	test('every init restores the fast-retry budget', async () => {
		await renderHook(props)
		for (let round = 1; round <= 3; round++) {
			await emit(lastStream(), 'init')
			await emit(lastStream(), 'error')
			await advance(FAST_RETRY_MS)
			expect(EventSource.instances).toHaveLength(round + 1)
		}
		await emit(lastStream(), 'init')
		await advance(SSE_RETRY_MS)
		// four inits (three blips), four catch-up fetches, no fallback polling
		expect(props.fetchChat).toHaveBeenCalledTimes(4)
	})

	test("a dying stream's second error (LOADING then DONE) doesn't spend the next stream's budget", async () => {
		await renderHook(props)
		const first = lastStream()
		await emit(first, 'init')
		await emit(first, 'error', { xhrStatus: 502, xhrState: 3 })
		await emit(first, 'error', { xhrStatus: 502, xhrState: 4 })
		await advance(FAST_RETRY_MS)
		expect(EventSource.instances).toHaveLength(2)
		expect(props.connectedRef.current).toBe(true)
		props.fetchChat.mockClear()
		await advance(FALLBACK_POLL_MS - FAST_RETRY_MS - 1)
		expect(props.fetchChat).not.toHaveBeenCalled()
	})

	test('a 429 skips the fast retry: the server asks to slow down', async () => {
		await renderHook(props)
		await emit(lastStream(), 'init')
		await emit(lastStream(), 'error', { xhrStatus: 429 })
		expect(props.connectedRef.current).toBe(false)
		await advance(FAST_RETRY_MS)
		expect(EventSource.instances).toHaveLength(1)
		props.fetchChat.mockClear()
		await advance(FALLBACK_POLL_MS)
		expect(props.fetchChat).toHaveBeenCalledTimes(1)
	})
})

describe('refusals (a "no", not a drop)', () => {
	test.each([401, 403, 404])('a %s neither retries nor falls back to polling', async (xhrStatus) => {
		const { result } = await renderHook(props)
		const es = lastStream()
		await emit(es, 'error', { xhrStatus, xhrState: 4 })
		expect(result.current.isStreamConnected).toBe(false)
		await advance(0)
		expect(es.close).toHaveBeenCalledTimes(1)
		await advance(SSE_RETRY_MS * 3)
		expect(props.fetchChat).not.toHaveBeenCalled()
		expect(EventSource.instances).toHaveLength(1)
	})

	test('a refusal even right after a healthy init does not spend a fast retry', async () => {
		await renderHook(props)
		await emit(lastStream(), 'init')
		props.fetchChat.mockClear()
		await emit(lastStream(), 'error', { xhrStatus: 403 })
		await advance(SSE_RETRY_MS * 2)
		expect(EventSource.instances).toHaveLength(1)
		expect(props.fetchChat).not.toHaveBeenCalled()
	})

	test('after a refusal, coming back to the foreground does not reconnect or fetch', async () => {
		await renderHook(props)
		await emit(lastStream(), 'error', { xhrStatus: 403 })
		await act(async () => { AppState.emitChange('background') })
		await act(async () => { AppState.emitChange('active') })
		await advance(SSE_RETRY_MS)
		expect(EventSource.instances).toHaveLength(1)
		expect(props.fetchChat).not.toHaveBeenCalled()
	})
})

describe('app state', () => {
	test('backgrounding tears the stream down and suspends polling', async () => {
		const { result } = await renderHook(props)
		const es = lastStream()
		await emit(es, 'init')
		await act(async () => { AppState.emitChange('background') })
		expect(result.current.isStreamConnected).toBe(false)
		expect(props.connectedRef.current).toBe(false)
		await advance(0)
		expect(es.close).toHaveBeenCalledTimes(1)
		props.fetchChat.mockClear()
		await advance(SSE_RETRY_MS)
		expect(props.fetchChat).not.toHaveBeenCalled() // no polling while backgrounded
		expect(EventSource.instances).toHaveLength(1) // no reconnect attempts either
	})

	test('foregrounding catches up on the chat and reconnects the stream', async () => {
		await renderHook(props)
		await emit(lastStream(), 'init')
		await act(async () => { AppState.emitChange('background') })
		await advance(0)
		props.fetchChat.mockClear()
		await act(async () => { AppState.emitChange('active') })
		expect(props.fetchChat).toHaveBeenCalledTimes(1) // catch-up fetch
		expect(EventSource.instances).toHaveLength(2) // fresh stream
	})
})

describe('lifecycle', () => {
	test('unmount closes the stream and cancels every timer', async () => {
		const { unmount } = await renderHook(props)
		const es = lastStream()
		await emit(es, 'init')
		await unmount()
		await advance(0)
		expect(es.removeAllEventListeners).toHaveBeenCalledTimes(1)
		expect(es.close).toHaveBeenCalledTimes(1)
		props.fetchChat.mockClear()
		await advance(SSE_RETRY_MS * 2)
		expect(props.fetchChat).not.toHaveBeenCalled()
		expect(EventSource.instances).toHaveLength(1)
	})

	test('unmount while in the polling fallback cancels the pending 60s retry', async () => {
		const { unmount } = await renderHook(props)
		await emit(lastStream(), 'error')
		await advance(FALLBACK_POLL_MS)
		expect(props.fetchChat).toHaveBeenCalledTimes(1)
		await unmount()
		props.fetchChat.mockClear()
		await advance(SSE_RETRY_MS * 2)
		expect(props.fetchChat).not.toHaveBeenCalled()
		expect(EventSource.instances).toHaveLength(1)
	})

	test('the offer going terminal (status change) shuts the stream down', async () => {
		const { rerender } = await renderHook(props)
		const es = lastStream()
		await emit(es, 'init')
		await rerender({ ...props, status: 'completed' })
		await advance(0)
		expect(es.close).toHaveBeenCalledTimes(1)
		expect(EventSource.instances).toHaveLength(1)
	})
})
