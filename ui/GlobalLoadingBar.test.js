/**
 * Render tests for the global top loading bar — node environment with
 * reanimated, LinearGradient and the contexts mocked
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
const timingCalls = []
const cancelled = []
jest.mock('react-native-reanimated', () => {
	const React = require('react')
	const { View } = require('react-native')
	return {
		__esModule: true,
		default: {
			View,
			createAnimatedComponent: (C) => C,
		},
		useSharedValue: (v) => React.useRef({ value: v }).current,
		useAnimatedStyle: () => ({}),
		withTiming: (v, cfg) => {
			timingCalls.push({ v, cfg })
			return v
		},
		withRepeat: (v) => v,
		cancelAnimation: (sv) => { cancelled.push(sv) },
	}
})
jest.mock('react-native-linear-gradient', () => 'LinearGradient')
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../loading/LoadingContext', () => ({ useLoading: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useLoading } from '../loading/LoadingContext'
import GlobalLoadingBar from './GlobalLoadingBar'

const renderBar = (isLoading) => {
	useLoading.mockReturnValue({ isLoading })
	let tree
	act(() => { tree = create(<GlobalLoadingBar />) })
	return tree
}

beforeEach(() => {
	jest.clearAllMocks()
	timingCalls.length = 0
	cancelled.length = 0
})

test('never blocks touches and sweeps a brand-colored gradient', () => {
	const tree = renderBar(true)
	expect(tree.toJSON().props.pointerEvents).toBe('none')
	const gradient = tree.root.findByType('LinearGradient')
	expect(gradient.props.colors).toEqual(['transparent', '#6759EF', '#6759EF', 'transparent'])
})

test('loading fades the bar in (150ms) and starts the shimmer sweep', () => {
	renderBar(true)
	expect(timingCalls.some(c => c.v === 1 && c.cfg?.duration === 150)).toBe(true)
	expect(timingCalls.some(c => c.v === 1 && c.cfg?.duration === 1000)).toBe(true) // repeat sweep
	expect(cancelled).toHaveLength(0)
})

test('idle cancels the sweep and fades out over 300ms', () => {
	renderBar(false)
	expect(cancelled).toHaveLength(1)
	expect(timingCalls.some(c => c.v === 0 && c.cfg?.duration === 300)).toBe(true)
})
