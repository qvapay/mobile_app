/**
 * Render tests for QPMoneyInput — hero money field where color signals direction.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import { TextInput, StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPMoneyInput from './QPMoneyInput'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPMoneyInput {...props} />) })
	return tree
}

const inputOf = (tree) => tree.root.findByType(TextInput)

describe('QPMoneyInput', () => {

	test('type add paints digits and placeholder in success green', async () => {
		const tree = await render({ type: 'add' })
		const input = inputOf(tree)
		expect(StyleSheet.flatten(input.props.style).color).toBe(theme.colors.success)
		expect(input.props.placeholderTextColor).toBe(theme.colors.success)
	})

	test('any other type falls back to danger red (withdrawals)', async () => {
		const tree = await render({ type: 'withdraw' })
		const input = inputOf(tree)
		expect(StyleSheet.flatten(input.props.style).color).toBe(theme.colors.danger)
		expect(input.props.placeholderTextColor).toBe(theme.colors.danger)
	})

	test('renders the optional prefix icon in the matching direction color', async () => {
		const tree = await render({ type: 'add', prefixIconName: 'dollar-sign' })
		const icon = tree.root.findByType('FontAwesome6')
		expect(icon.props.name).toBe('dollar-sign')
		expect(icon.props.color).toBe(theme.colors.success)
	})

	test('omits the icon container without a prefixIconName', async () => {
		const tree = await render({})
		expect(tree.root.findAllByType('FontAwesome6')).toHaveLength(0)
	})

	test('hard-caps the amount at 8 characters', async () => {
		const tree = await render({})
		expect(inputOf(tree).props.maxLength).toBe(8)
	})

	test('a custom style override wins over the direction color', async () => {
		const tree = await render({ type: 'add', style: { color: 'white' } })
		expect(StyleSheet.flatten(inputOf(tree).props.style).color).toBe('white')
	})
})
