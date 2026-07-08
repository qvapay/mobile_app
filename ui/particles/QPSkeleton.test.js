/**
 * Render tests for QPSkeleton.
 * @jest-environment node
 */
import { StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'

jest.mock('react-native-reanimated') // manual mock in /__mocks__/react-native-reanimated.js
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})

import QPSkeleton from './QPSkeleton'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPSkeleton width={120} height={16} {...props} />) })
	return tree
}

describe('QPSkeleton', () => {

	test('renders a block with the given dimensions and the default 8px radius', async () => {
		const tree = await render()
		const style = StyleSheet.flatten(tree.toJSON().props.style)
		expect(style.width).toBe(120)
		expect(style.height).toBe(16)
		expect(style.borderRadius).toBe(8)
	})

	test('honors a custom borderRadius', async () => {
		const tree = await render({ borderRadius: 999 })
		expect(StyleSheet.flatten(tree.toJSON().props.style).borderRadius).toBe(999)
	})

	test('uses the theme elevationLight color and merges style overrides', async () => {
		const tree = await render({ style: { marginTop: 10 } })
		const style = StyleSheet.flatten(tree.toJSON().props.style)
		expect(style.backgroundColor).toBe(theme.colors.elevationLight)
		expect(style.marginTop).toBe(10)
	})
})
