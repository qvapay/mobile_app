/**
 * Tests for the header payment-window countdown: label format, the
 * green → warning (<15 min) → danger (<5 min) urgency colors, the 1s tick and
 * the null render without a window — node environment with the real dark theme
 * (see P2PCreate.test.js for the theme-mock pattern).
 * @jest-environment node
 */
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import P2PHeaderTimer from './P2PHeaderTimer'

// Dark palette urgency colors (createTheme(true))
const GREEN = '#7BFFB1'
const ORANGE = '#ff9f43'
const RED = '#DB253E'

const renderTimer = (minutesLeft) => {
	let tree
	act(() => {
		tree = create(
			<P2PHeaderTimer
				expiresAt={minutesLeft == null ? null : new Date(Date.now() + minutesLeft * 60000 + 500).toISOString()}
			/>
		)
	})
	return tree
}

const dump = (tree) => JSON.stringify(tree.toJSON())

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers() })

test('renders nothing without a window', () => {
	expect(renderTimer(null).toJSON()).toBeNull()
})

test('a comfortable window renders the m:ss label in green', () => {
	const out = dump(renderTimer(45))
	expect(out).toContain('45:00')
	expect(out).toContain(GREEN)
	expect(out).not.toContain(RED)
})

test('under 15 minutes the timer turns warning-colored', () => {
	const out = dump(renderTimer(14))
	expect(out).toContain('14:00')
	expect(out).toContain(ORANGE)
})

test('under 5 minutes (and at zero) the timer turns danger-colored', () => {
	expect(dump(renderTimer(4))).toContain(RED)
	expect(dump(renderTimer(0))).toContain(RED)
})

test('ticks down once per second', () => {
	const tree = renderTimer(45)
	act(() => { jest.advanceTimersByTime(61000) })
	expect(dump(tree)).toContain('43:59')
})

test('crossing a threshold while mounted switches the color live', () => {
	const tree = renderTimer(15)
	expect(dump(tree)).toContain(GREEN)
	act(() => { jest.advanceTimersByTime(61000) })
	const out = dump(tree)
	expect(out).toContain('13:59')
	expect(out).toContain(ORANGE)
})
