/**
 * Render tests for the reanimated tab bar wrapper — node environment with the
 * reanimated manual mock, BottomBarContext and React Navigation's BottomTabBar
 * mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native-reanimated')
jest.mock('@react-navigation/bottom-tabs', () => ({ BottomTabBar: 'BottomTabBar' }))
jest.mock('./BottomBarContext', () => ({
	useBottomBar: () => ({ bottomBarVisible: { value: 1 } }),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import AnimatedTabBar from './AnimatedTabBar'

const renderBar = (props = {}) => {
	let tree
	act(() => { tree = create(<AnimatedTabBar state={{ index: 0 }} extra='x' {...props} />) })
	return tree
}

test('passes every React Navigation prop through to the real BottomTabBar', () => {
	const state = { index: 1, routes: [] }
	const bar = renderBar({ state }).root.findByType('BottomTabBar')
	expect(bar.props.state).toBe(state)
	expect(bar.props.extra).toBe('x')
})

test('measures its own height via onLayout without crashing', () => {
	const tree = renderBar()
	const wrapper = tree.root.findAll(n => typeof n.props.onLayout === 'function')[0]
	act(() => { wrapper.props.onLayout({ nativeEvent: { layout: { height: 80 } } }) })
	expect(tree.root.findByType('BottomTabBar')).toBeTruthy()
})
