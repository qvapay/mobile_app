/**
 * Render tests for QPCodeInput — multi-box OTP mechanics (typing, paste
 * spreading, backspace stepping). RN's jest mock puts a single shared focus
 * jest.fn on the TextInput prototype, so focus auto-advance is asserted through
 * mock.contexts (the `this` of each call identifies which box was focused).
 * @jest-environment node
 */
import { TextInput } from 'react-native'
import { act, create } from 'react-test-renderer'

jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})

import QPCodeInput from './QPCodeInput'

const focusMock = TextInput.prototype.focus

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPCodeInput code='' onChangeCode={() => {}} {...props} />) })
	return tree
}

const getBoxes = (tree) => tree.root.findAllByType(TextInput)
const focusedBoxes = () => focusMock.mock.contexts

beforeEach(() => { focusMock.mockClear() })

describe('QPCodeInput', () => {

	test('renders one box per code digit (default 4, custom length)', async () => {
		const tree = await render()
		expect(getBoxes(tree)).toHaveLength(4)
		const six = await render({ length: 6 })
		expect(getBoxes(six)).toHaveLength(6)
	})

	test('typing a digit reports the code and advances focus to the next box', async () => {
		const onChangeCode = jest.fn()
		const tree = await render({ code: '', onChangeCode })
		await act(async () => { getBoxes(tree)[0].props.onChangeText('5') })
		expect(onChangeCode).toHaveBeenCalledWith('5')
		expect(focusedBoxes()).toContain(getBoxes(tree)[1].instance)
	})

	test('filters out non-numeric characters', async () => {
		const onChangeCode = jest.fn()
		const tree = await render({ code: '', onChangeCode })
		await act(async () => { getBoxes(tree)[0].props.onChangeText('a') })
		expect(onChangeCode).toHaveBeenCalledWith('')
		expect(focusMock).not.toHaveBeenCalled()
	})

	test('pasting the full code spreads it across the boxes', async () => {
		const onChangeCode = jest.fn()
		const tree = await render({ code: '', onChangeCode })
		await act(async () => { getBoxes(tree)[0].props.onChangeText('1234') })
		expect(onChangeCode).toHaveBeenCalledWith('1234')
		expect(focusedBoxes()).toContain(getBoxes(tree)[3].instance) // lands on the last box
	})

	test('backspace clears the current digit, then steps back to the previous box', async () => {
		const onChangeCode = jest.fn()
		const backspace = { nativeEvent: { key: 'Backspace' } }

		// Box 2 holds a digit: clear it in place
		const tree = await render({ code: '123', onChangeCode })
		await act(async () => { getBoxes(tree)[2].props.onKeyPress(backspace) })
		expect(onChangeCode).toHaveBeenCalledWith('12')

		// Box 2 is empty: clear box 1 and move focus back
		onChangeCode.mockClear()
		focusMock.mockClear()
		const tree2 = await render({ code: '12', onChangeCode })
		await act(async () => { getBoxes(tree2)[2].props.onKeyPress(backspace) })
		expect(onChangeCode).toHaveBeenCalledWith('1')
		expect(focusedBoxes()).toContain(getBoxes(tree2)[1].instance)
	})

	test('disabled makes every box non-editable', async () => {
		const tree = await render({ disabled: true })
		getBoxes(tree).forEach(box => expect(box.props.editable).toBe(false))
	})
})
