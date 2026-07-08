/**
 * Render tests for QPSectionHeader — muted title plus optional "Ver más" action.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import { Pressable, Text, StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPSectionHeader from './QPSectionHeader'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)

// Pressable is a React.memo — findByType needs the inner component
const PressableType = Pressable.type || Pressable

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPSectionHeader title='Transacciones' {...props} />) })
	return tree
}

describe('QPSectionHeader', () => {

	test('renders the muted title on the left', async () => {
		const tree = await render()
		const title = tree.root.findAllByType(Text)[0]
		expect(title.props.children).toBe('Transacciones')
		expect(StyleSheet.flatten(title.props.style).color).toBe(theme.colors.tertiaryText)
	})

	test('renders the action subtitle and icon in the primary color', async () => {
		const tree = await render({ subtitle: 'Ver más' })
		const action = tree.root.findAllByType(Text)[1]
		expect(action.props.children).toBe('Ver más')
		expect(StyleSheet.flatten(action.props.style).color).toBe(theme.colors.primary)
		const icon = tree.root.findByType('FontAwesome6')
		expect(icon.props.color).toBe(theme.colors.primary)
	})

	test('defaults the action icon to arrow-right and accepts an override', async () => {
		const def = await render({ subtitle: 'Ver más' })
		expect(def.root.findByType('FontAwesome6').props.name).toBe('arrow-right')
		const custom = await render({ subtitle: 'Filtrar', iconName: 'filter' })
		expect(custom.root.findByType('FontAwesome6').props.name).toBe('filter')
	})

	test('fires onPress from the action pressable', async () => {
		const onPress = jest.fn()
		const tree = await render({ subtitle: 'Ver más', onPress })
		await act(async () => { tree.root.findByType(PressableType).props.onPress() })
		expect(onPress).toHaveBeenCalledTimes(1)
	})
})
