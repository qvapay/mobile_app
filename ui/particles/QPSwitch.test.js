/**
 * Render tests for QPSwitch — the two-option segmented toggle with deselection.
 * @jest-environment node
 */
import { Pressable, Text } from 'react-native'
import { act, create } from 'react-test-renderer'

jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})

import QPSwitch from './QPSwitch'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPSwitch leftText='PIN' rightText='OTP' {...props} />) })
	return tree
}

// Pressable is a React.memo — findAllByType needs the inner component
const PressableType = Pressable.type || Pressable

// The two side Pressables, in [left, right] order
const getOptions = (tree) => tree.root.findAllByType(PressableType)
const pressSide = async (tree, side) => {
	const options = getOptions(tree)
	await act(async () => { options[side === 'left' ? 0 : 1].props.onPress() })
}

describe('QPSwitch', () => {

	test('renders both labels', async () => {
		const tree = await render()
		const texts = tree.root.findAllByType(Text).map(t => t.props.children)
		expect(texts).toEqual(['PIN', 'OTP'])
	})

	test('pressing the unselected side reports it through onChange and onRightPress', async () => {
		const onChange = jest.fn()
		const onRightPress = jest.fn()
		const tree = await render({ onChange, onRightPress }) // uncontrolled, defaults to left
		await pressSide(tree, 'right')
		expect(onChange).toHaveBeenCalledWith('right')
		expect(onRightPress).toHaveBeenCalledTimes(1)
	})

	test('pressing the already selected side deselects it (onChange null)', async () => {
		const onChange = jest.fn()
		const onLeftPress = jest.fn()
		const tree = await render({ onChange, onLeftPress, defaultValue: 'left' })
		await pressSide(tree, 'left')
		expect(onChange).toHaveBeenCalledWith(null)
		expect(onLeftPress).not.toHaveBeenCalled()
	})

	test('does nothing when disabled', async () => {
		const onChange = jest.fn()
		const tree = await render({ onChange, disabled: true })
		await pressSide(tree, 'right')
		expect(onChange).not.toHaveBeenCalled()
	})

	test('controlled value highlights the selected side without internal state', async () => {
		const tree = await render({ value: 'right', rightTextColor: '#123456' })
		const [leftText, rightText] = tree.root.findAllByType(Text)
		expect(rightText.props.style[1].color).toBe('#123456')
		expect(leftText.props.style[1].color).toBe(theme.colors.primaryText)

		// Pressing left only notifies the parent; being controlled, nothing flips internally
		const onChange = jest.fn()
		await act(async () => { tree.update(<QPSwitch leftText='PIN' rightText='OTP' value='right' onChange={onChange} />) })
		await pressSide(tree, 'left')
		expect(onChange).toHaveBeenCalledWith('left')
	})

	test('accepts the legacy position prop as a controlled value alias', async () => {
		const onChange = jest.fn()
		const tree = await render({ position: 'left', onChange })
		await pressSide(tree, 'left')
		expect(onChange).toHaveBeenCalledWith(null) // toggled off the selected side
	})
})
