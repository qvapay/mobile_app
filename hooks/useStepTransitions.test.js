/**
 * Unit tests for the wizard step-transition worklet factories, rendered with
 * react-test-renderer in the node environment. Reanimated is replaced with a
 * manual mock whose animation builders return inspectable descriptors, so the
 * worklets can be called as plain functions and their output asserted.
 * @jest-environment node
 */
jest.mock('react-native-reanimated', () => {
	const React = require('react')
	return {
		Easing: { out: (fn) => fn, quad: () => {} },
		useSharedValue: (initial) => React.useRef({ value: initial }).current,
		withDelay: (delayMs, animation) => ({ kind: 'delay', delayMs, animation }),
		withSpring: (toValue, config) => ({ kind: 'spring', toValue, config }),
		withTiming: (toValue, config) => ({ kind: 'timing', toValue, config }),
	}
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import useStepTransitions from './useStepTransitions'

// Minimal hook harness: renders the hook inside a throwaway component and
// exposes its latest return value through `result.current`.
const renderHook = () => {
	const result = { current: null }
	const Harness = () => {
		result.current = useStepTransitions()
		return null
	}
	let root
	act(() => { root = create(React.createElement(Harness)) })
	return { result, root }
}

describe('direction shared value', () => {
	test('defaults to forward (1)', () => {
		const { result } = renderHook()
		expect(result.current.direction.value).toBe(1)
	})
})

describe('makeStepEnter', () => {
	test('enters from the right when moving forward', () => {
		const { result } = renderHook()
		const { initialValues } = result.current.makeStepEnter()({})
		expect(initialValues.opacity).toBe(0)
		expect(initialValues.transform).toEqual([{ translateX: 90 }, { scale: 0.96 }])
	})

	test('enters from the left when moving back', () => {
		const { result } = renderHook()
		result.current.direction.value = -1
		const { initialValues } = result.current.makeStepEnter()({})
		expect(initialValues.transform[0]).toEqual({ translateX: -90 })
	})

	test('reads the direction at animation time, not at build time', () => {
		const { result } = renderHook()
		const enter = result.current.makeStepEnter()
		result.current.direction.value = -1
		const { initialValues } = enter({})
		expect(initialValues.transform[0]).toEqual({ translateX: -90 })
	})

	test('animates opacity to 1 over 320ms and springs position/scale home', () => {
		const { result } = renderHook()
		const { animations } = result.current.makeStepEnter()({})
		expect(animations.opacity).toEqual({
			kind: 'delay',
			delayMs: 0,
			animation: { kind: 'timing', toValue: 1, config: { duration: 320 } },
		})
		expect(animations.transform[0].translateX.animation).toEqual({
			kind: 'spring',
			toValue: 0,
			config: { mass: 0.8, damping: 18, stiffness: 170 },
		})
		expect(animations.transform[1].scale.animation).toEqual({
			kind: 'spring',
			toValue: 1,
			config: { mass: 0.8, damping: 18, stiffness: 170 },
		})
	})

	test('applies the stagger delay to every animated prop', () => {
		const { result } = renderHook()
		const { animations } = result.current.makeStepEnter(150)({})
		expect(animations.opacity.delayMs).toBe(150)
		expect(animations.transform[0].translateX.delayMs).toBe(150)
		expect(animations.transform[1].scale.delayMs).toBe(150)
	})
})

describe('stepExit', () => {
	test('starts from the fully-visible resting pose', () => {
		const { result } = renderHook()
		const { initialValues } = result.current.stepExit({})
		expect(initialValues.opacity).toBe(1)
		expect(initialValues.transform).toEqual([{ translateX: 0 }, { scale: 1 }])
	})

	test('slides out opposite to the travel direction', () => {
		const { result } = renderHook()
		const forward = result.current.stepExit({})
		expect(forward.animations.transform[0].translateX.toValue).toBe(-60)
		result.current.direction.value = -1
		const backward = result.current.stepExit({})
		expect(backward.animations.transform[0].translateX.toValue).toBe(60)
	})

	test('fades and shrinks with the documented timings', () => {
		const { result } = renderHook()
		const { animations } = result.current.stepExit({})
		expect(animations.opacity).toMatchObject({ kind: 'timing', toValue: 0, config: { duration: 180 } })
		expect(animations.transform[0].translateX.config.duration).toBe(220)
		expect(animations.transform[1].scale).toMatchObject({ kind: 'timing', toValue: 0.98, config: { duration: 220 } })
	})
})

describe('memoization', () => {
	test('the factories keep their identity across re-renders', () => {
		const result = { current: null }
		const Harness = () => {
			result.current = useStepTransitions()
			return null
		}
		let root
		act(() => { root = create(React.createElement(Harness)) })
		const first = result.current
		act(() => { root.update(React.createElement(Harness)) })
		expect(result.current.makeStepEnter).toBe(first.makeStepEnter)
		expect(result.current.stepExit).toBe(first.stepExit)
		expect(result.current.direction).toBe(first.direction)
	})
})
