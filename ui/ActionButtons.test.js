/**
 * Render tests for the Home "Depositar" / "Extraer" action row — node
 * environment with the theme and QPButton mocked (see keypadAmount.test.js).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('./particles/QPButton', () => 'QPButton')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { ROUTES } from '../routes'
import ActionButtons from './ActionButtons'

const renderRow = (navigation = { navigate: jest.fn() }) => {
	let tree
	act(() => { tree = create(<ActionButtons navigation={navigation} />) })
	return tree
}

test('renders the deposit and withdraw buttons with their solid icons', () => {
	const buttons = renderRow().root.findAllByType('QPButton')
	expect(buttons.map(b => b.props.title)).toEqual(['Depositar', 'Extraer'])
	expect(buttons.map(b => b.props.icon)).toEqual(['plus', 'turn-up'])
	expect(buttons.every(b => b.props.iconStyle === 'solid')).toBe(true)
})

test('Depositar navigates to the Add flow', () => {
	const navigation = { navigate: jest.fn() }
	const tree = renderRow(navigation)
	act(() => { tree.root.findAllByType('QPButton')[0].props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.ADD)
})

test('Extraer navigates to the Withdraw flow', () => {
	const navigation = { navigate: jest.fn() }
	const tree = renderRow(navigation)
	act(() => { tree.root.findAllByType('QPButton')[1].props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.WITHDRAW)
})
