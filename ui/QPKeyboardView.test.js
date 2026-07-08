/**
 * Render tests for the keyboard-aware form container (manual Keyboard
 * listeners + pinned actions footer) — node environment with theme and
 * safe-area mocked and Keyboard.addListener spied (see keypadAmount.test.js).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))

import React from 'react'
import { Keyboard, ScrollView, Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPKeyboardView from './QPKeyboardView'

let listeners
let removers

beforeEach(() => {
	listeners = {}
	removers = []
	jest.spyOn(Keyboard, 'addListener').mockImplementation((event, cb) => {
		listeners[event] = cb
		const sub = { remove: jest.fn() }
		removers.push(sub)
		return sub
	})
})

afterEach(() => { jest.restoreAllMocks() })

const renderView = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<QPKeyboardView {...props}>
				<Text>FORM CONTENT</Text>
			</QPKeyboardView>
		)
	})
	return tree
}

test('renders the children inside the scroll area', () => {
	const out = JSON.stringify(renderView().toJSON())
	expect(out).toContain('FORM CONTENT')
})

test('the actions footer only renders when provided, padded by the safe area', () => {
	expect(JSON.stringify(renderView().toJSON())).not.toContain('SUBMIT')
	const out = JSON.stringify(renderView({ actions: <Text>SUBMIT</Text> }).toJSON())
	expect(out).toContain('SUBMIT')
	expect(out).toContain('"paddingBottom":34') // insets.bottom while keyboard is hidden
})

test('keyboard show pads the container and tightens the footer; hide restores it', () => {
	const tree = renderView({ actions: <Text>SUBMIT</Text> })
	act(() => { listeners.keyboardWillShow({ endCoordinates: { height: 250 } }) })
	let out = JSON.stringify(tree.toJSON())
	expect(out).toContain('"paddingBottom":250')
	expect(out).toContain('"paddingBottom":8')
	act(() => { listeners.keyboardWillHide() })
	out = JSON.stringify(tree.toJSON())
	expect(out).not.toContain('"paddingBottom":250')
	expect(out).toContain('"paddingBottom":34')
})

test('spreads extra scrollViewProps onto the ScrollView', () => {
	const tree = renderView({ scrollViewProps: { testID: 'form-scroll', horizontal: true } })
	const scroll = tree.root.findByType(ScrollView)
	expect(scroll.props.testID).toBe('form-scroll')
	expect(scroll.props.horizontal).toBe(true)
	expect(scroll.props.keyboardShouldPersistTaps).toBe('handled')
})

test('removes both keyboard listeners on unmount', () => {
	const tree = renderView()
	expect(removers).toHaveLength(2)
	act(() => { tree.unmount() })
	removers.forEach(sub => expect(sub.remove).toHaveBeenCalled())
})
