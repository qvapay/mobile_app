/**
 * Render tests for QPRate — FontAwesome6 star rating used as display and input.
 * @jest-environment node
 */
jest.mock('react-native-reanimated') // manual mock in /__mocks__/react-native-reanimated.js
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import { act, create } from 'react-test-renderer'
import QPRate from './QPRate'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPRate {...props} />) })
	return tree
}

const starsOf = (tree) => tree.root.findAllByType('FontAwesome6')

// QPPressable exposes RN Responder handlers on its host View
const pressables = (tree) =>
	tree.root.findAll(node => typeof node.type === 'string' && node.props.onResponderRelease !== undefined)

describe('QPRate', () => {

	test('renders maxRating stars — 5 by default', async () => {
		expect(starsOf(await render({}))).toHaveLength(5)
		expect(starsOf(await render({ maxRating: 3 }))).toHaveLength(3)
	})

	test('active stars are solid gold, the rest are regular outlines in the border color', async () => {
		const tree = await render({ value: 3 })
		const stars = starsOf(tree)
		stars.slice(0, 3).forEach(star => {
			expect(star.props.iconStyle).toBe('solid')
			expect(star.props.color).toBe(theme.colors.gold)
		})
		stars.slice(3).forEach(star => {
			expect(star.props.iconStyle).toBe('regular')
			expect(star.props.color).toBe(theme.colors.border)
		})
	})

	test('pressing the nth star commits a 1-based rating', async () => {
		const onRate = jest.fn()
		const tree = await render({ value: 0, onRate })
		await act(async () => { pressables(tree)[3].props.onResponderRelease() })
		expect(onRate).toHaveBeenCalledWith(4)
	})

	test('press-and-hold previews the selection up to the touched star', async () => {
		const tree = await render({ value: 0 })
		await act(async () => { pressables(tree)[2].props.onResponderGrant() })
		const held = starsOf(tree)
		held.slice(0, 3).forEach(star => expect(star.props.iconStyle).toBe('solid'))
		held.slice(3).forEach(star => expect(star.props.iconStyle).toBe('regular'))
		await act(async () => { pressables(tree)[2].props.onResponderTerminate() })
		starsOf(tree).forEach(star => expect(star.props.iconStyle).toBe('regular'))
	})

	test('readOnly freezes the row into a pure display', async () => {
		const onRate = jest.fn()
		const tree = await render({ value: 2, onRate, readOnly: true })
		const star = pressables(tree)[4]
		expect(star.props.onStartShouldSetResponder()).toBe(false)
		await act(async () => { star.props.onResponderRelease() })
		expect(onRate).not.toHaveBeenCalled()
	})

	test('custom active and inactive colors override the theme defaults', async () => {
		const tree = await render({ value: 1, color: '#ff0000', inactiveColor: '#00ff00' })
		const stars = starsOf(tree)
		expect(stars[0].props.color).toBe('#ff0000')
		expect(stars[1].props.color).toBe('#00ff00')
	})
})
