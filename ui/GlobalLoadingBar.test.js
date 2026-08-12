/**
 * Render tests for the global aurora loading veil (Skia shader curtain) —
 * node environment with reanimated, Skia and the contexts mocked
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
const timingCalls = []
const repeatCalls = []
const cancelled = []
let mockReducedMotion = false
jest.mock('react-native-reanimated', () => {
	const React = require('react')
	const { View } = require('react-native')
	return {
		__esModule: true,
		default: { View },
		useSharedValue: (v) => React.useRef({ value: v }).current,
		useAnimatedStyle: () => ({}),
		useDerivedValue: (fn) => ({ value: fn() }),
		useReducedMotion: () => mockReducedMotion,
		withTiming: (v, cfg) => {
			timingCalls.push({ v, cfg })
			return v
		},
		withRepeat: (v, times, reverse) => {
			repeatCalls.push({ times, reverse })
			return v
		},
		cancelAnimation: (sv) => { cancelled.push(sv) },
		Easing: { linear: 'linear' },
	}
})
const makeCalls = []
jest.mock('@shopify/react-native-skia', () => ({
	Canvas: 'Canvas',
	Fill: 'Fill',
	Shader: 'Shader',
	Skia: {
		RuntimeEffect: {
			Make: (sksl) => {
				makeCalls.push(sksl)
				return { sksl }
			},
		},
	},
}))
let mockIsDark = true
let mockAccent = 'default'
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(mockIsDark, 1.0, mockAccent) }) }
})
jest.mock('../loading/LoadingContext', () => ({ useLoading: jest.fn() }))

import React from 'react'
import { Dimensions } from 'react-native'
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
	jest.useFakeTimers()
	timingCalls.length = 0
	repeatCalls.length = 0
	cancelled.length = 0
	mockReducedMotion = false
	mockIsDark = true
	mockAccent = 'default'
})

afterEach(() => {
	jest.useRealTimers()
})

test('the aurora SkSL compiles once with the veil-specific uniforms', () => {
	expect(makeCalls).toHaveLength(1)
	const sksl = makeCalls[0]
	for (const uniform of ['u_res', 'u_t', 'u_gain', 'u_tint_strong', 'u_tint_weak']) {
		expect(sksl).toContain(uniform)
	}
	// Premultiplied output — the veil composites over live UI, it does not
	// paint the source's opaque backdrop
	expect(sksl).toContain('half4(tint * a, a)')
	expect(sksl).not.toContain('u_pull')
})

test('loading mounts the shader canvas without blocking touches', () => {
	const tree = renderVeil(true)
	expect(tree.toJSON().props.pointerEvents).toBe('none')
	expect(tree.root.findAllByType('Canvas')).toHaveLength(1)
	const shader = tree.root.findByType('Shader')
	expect(shader.props.source).toEqual({ sksl: makeCalls[0] })
	// Uniforms carry the full window size (the shader works in screen-heights),
	// the gain and the accent-derived tint ramp
	const { width, height } = Dimensions.get('window')
	expect(shader.props.uniforms.value).toEqual({
		u_res: [width, height],
		u_t: expect.any(Number),
		u_gain: expect.any(Number),
		u_tint_strong: expect.any(Array),
		u_tint_weak: expect.any(Array),
	})
})

test('light mode shows a quieter saturated mist instead of near-white light', () => {
	mockIsDark = false
	const tree = renderVeil(true)
	expect(tree.root.findAllByType('Canvas')).toHaveLength(1)
	const { u_tint_strong } = tree.root.findByType('Shader').props.uniforms.value
	// Near-white light is invisible on light surfaces, so the strong end stays
	// close to the saturated accent (#6759EF — blue-dominant, red channel still
	// well under 0.5) rather than a pastel
	expect(u_tint_strong[2]).toBeGreaterThan(u_tint_strong[0])
	expect(u_tint_strong[0]).toBeLessThan(0.5)
})

test('dark mode carries the selected accent, lifted towards white', () => {
	mockAccent = 'emerald' // #10B981
	const shader = renderVeil(true).root.findByType('Shader')
	const { u_tint_strong: strong, u_tint_weak: weak } = shader.props.uniforms.value
	// Green-dominant light for an emerald accent…
	expect(strong[1]).toBeGreaterThan(strong[0])
	expect(strong[1]).toBeGreaterThan(strong[2])
	// …never the saturated accent itself: every channel is lifted towards white
	const emerald = [0x10, 0xb9, 0x81].map(c => c / 255)
	strong.forEach((channel, i) => {
		expect(channel).toBeGreaterThan(emerald[i])
		expect(channel).toBeLessThanOrEqual(1)
	})
	// The weak end is the same hue washed further out (lighter on every channel)
	weak.forEach((channel, i) => expect(channel).toBeGreaterThan(strong[i]))
})

test('loading fades the veil in (400ms) and runs the seamless master loop', () => {
	renderVeil(true)
	expect(timingCalls.some(c => c.v === 1 && c.cfg?.duration === 400)).toBe(true)
	// One 14s linear phase loop; non-reversing, so the wrap relies on the
	// shader's whole-number rates rather than a ping-pong
	expect(timingCalls.some(c => c.v === 1 && c.cfg?.duration === 14000 && c.cfg?.easing === 'linear')).toBe(true)
	expect(repeatCalls).toEqual([{ times: -1, reverse: false }])
	expect(cancelled).toHaveLength(0)
})

test('reduced motion shows a static frame instead of the loop', () => {
	mockReducedMotion = true
	const tree = renderVeil(true)
	expect(tree.root.findAllByType('Canvas')).toHaveLength(1)
	expect(repeatCalls).toHaveLength(0)
	expect(timingCalls.some(c => c.cfg?.duration === 14000)).toBe(false)
})

test('idle fades out over 600ms, then unmounts and only then stops the loop', () => {
	useLoading.mockReturnValue({ isLoading: true })
	let tree
	act(() => { tree = create(<GlobalLoadingBar />) })

	useLoading.mockReturnValue({ isLoading: false })
	act(() => { tree.update(<GlobalLoadingBar />) })
	// Still mounted while the fade-out plays — and the rays keep moving through
	// it: the phase loop is NOT cancelled the moment loading stops
	expect(timingCalls.some(c => c.v === 0 && c.cfg?.duration === 600)).toBe(true)
	expect(tree.root.findAllByType('Canvas')).toHaveLength(1)
	expect(cancelled).toHaveLength(0)

	// After the fade the canvas unmounts entirely (an idle veil costs nothing)
	// and the loop is cancelled with it
	act(() => { jest.advanceTimersByTime(700) })
	expect(tree.toJSON()).toBeNull()
	expect(cancelled).toHaveLength(1)
})

test('back-to-back requests never reset the phase mid-view (no visible jump)', () => {
	useLoading.mockReturnValue({ isLoading: true })
	let tree
	act(() => { tree = create(<GlobalLoadingBar />) })
	expect(repeatCalls).toHaveLength(1)

	// A new request lands while the veil is still fading out…
	useLoading.mockReturnValue({ isLoading: false })
	act(() => { tree.update(<GlobalLoadingBar />) })
	useLoading.mockReturnValue({ isLoading: true })
	act(() => { tree.update(<GlobalLoadingBar />) })

	// …and the running loop is left untouched: no cancel, no second start —
	// a phase reset here would teleport the whole field in plain sight
	expect(cancelled).toHaveLength(0)
	expect(repeatCalls).toHaveLength(1)

	// The pending unmount was aborted too: the veil just fades back in
	act(() => { jest.advanceTimersByTime(700) })
	expect(tree.root.findAllByType('Canvas')).toHaveLength(1)
})

test('never mounted at all while idle from the start', () => {
	const tree = renderVeil(false)
	expect(tree.toJSON()).toBeNull()
})
