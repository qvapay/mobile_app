/**
 * Render tests for QPPressable — the single-Animated.View press wrapper that
 * drives touch via RN's native Responder system (no wrapping Pressable).
 * @jest-environment node
 */
jest.mock('react-native-reanimated') // manual mock in /__mocks__/react-native-reanimated.js

import { StyleSheet, Text, View } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPPressable from './QPPressable'

const render = async (props) => {
	let tree
	await act(async () => {
		tree = create(
			<QPPressable {...props}>
				<Text>tap me</Text>
			</QPPressable>
		)
	})
	return tree
}

// With reanimated mocked, Animated.View IS the plain RN View
const wrapper = (tree) => tree.root.findByType(View)

describe('QPPressable', () => {

	test('renders children inside an accessible button', async () => {
		const tree = await render()
		const node = wrapper(tree)
		expect(node.props.accessibilityRole).toBe('button')
		expect(node.props.accessibilityState).toEqual({ disabled: false })
		expect(JSON.stringify(tree.toJSON())).toContain('tap me')
	})

	test('a full grant/release cycle fires onPressIn, onPressOut and onPress', async () => {
		const onPress = jest.fn()
		const onPressIn = jest.fn()
		const onPressOut = jest.fn()
		const tree = await render({ onPress, onPressIn, onPressOut })
		const node = wrapper(tree)
		expect(node.props.onStartShouldSetResponder()).toBe(true)
		await act(async () => { node.props.onResponderGrant() })
		expect(onPressIn).toHaveBeenCalledTimes(1)
		await act(async () => { node.props.onResponderRelease() })
		expect(onPressOut).toHaveBeenCalledTimes(1)
		expect(onPress).toHaveBeenCalledTimes(1)
	})

	test('a terminated gesture resets without firing onPress', async () => {
		const onPress = jest.fn()
		const onPressOut = jest.fn()
		const tree = await render({ onPress, onPressOut })
		const node = wrapper(tree)
		await act(async () => { node.props.onResponderGrant() })
		await act(async () => { node.props.onResponderTerminate() })
		expect(onPressOut).toHaveBeenCalledTimes(1)
		expect(onPress).not.toHaveBeenCalled()
	})

	test('disabled refuses the responder grab and swallows onPress', async () => {
		const onPress = jest.fn()
		const tree = await render({ onPress, disabled: true })
		const node = wrapper(tree)
		expect(node.props.onStartShouldSetResponder()).toBe(false)
		expect(node.props.accessibilityState).toEqual({ disabled: true })
		await act(async () => { node.props.onResponderRelease() })
		expect(onPress).not.toHaveBeenCalled()
	})

	test('carries the layout style itself — no extra wrapper element', async () => {
		const tree = await render({ style: { backgroundColor: 'red', padding: 4 } })
		const json = tree.toJSON()
		expect(json.type).toBe('View')
		expect(StyleSheet.flatten(json.props.style)).toMatchObject({ backgroundColor: 'red', padding: 4 })
	})

	describe('long press', () => {
		beforeEach(() => { jest.useFakeTimers() })
		afterEach(() => { jest.useRealTimers() })

		test('fires after delayLongPress and suppresses onPress on release', async () => {
			const onPress = jest.fn()
			const onLongPress = jest.fn()
			const tree = await render({ onPress, onLongPress, delayLongPress: 300 })
			const node = wrapper(tree)
			await act(async () => { node.props.onResponderGrant() })
			await act(async () => { jest.advanceTimersByTime(299) })
			expect(onLongPress).not.toHaveBeenCalled()
			await act(async () => { jest.advanceTimersByTime(1) })
			expect(onLongPress).toHaveBeenCalledTimes(1)
			await act(async () => { node.props.onResponderRelease() })
			expect(onPress).not.toHaveBeenCalled()
		})

		test('a release before the delay fires onPress, not onLongPress', async () => {
			const onPress = jest.fn()
			const onLongPress = jest.fn()
			const tree = await render({ onPress, onLongPress })
			const node = wrapper(tree)
			await act(async () => { node.props.onResponderGrant() })
			await act(async () => { jest.advanceTimersByTime(200) })
			await act(async () => { node.props.onResponderRelease() })
			await act(async () => { jest.advanceTimersByTime(1000) })
			expect(onPress).toHaveBeenCalledTimes(1)
			expect(onLongPress).not.toHaveBeenCalled()
		})

		test('a terminated gesture (scroll) cancels the pending long press', async () => {
			const onLongPress = jest.fn()
			const tree = await render({ onLongPress })
			const node = wrapper(tree)
			await act(async () => { node.props.onResponderGrant() })
			await act(async () => { node.props.onResponderTerminate() })
			await act(async () => { jest.advanceTimersByTime(1000) })
			expect(onLongPress).not.toHaveBeenCalled()
		})

		test('the next press after a long press works normally', async () => {
			const onPress = jest.fn()
			const onLongPress = jest.fn()
			const tree = await render({ onPress, onLongPress })
			const node = wrapper(tree)
			await act(async () => { node.props.onResponderGrant() })
			await act(async () => { jest.advanceTimersByTime(500) })
			await act(async () => { node.props.onResponderRelease() })
			await act(async () => { node.props.onResponderGrant() })
			await act(async () => { node.props.onResponderRelease() })
			expect(onLongPress).toHaveBeenCalledTimes(1)
			expect(onPress).toHaveBeenCalledTimes(1)
		})

		test('without onLongPress a held press is a plain press and no accessibility action is exposed', async () => {
			const onPress = jest.fn()
			const tree = await render({ onPress })
			const node = wrapper(tree)
			expect(node.props.accessibilityActions).toBeUndefined()
			expect(node.props.onAccessibilityAction).toBeUndefined()
			await act(async () => { node.props.onResponderGrant() })
			await act(async () => { jest.advanceTimersByTime(5000) })
			await act(async () => { node.props.onResponderRelease() })
			expect(onPress).toHaveBeenCalledTimes(1)
		})

		test('exposes a longpress accessibility action that calls the handler', async () => {
			const onLongPress = jest.fn()
			const tree = await render({ onLongPress })
			const node = wrapper(tree)
			expect(node.props.accessibilityActions).toEqual([{ name: 'longpress' }])
			await act(async () => { node.props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } }) })
			expect(onLongPress).toHaveBeenCalledTimes(1)
		})
	})

	test('opacity and none variants render without crashing', async () => {
		for (const variant of ['opacity', 'none']) {
			const tree = await render({ variant })
			expect(tree.toJSON()).not.toBeNull()
		}
	})
})
