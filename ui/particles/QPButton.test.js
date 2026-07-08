/**
 * Render tests for QPButton (and, through it, the QPPressable press contract).
 * @jest-environment node
 */
import { Text, ActivityIndicator, StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'

jest.mock('react-native-reanimated') // manual mock in /__mocks__/react-native-reanimated.js
jest.mock('@react-native-vector-icons/fontawesome6', () => {
	const MockIcon = () => null
	return { __esModule: true, default: MockIcon }
})
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})

import QPButton from './QPButton'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)
const MockIcon = require('@react-native-vector-icons/fontawesome6').default

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPButton title='Continuar' {...props} />) })
	return tree
}

// QPPressable handles touches via the Responder system, not a wrapping Pressable
const getPressable = (tree) => tree.root.findAllByProps({ accessibilityRole: 'button' })[0]
const press = async (tree) => {
	const pressable = getPressable(tree)
	await act(async () => {
		pressable.props.onResponderGrant()
		pressable.props.onResponderRelease()
	})
}

describe('QPButton', () => {

	test('renders the title', async () => {
		const tree = await render()
		expect(tree.root.findByType(Text).props.children).toBe('Continuar')
	})

	test('fires onPress when released', async () => {
		const onPress = jest.fn()
		const tree = await render({ onPress })
		await press(tree)
		expect(onPress).toHaveBeenCalledTimes(1)
	})

	test('does not fire onPress when disabled and dims to 50%', async () => {
		const onPress = jest.fn()
		const tree = await render({ onPress, disabled: true })
		const pressable = getPressable(tree)
		expect(pressable.props.onStartShouldSetResponder()).toBe(false)
		expect(StyleSheet.flatten(pressable.props.style).opacity).toBe(0.5)
		await press(tree)
		expect(onPress).not.toHaveBeenCalled()
	})

	test('loading swaps the content for a spinner and blocks presses', async () => {
		const onPress = jest.fn()
		const tree = await render({ onPress, loading: true })
		expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1)
		expect(tree.root.findAllByType(Text)).toHaveLength(0)
		await press(tree)
		expect(onPress).not.toHaveBeenCalled()
	})

	test('default variant uses the primary background', async () => {
		const tree = await render()
		const style = StyleSheet.flatten(getPressable(tree).props.style)
		expect(style.backgroundColor).toBe(theme.colors.primary)
	})

	test('danger outlined variant renders transparent bg with danger border and text', async () => {
		const tree = await render({ danger: true, outlined: true })
		const style = StyleSheet.flatten(getPressable(tree).props.style)
		expect(style.backgroundColor).toBe('transparent')
		expect(style.borderWidth).toBe(1.5)
		expect(style.borderColor).toBe(theme.colors.danger)
		expect(StyleSheet.flatten(tree.root.findByType(Text).props.style).color).toBe(theme.colors.danger)
	})

	test('renders an icon before the title when icon is set', async () => {
		const tree = await render({ icon: 'paper-plane' })
		expect(tree.root.findByType(MockIcon).props.name).toBe('paper-plane')
	})
})
