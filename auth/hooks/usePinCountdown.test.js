/**
 * Unit tests for the "Solicitar PIN" cooldown timer, rendered with
 * react-test-renderer in the node environment with fake timers
 * (see keypadAmount.test.js for why node).
 * @jest-environment node
 */
import React from 'react'
import { act, create } from 'react-test-renderer'
import usePinCountdown from './usePinCountdown'

// Minimal hook harness: renders the hook inside a throwaway component and
// exposes its latest return value through `result.current`.
const renderHook = () => {
	const result = { current: null }
	const Harness = () => {
		result.current = usePinCountdown()
		return null
	}
	let root
	act(() => { root = create(React.createElement(Harness)) })
	return { result, root }
}

// Every interval tick calls setState, so advancing timers must happen in act
const advance = (ms) => act(() => { jest.advanceTimersByTime(ms) })

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers() })

describe('initial state', () => {
	test('shows the default label with the button enabled', () => {
		const { result } = renderHook()
		expect(result.current.label).toBe('Solicitar PIN')
		expect(result.current.isDisabled).toBe(false)
	})
})

describe('start', () => {
	test('defaults to 60 seconds, disables the button and shows mm:ss', () => {
		const { result } = renderHook()
		act(() => { result.current.start() })
		expect(result.current.label).toBe('01:00')
		expect(result.current.isDisabled).toBe(true)
	})

	test('formats minutes and seconds with zero padding', () => {
		const { result } = renderHook()
		act(() => { result.current.start(90) })
		expect(result.current.label).toBe('01:30')
		act(() => { result.current.start(5) })
		expect(result.current.label).toBe('00:05')
		act(() => { result.current.start(600) })
		expect(result.current.label).toBe('10:00')
	})

	test('ticks the label down once per second', () => {
		const { result } = renderHook()
		act(() => { result.current.start(61) })
		advance(1000)
		expect(result.current.label).toBe('01:00')
		advance(1000)
		expect(result.current.label).toBe('00:59')
		expect(result.current.isDisabled).toBe(true)
	})

	test('restores the default label and re-enables the button at zero', () => {
		const { result } = renderHook()
		act(() => { result.current.start(3) })
		advance(2000)
		expect(result.current.label).toBe('00:01')
		advance(1000)
		expect(result.current.label).toBe('Solicitar PIN')
		expect(result.current.isDisabled).toBe(false)
		expect(jest.getTimerCount()).toBe(0)
	})

	test('a 1-second countdown resets on the very first tick', () => {
		const { result } = renderHook()
		act(() => { result.current.start(1) })
		expect(result.current.label).toBe('00:01')
		advance(1000)
		expect(result.current.label).toBe('Solicitar PIN')
		expect(result.current.isDisabled).toBe(false)
	})

	test('calling start mid-countdown restarts instead of stacking intervals', () => {
		const { result } = renderHook()
		act(() => { result.current.start(10) })
		advance(3000)
		expect(result.current.label).toBe('00:07')
		act(() => { result.current.start(5) })
		expect(result.current.label).toBe('00:05')
		expect(jest.getTimerCount()).toBe(1)
		// a stacked interval would drop 2 seconds per 1000ms here
		advance(1000)
		expect(result.current.label).toBe('00:04')
	})

	test('can run a second full countdown after the first one finishes', () => {
		const { result } = renderHook()
		act(() => { result.current.start(2) })
		advance(2000)
		expect(result.current.isDisabled).toBe(false)
		act(() => { result.current.start(2) })
		expect(result.current.label).toBe('00:02')
		expect(result.current.isDisabled).toBe(true)
		advance(2000)
		expect(result.current.label).toBe('Solicitar PIN')
	})
})

describe('unmount', () => {
	test('clears the running interval so no tick fires afterwards', () => {
		const { result, root } = renderHook()
		act(() => { result.current.start(60) })
		expect(jest.getTimerCount()).toBe(1)
		act(() => { root.unmount() })
		expect(jest.getTimerCount()).toBe(0)
	})
})
