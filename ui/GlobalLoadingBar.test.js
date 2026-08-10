/**
 * Render tests for the global aurora loading veil — node environment with
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
		Easing: { inOut: (fn) => fn, sin: () => 0 },
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

const renderVeil = (isLoading) => {
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

test('never blocks touches and renders three aurora bands with vertical fades', () => {
	const tree = renderVeil(true)
	expect(tree.toJSON().props.pointerEvents).toBe('none')
	const bands = tree.root.findAllByType('LinearGradient')
	expect(bands).toHaveLength(3)
	// Every band holds its peak alpha across the top stretch, then fades to
	// fully transparent — no hard edge at the veil's bottom
	for (const band of bands) {
		expect(band.props.start).toEqual({ x: 0.5, y: 0 })
		expect(band.props.end).toEqual({ x: 0.5, y: 1 })
		expect(band.props.colors[0]).toBe(band.props.colors[1])
		expect(band.props.colors[3]).toMatch(/rgba\(.+, 0\)$/)
	}
	// First band uses the brand accent at an imperceptible alpha
	expect(bands[0].props.colors[0]).toBe('rgba(103, 89, 239, 0.08)')
})

test('loading fades the veil in (400ms) and starts every band drift', () => {
	renderVeil(true)
	expect(timingCalls.some(c => c.v === 1 && c.cfg?.duration === 400)).toBe(true)
	// One drift loop per band, each with its own period
	for (const duration of [5200, 6800, 8400]) {
		expect(timingCalls.some(c => c.v === 1 && c.cfg?.duration === duration)).toBe(true)
	}
	expect(cancelled).toHaveLength(0)
})

test('idle cancels the drifts and fades out over 600ms', () => {
	renderVeil(false)
	expect(cancelled).toHaveLength(3)
	expect(timingCalls.some(c => c.v === 0 && c.cfg?.duration === 600)).toBe(true)
})
