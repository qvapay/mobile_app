/**
 * Unit tests for the P2P online-presence heartbeat — node environment with
 * auth, userApi and AppState mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
let appStateHandler = null
jest.mock('react-native', () => ({
	AppState: {
		currentState: 'active',
		addEventListener: jest.fn((event, handler) => {
			appStateHandler = handler
			return { remove: jest.fn() }
		}),
	},
}))
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../api/userApi', () => ({ userApi: { heartbeat: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../auth/AuthContext'
import { userApi } from '../api/userApi'
import { OnlineStatusProvider, useOnlineStatus } from './OnlineStatusContext'

const HEARTBEAT_MS = 60000

const renderPresence = async () => {
	const result = { current: null }
	const Harness = () => {
		result.current = useOnlineStatus()
		return null
	}
	let root
	await act(async () => {
		root = create(
			<OnlineStatusProvider>
				<Harness />
			</OnlineStatusProvider>
		)
	})
	return { result, root }
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	appStateHandler = null
	useAuth.mockReturnValue({ isAuthenticated: true })
	userApi.heartbeat.mockResolvedValue({ success: true, data: { statuses: {} } })
})
afterEach(() => { jest.useRealTimers() })

test('outside the provider it returns inert no-ops instead of throwing', () => {
	const result = { current: null }
	const Naked = () => {
		result.current = useOnlineStatus()
		return null
	}
	act(() => { create(<Naked />) })
	expect(result.current.statuses).toEqual({})
	expect(result.current.isUserOnline('u1')).toBe(false)
	expect(() => result.current.trackUsers('u1')).not.toThrow()
})

test('beats immediately when authenticated and then every 60s', async () => {
	await renderPresence()
	expect(userApi.heartbeat).toHaveBeenCalledTimes(1)
	await act(async () => { jest.advanceTimersByTime(HEARTBEAT_MS) })
	expect(userApi.heartbeat).toHaveBeenCalledTimes(2)
	await act(async () => { jest.advanceTimersByTime(2 * HEARTBEAT_MS) })
	expect(userApi.heartbeat).toHaveBeenCalledTimes(4)
})

test('never beats while unauthenticated', async () => {
	useAuth.mockReturnValue({ isAuthenticated: false })
	await renderPresence()
	await act(async () => { jest.advanceTimersByTime(5 * HEARTBEAT_MS) })
	expect(userApi.heartbeat).not.toHaveBeenCalled()
})

test('statuses from the beat drive isUserOnline', async () => {
	userApi.heartbeat.mockResolvedValue({ success: true, data: { statuses: { u1: true, u2: false } } })
	const { result } = await renderPresence()
	expect(result.current.isUserOnline('u1')).toBe(true)
	expect(result.current.isUserOnline('u2')).toBe(false)
	expect(result.current.isUserOnline('unknown')).toBe(false)
	expect(result.current.isUserOnline(null)).toBe(false)
})

test('tracking a NEW user fires an immediate extra beat with the tracked ids', async () => {
	const { result } = await renderPresence()
	expect(userApi.heartbeat).toHaveBeenCalledTimes(1)
	await act(async () => { result.current.trackUsers(['u1', 'u2']) })
	expect(userApi.heartbeat).toHaveBeenCalledTimes(2)
	expect(userApi.heartbeat).toHaveBeenLastCalledWith(['u1', 'u2'])
	// tracking the same ids again is a no-op
	await act(async () => { result.current.trackUsers('u1') })
	expect(userApi.heartbeat).toHaveBeenCalledTimes(2)
})

test('untracked users drop out of the next beat payload', async () => {
	const { result } = await renderPresence()
	await act(async () => { result.current.trackUsers(['u1', 'u2']) })
	await act(async () => { result.current.untrackUsers('u1') })
	await act(async () => { jest.advanceTimersByTime(HEARTBEAT_MS) })
	expect(userApi.heartbeat).toHaveBeenLastCalledWith(['u2'])
})

test('pauses in background and resumes on foreground', async () => {
	await renderPresence()
	expect(userApi.heartbeat).toHaveBeenCalledTimes(1)
	await act(async () => { appStateHandler('background') })
	await act(async () => { jest.advanceTimersByTime(5 * HEARTBEAT_MS) })
	expect(userApi.heartbeat).toHaveBeenCalledTimes(1) // paused
	await act(async () => { appStateHandler('active') })
	expect(userApi.heartbeat).toHaveBeenCalledTimes(2) // resume beats immediately
})

test('unmount stops the interval', async () => {
	const { root } = await renderPresence()
	await act(async () => { root.unmount() })
	await act(async () => { jest.advanceTimersByTime(5 * HEARTBEAT_MS) })
	expect(userApi.heartbeat).toHaveBeenCalledTimes(1)
})
