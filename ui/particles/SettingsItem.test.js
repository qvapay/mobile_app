/**
 * Render tests for SettingsItem — settings row with grouped corner rounding.
 * @jest-environment node
 */
import { Text, StyleSheet } from 'react-native'
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

import SettingsItem from './SettingsItem'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)

const render = async (props) => {
	let tree
	await act(async () => {
		tree = create(<SettingsItem title='Seguridad' screen='SecurityScreen' index={0} totalItems={3} navigation={{ navigate: jest.fn() }} {...props} />)
	})
	return tree
}

const getPressable = (tree) => tree.root.findAllByProps({ accessibilityRole: 'button' })[0]
const press = async (tree) => {
	const pressable = getPressable(tree)
	await act(async () => {
		pressable.props.onResponderGrant()
		pressable.props.onResponderRelease()
	})
}

describe('SettingsItem', () => {

	test('renders the title', async () => {
		const tree = await render()
		expect(tree.root.findByType(Text).props.children).toBe('Seguridad')
	})

	test('pressing the row navigates to the target screen', async () => {
		const navigation = { navigate: jest.fn() }
		const tree = await render({ navigation })
		await press(tree)
		expect(navigation.navigate).toHaveBeenCalledWith('SecurityScreen')
	})

	test('disabled dims the row and blocks navigation', async () => {
		const navigation = { navigate: jest.fn() }
		const tree = await render({ navigation, disabled: true })
		expect(StyleSheet.flatten(getPressable(tree).props.style).opacity).toBe(0.5)
		await press(tree)
		expect(navigation.navigate).not.toHaveBeenCalled()
	})

	test('rounds only the outer corners of the group', async () => {
		const first = await render({ index: 0, totalItems: 3 })
		const firstStyle = StyleSheet.flatten(getPressable(first).props.style)
		expect(firstStyle.borderTopLeftRadius).toBe(10)
		expect(firstStyle.borderBottomLeftRadius).toBe(0)

		const middle = await render({ index: 1, totalItems: 3 })
		const middleStyle = StyleSheet.flatten(getPressable(middle).props.style)
		expect(middleStyle.borderTopLeftRadius).toBe(0)
		expect(middleStyle.borderBottomLeftRadius).toBe(0)

		const last = await render({ index: 2, totalItems: 3 })
		const lastStyle = StyleSheet.flatten(getPressable(last).props.style)
		expect(lastStyle.borderTopLeftRadius).toBe(0)
		expect(lastStyle.borderBottomLeftRadius).toBe(10)
		expect(lastStyle.marginBottom).toBe(10)
	})

	test('shows the red alert dot only when showBadge is set', async () => {
		const isBadgeDot = (node) => {
			if (typeof node.type !== 'string' || !node.props.style) return false
			const style = StyleSheet.flatten(node.props.style)
			return style.width === 8 && style.height === 8 && style.backgroundColor === theme.colors.danger
		}
		const withBadge = await render({ showBadge: true })
		expect(withBadge.root.findAll(isBadgeDot).length).toBeGreaterThan(0)
		const withoutBadge = await render()
		expect(withoutBadge.root.findAll(isBadgeDot)).toHaveLength(0)
	})
})
