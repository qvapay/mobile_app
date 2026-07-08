/**
 * Unit tests for the transaction SSE hook, rendered with react-test-renderer —
 * node environment with react-native-sse mocked by a controllable fake
 * EventSource (see useSettingsState.test.js for the harness pattern).
 * @jest-environment node
 */
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

jest.mock('../config', () => ({
	__esModule: true,
	default: { API_BASE_URL: 'https://api.test' },
}))

jest.mock('../api/client', () => ({
	getAuthToken: jest.fn(),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import EventSource from 'react-native-sse'
import { getAuthToken } from '../api/client'
import useTransactionSSE from './useTransactionSSE'

// Minimal hook harness: renders the hook inside a throwaway component and
// exposes its latest return value through `result.current`.
const renderHook = async (initialProps) => {
	const result = { current: null }
	const Harness = ({ uuid, onStatusChange }) => {
		result.current = useTransactionSSE(uuid, onStatusChange)
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

beforeEach(() => {
	jest.clearAllMocks()
	EventSource.instances.length = 0
	getAuthToken.mockResolvedValue('token-123')
})

describe('connection', () => {
	test('does not open a stream without a uuid', async () => {
		const { result } = await renderHook({ uuid: null })
		expect(EventSource.instances).toHaveLength(0)
		expect(result.current).toEqual({ status: 'pending', error: null, isConnected: false })
	})

	test('connects to the callback URL with the Bearer token from the keychain', async () => {
		await renderHook({ uuid: 'tx-1' })
		expect(getAuthToken).toHaveBeenCalledTimes(1)
		expect(EventSource.instances).toHaveLength(1)
		const es = lastStream()
		expect(es.url).toBe('https://api.test/callback/transaction?uuid=tx-1')
		expect(es.options.headers).toEqual({ Authorization: 'Bearer token-123' })
	})

	test('omits the Authorization header when no token is stored', async () => {
		getAuthToken.mockResolvedValue(null)
		await renderHook({ uuid: 'tx-1' })
		expect(lastStream().options.headers).toEqual({})
	})

	test('the open event marks the stream as connected', async () => {
		const { result } = await renderHook({ uuid: 'tx-1' })
		expect(result.current.isConnected).toBe(false)
		await emit(lastStream(), 'open')
		expect(result.current.isConnected).toBe(true)
		expect(result.current.error).toBeNull()
	})
})

describe('status updates', () => {
	test('the named init event pushes the initial status', async () => {
		const onStatusChange = jest.fn()
		const { result } = await renderHook({ uuid: 'tx-1', onStatusChange })
		await emit(lastStream(), 'init', { data: 'processing' })
		expect(result.current.status).toBe('processing')
		expect(onStatusChange).toHaveBeenCalledWith('processing')
	})

	test('plain messages update the status and notify the callback', async () => {
		const onStatusChange = jest.fn()
		const { result } = await renderHook({ uuid: 'tx-1', onStatusChange })
		const es = lastStream()
		await emit(es, 'message', { data: 'processing' })
		expect(result.current.status).toBe('processing')
		expect(onStatusChange).toHaveBeenCalledWith('processing')
		expect(es.close).not.toHaveBeenCalled()
	})

	test('empty message data is ignored', async () => {
		const onStatusChange = jest.fn()
		const { result } = await renderHook({ uuid: 'tx-1', onStatusChange })
		await emit(lastStream(), 'message', { data: '' })
		expect(result.current.status).toBe('pending')
		expect(onStatusChange).not.toHaveBeenCalled()
	})

	test.each(['paid', 'expired', 'failed'])('the terminal status %s closes the stream for good', async (terminal) => {
		const { result } = await renderHook({ uuid: 'tx-1' })
		const es = lastStream()
		await emit(es, 'open')
		await emit(es, 'message', { data: terminal })
		expect(result.current.status).toBe(terminal)
		expect(es.close).toHaveBeenCalledTimes(1)
		expect(result.current.isConnected).toBe(false)
	})

	test('swapping the onStatusChange callback does not reconnect the stream', async () => {
		const first = jest.fn()
		const second = jest.fn()
		const { rerender } = await renderHook({ uuid: 'tx-1', onStatusChange: first })
		await rerender({ uuid: 'tx-1', onStatusChange: second })
		expect(EventSource.instances).toHaveLength(1)
		await emit(lastStream(), 'message', { data: 'processing' })
		expect(first).not.toHaveBeenCalled()
		expect(second).toHaveBeenCalledWith('processing')
	})
})

describe('error handling', () => {
	test('tolerates stream errors under the retry limit without closing', async () => {
		const { result } = await renderHook({ uuid: 'tx-1' })
		const es = lastStream()
		for (let i = 0; i < 9; i++) { await emit(es, 'error') }
		expect(es.close).not.toHaveBeenCalled()
		expect(result.current.error).toBeNull()
		expect(result.current.isConnected).toBe(false)
	})

	test('a successful open resets the consecutive error counter', async () => {
		const { result } = await renderHook({ uuid: 'tx-1' })
		const es = lastStream()
		for (let i = 0; i < 9; i++) { await emit(es, 'error') }
		await emit(es, 'open')
		for (let i = 0; i < 9; i++) { await emit(es, 'error') }
		expect(es.close).not.toHaveBeenCalled()
		expect(result.current.error).toBeNull()
	})

	test('gives up after 10 consecutive errors with a Spanish user-facing error', async () => {
		const { result } = await renderHook({ uuid: 'tx-1' })
		const es = lastStream()
		for (let i = 0; i < 10; i++) { await emit(es, 'error') }
		expect(es.close).toHaveBeenCalledTimes(1)
		expect(result.current.error).toBe('Se perdió la conexión con el servidor')
		expect(result.current.isConnected).toBe(false)
	})

	test('a token lookup failure surfaces a monitoring error instead of crashing', async () => {
		getAuthToken.mockRejectedValue(new Error('keychain dead'))
		const { result } = await renderHook({ uuid: 'tx-1' })
		expect(EventSource.instances).toHaveLength(0)
		expect(result.current.error).toBe('No se pudo establecer conexión de monitoreo')
		expect(result.current.isConnected).toBe(false)
	})
})

describe('lifecycle', () => {
	test('unmount closes the stream', async () => {
		const { unmount } = await renderHook({ uuid: 'tx-1' })
		const es = lastStream()
		await unmount()
		expect(es.close).toHaveBeenCalledTimes(1)
	})

	test('changing the uuid closes the old stream and opens a fresh one', async () => {
		const { rerender } = await renderHook({ uuid: 'tx-1' })
		const first = lastStream()
		await rerender({ uuid: 'tx-2' })
		expect(first.close).toHaveBeenCalledTimes(1)
		expect(EventSource.instances).toHaveLength(2)
		expect(lastStream().url).toBe('https://api.test/callback/transaction?uuid=tx-2')
	})

	test('clearing the uuid closes the stream and resets the state', async () => {
		const { result, rerender } = await renderHook({ uuid: 'tx-1' })
		const es = lastStream()
		await emit(es, 'open')
		await emit(es, 'message', { data: 'processing' })
		await rerender({ uuid: null })
		expect(es.close).toHaveBeenCalledTimes(1)
		expect(EventSource.instances).toHaveLength(1)
		expect(result.current).toEqual({ status: 'pending', error: null, isConnected: false })
	})
})
