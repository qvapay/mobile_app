/**
 * Render tests for QPPill.
 * @jest-environment node
 */
import { Pressable, Text, StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'

jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})

import QPPill from './QPPill'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)

// Pressable is a React.memo — findByType needs the inner component
const PressableType = Pressable.type || Pressable

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPPill title='KYC' {...props} />) })
	return tree
}

describe('QPPill', () => {

	test('renders the title', async () => {
		const tree = await render()
		expect(tree.root.findByType(Text).props.children).toBe('KYC')
	})

	test('uses the surface background and hairline border from the theme', async () => {
		const tree = await render()
		const style = StyleSheet.flatten(tree.root.findByType(PressableType).props.style)
		expect(style.backgroundColor).toBe(theme.colors.surface)
		expect(style.borderColor).toBe(theme.colors.border)
		expect(style.borderWidth).toBe(1)
	})

	test('fires the optional onPress handler', async () => {
		const onPress = jest.fn()
		const tree = await render({ onPress })
		await act(async () => { tree.root.findByType(PressableType).props.onPress() })
		expect(onPress).toHaveBeenCalledTimes(1)
	})

	test('merges a custom style override', async () => {
		const tree = await render({ style: { backgroundColor: 'red' } })
		const style = StyleSheet.flatten(tree.root.findByType(PressableType).props.style)
		expect(style.backgroundColor).toBe('red')
	})
})
