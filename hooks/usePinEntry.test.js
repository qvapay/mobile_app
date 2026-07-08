/**
 * Unit tests for the multi-box PIN/OTP input mechanics, rendered with
 * react-test-renderer in the node environment (see keypadAmount.test.js for why).
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

// One mock TextInput ref per box, each with a spyable focus()
const mockRefs = (count) => Array.from({ length: count }, () => ({ focus: jest.fn() }))

// Backspace key event as React Native delivers it
const backspace = { nativeEvent: { key: 'Backspace' } }

describe('initial state', () => {
	test('starts empty, in pin mode with 4 boxes and nothing focused', () => {
		const { result } = renderHook()
		expect(result.current.pin).toBe('')
		expect(result.current.twoFactorMethod).toBe('pin')
		expect(result.current.codeLength).toBe(4)
		expect(result.current.focusedInputIndex).toBeNull()
		expect(result.current.pinInputsRef.current).toEqual([])
	})
})

describe('handlePinChange — single digit', () => {
	test('stores the digit and advances focus to the next box', () => {
		const { result } = renderHook()
		const refs = mockRefs(4)
		result.current.pinInputsRef.current = refs
		act(() => { result.current.handlePinChange('7', 0) })
		expect(result.current.pin).toBe('7')
		expect(refs[1].focus).toHaveBeenCalledTimes(1)
	})

	test('typing sequentially fills the whole code', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('1', 0) })
		act(() => { result.current.handlePinChange('2', 1) })
		act(() => { result.current.handlePinChange('3', 2) })
		act(() => { result.current.handlePinChange('4', 3) })
		expect(result.current.pin).toBe('1234')
	})

	test('does not advance focus past the last box', () => {
		const { result } = renderHook()
		const refs = mockRefs(4)
		result.current.pinInputsRef.current = refs
		act(() => { result.current.handlePinChange('9', 3) })
		expect(result.current.pin).toBe('9')
		refs.forEach((ref) => expect(ref.focus).not.toHaveBeenCalled())
	})

	test('filters out non-numeric characters and keeps focus in place', () => {
		const { result } = renderHook()
		const refs = mockRefs(4)
		result.current.pinInputsRef.current = refs
		act(() => { result.current.handlePinChange('a', 0) })
		expect(result.current.pin).toBe('')
		expect(refs[1].focus).not.toHaveBeenCalled()
	})

	test('overwrites an already-filled box', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('1', 0) })
		act(() => { result.current.handlePinChange('8', 0) })
		expect(result.current.pin).toBe('8')
	})

	test('survives missing input refs (optional chaining)', () => {
		const { result } = renderHook()
		expect(() => {
			act(() => { result.current.handlePinChange('5', 0) })
		}).not.toThrow()
		expect(result.current.pin).toBe('5')
	})
})

describe('handlePinChange — paste', () => {
	test('pasting the full code fills every box and focuses the last one', () => {
		const { result } = renderHook()
		const refs = mockRefs(4)
		result.current.pinInputsRef.current = refs
		act(() => { result.current.handlePinChange('1234', 0) })
		expect(result.current.pin).toBe('1234')
		expect(refs[3].focus).toHaveBeenCalledTimes(1)
	})

	test('a paste longer than the code is truncated to codeLength', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('123456789', 0) })
		expect(result.current.pin).toBe('1234')
	})

	test('pasting mid-way fills from that index and drops the overflow', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('1', 0) })
		act(() => { result.current.handlePinChange('2', 1) })
		act(() => { result.current.handlePinChange('345', 2) })
		expect(result.current.pin).toBe('1234')
	})

	test('non-digits inside the pasted text are stripped before splitting', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('1-2 3.4', 0) })
		expect(result.current.pin).toBe('1234')
	})
})

describe('handleKeyPress — backspace', () => {
	test('clears the digit in the current box', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('1', 0) })
		act(() => { result.current.handlePinChange('2', 1) })
		act(() => { result.current.handleKeyPress(backspace, 1) })
		expect(result.current.pin).toBe('1')
	})

	test('on an empty box it clears the previous digit and steps focus back', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('1', 0) })
		const refs = mockRefs(4)
		result.current.pinInputsRef.current = refs
		act(() => { result.current.handleKeyPress(backspace, 1) })
		expect(result.current.pin).toBe('')
		expect(refs[0].focus).toHaveBeenCalledTimes(1)
	})

	test('is a no-op on an empty first box', () => {
		const { result } = renderHook()
		act(() => { result.current.handleKeyPress(backspace, 0) })
		expect(result.current.pin).toBe('')
	})

	test('ignores every other key', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('1', 0) })
		act(() => { result.current.handleKeyPress({ nativeEvent: { key: 'Enter' } }, 0) })
		expect(result.current.pin).toBe('1')
	})
})

describe('focus tracking', () => {
	test('handleFocus stores the index and handleBlur clears it', () => {
		const { result } = renderHook()
		act(() => { result.current.handleFocus(2) })
		expect(result.current.focusedInputIndex).toBe(2)
		act(() => { result.current.handleBlur() })
		expect(result.current.focusedInputIndex).toBeNull()
	})
})

describe('handleMethodToggle', () => {
	beforeEach(() => { jest.useFakeTimers() })
	afterEach(() => { jest.useRealTimers() })

	test('switching to otp resets the code, resizes to 6 boxes and refocuses box 0', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('1', 0) })
		act(() => { result.current.handleMethodToggle('right') })
		expect(result.current.twoFactorMethod).toBe('otp')
		expect(result.current.codeLength).toBe(6)
		expect(result.current.pin).toBe('')
		expect(result.current.pinInputsRef.current).toHaveLength(6)
		const firstBox = { focus: jest.fn() }
		result.current.pinInputsRef.current[0] = firstBox
		act(() => { jest.runAllTimers() })
		expect(firstBox.focus).toHaveBeenCalledTimes(1)
	})

	test('switching back to pin resizes to 4 boxes', () => {
		const { result } = renderHook()
		act(() => { result.current.handleMethodToggle('right') })
		act(() => { result.current.handleMethodToggle('left') })
		expect(result.current.twoFactorMethod).toBe('pin')
		expect(result.current.codeLength).toBe(4)
		expect(result.current.pinInputsRef.current).toHaveLength(4)
	})

	test('toggling to the side already active keeps the entered code', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('1', 0) })
		act(() => { result.current.handleMethodToggle('left') })
		expect(result.current.twoFactorMethod).toBe('pin')
		expect(result.current.pin).toBe('1')
	})
})

describe('known quirk — sparse entry', () => {
	// Documents current behavior: `pin` is a plain string, so skipping a box
	// collapses the hole ('1' in box 0 + '3' in box 2 joins to '13', not '1_3').
	// Harmless with the real UI (focus forces sequential entry) but worth pinning.
	test('a skipped box collapses instead of leaving a gap', () => {
		const { result } = renderHook()
		act(() => { result.current.handlePinChange('1', 0) })
		act(() => { result.current.handlePinChange('3', 2) })
		expect(result.current.pin).toBe('13')
	})
})
