/**
 * Unit tests for the PIN/OTP confirmation state hook — method toggle, derived
 * code length and imperative refocus via the QPCodeInput ref. The digit-box
 * mechanics moved to ui/particles/QPCodeInput (see its test file); this hook
 * only owns state. Rendered with react-test-renderer in the node environment
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import React from 'react'
import { act, create } from 'react-test-renderer'
import usePinEntry from './usePinEntry'

// Minimal hook harness: renders the hook inside a throwaway component and
// exposes its latest return value through `result.current`.
const renderHook = () => {
	const result = { current: null }
	const Harness = () => {
		result.current = usePinEntry()
		return null
	}
	let root
	act(() => { root = create(React.createElement(Harness)) })
	return { result, root }
}

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers() })

describe('initial state', () => {
	test('starts empty, in pin mode with 4 boxes', () => {
		const { result } = renderHook()
		expect(result.current.pin).toBe('')
		expect(result.current.twoFactorMethod).toBe('pin')
		expect(result.current.codeLength).toBe(4)
		expect(result.current.codeInputRef.current).toBeNull()
	})
})

describe('setPin', () => {
	test('updates the entered code', () => {
		const { result } = renderHook()
		act(() => { result.current.setPin('1234') })
		expect(result.current.pin).toBe('1234')
	})
})

describe('handleMethodToggle', () => {
	test('right switches to otp: 6 boxes, code reset, first box refocused', () => {
		const { result } = renderHook()
		const focus = jest.fn()
		result.current.codeInputRef.current = { focus }
		act(() => { result.current.setPin('12') })
		act(() => { result.current.handleMethodToggle('right') })
		expect(result.current.twoFactorMethod).toBe('otp')
		expect(result.current.codeLength).toBe(6)
		expect(result.current.pin).toBe('')
		act(() => { jest.runAllTimers() })
		expect(focus).toHaveBeenCalledWith(0)
	})

	test('left switches back to pin (4 boxes)', () => {
		const { result } = renderHook()
		act(() => { result.current.handleMethodToggle('right') })
		act(() => { result.current.handleMethodToggle('left') })
		expect(result.current.twoFactorMethod).toBe('pin')
		expect(result.current.codeLength).toBe(4)
	})

	test('re-selecting the current method is a no-op (keeps the entered code)', () => {
		const { result } = renderHook()
		const focus = jest.fn()
		result.current.codeInputRef.current = { focus }
		act(() => { result.current.setPin('12') })
		act(() => { result.current.handleMethodToggle('left') })
		expect(result.current.pin).toBe('12')
		act(() => { jest.runAllTimers() })
		expect(focus).not.toHaveBeenCalled()
	})

	test('survives a null ref (no crash when the input is unmounted)', () => {
		const { result } = renderHook()
		act(() => { result.current.handleMethodToggle('right') })
		expect(() => { act(() => { jest.runAllTimers() }) }).not.toThrow()
	})
})
