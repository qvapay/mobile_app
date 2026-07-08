/**
 * Render tests for QPLoader — the whole-screen Lottie spinner.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('lottie-react-native', () => 'LottieView')

import { StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPLoader from './QPLoader'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)

const render = async () => {
	let tree
	await act(async () => { tree = create(<QPLoader />) })
	return tree
}

describe('QPLoader', () => {

	test('renders a looping autoplaying Lottie spinner', async () => {
		const tree = await render()
		const lottie = tree.root.findByType('LottieView')
		expect(lottie.props.autoPlay).toBe(true)
		expect(lottie.props.loop).toBe(true)
		expect(lottie.props.source).toBeDefined()
	})

	test('spinner is fixed at 200x200', async () => {
		const tree = await render()
		const style = StyleSheet.flatten(tree.root.findByType('LottieView').props.style)
		expect(style).toMatchObject({ width: 200, height: 200 })
	})

	test('container flexes to fill and centers its content on the themed background', async () => {
		const tree = await render()
		const style = StyleSheet.flatten(tree.toJSON().props.style)
		expect(style).toMatchObject({ flex: 1, justifyContent: 'center', alignItems: 'center' })
		expect(style.backgroundColor).toBe(theme.colors.background)
	})
})
