/**
 * Render tests for the QUSD amount entry card — node environment with theme
 * and particles mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('./particles/QPPressable', () => 'QPPressable')
jest.mock('./particles/QPCoin', () => 'QPCoin')

import React from 'react'
import { TextInput } from 'react-native'
import { act, create } from 'react-test-renderer'
import AmountInput from './AmountInput'

const renderInput = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<AmountInput
				amount={props.amount ?? ''}
				onAmountChange={props.onAmountChange || jest.fn()}
				balance={props.balance ?? '87.5'}
				{...props}
			/>
		)
	})
	return tree
}

test('shows the balance formatted to 2 decimals, defaulting to 0.00', () => {
	expect(JSON.stringify(renderInput().toJSON())).toContain('87.50')
	expect(JSON.stringify(renderInput({ balance: undefined }).toJSON())).toContain('0.00')
})

test('typing flows through onAmountChange as a controlled input', () => {
	const onAmountChange = jest.fn()
	const tree = renderInput({ amount: '12', onAmountChange })
	const input = tree.root.findByType(TextInput)
	expect(input.props.value).toBe('12')
	expect(input.props.keyboardType).toBe('numeric')
	act(() => { input.props.onChangeText('12.5') })
	expect(onAmountChange).toHaveBeenCalledWith('12.5')
})

test('renders the six quick-amount badges ($25–$150) in a 3x2 grid', () => {
	const tree = renderInput()
	const badges = tree.root.findAllByType('QPPressable')
	expect(badges).toHaveLength(6)
	// $, amount and .00 render as separate text children
	const out = JSON.stringify(tree.toJSON())
	for (const n of [25, 50, 75, 100, 125, 150]) { expect(out).toContain(`"$","${n}",".00"`) }
})

test('tapping a badge reports the amount as a string', () => {
	const onAmountChange = jest.fn()
	const tree = renderInput({ onAmountChange })
	const badges = tree.root.findAllByType('QPPressable')
	act(() => { badges[3].props.onPress() })
	expect(onAmountChange).toHaveBeenCalledWith('100')
})

test('the badge matching the current amount is highlighted with the primary color', () => {
	const tree = renderInput({ amount: '50' })
	const badges = tree.root.findAllByType('QPPressable')
	expect(badges[1].props.style.backgroundColor).toBe('#6759EF') // selected ($50)
	expect(badges[0].props.style.backgroundColor).not.toBe('#6759EF')
})
