/**
 * Render tests for the Home first-use transactions empty state — node
 * environment with theme, icons and QPPressable mocked (see keypadAmount.test.js).
 * @jest-environment node
 */
let mockIsDark = true
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: { ...createTheme(mockIsDark), mode: mockIsDark ? 'dark' : 'light' } }) }
})
jest.mock('./particles/QPPressable', () => 'QPPressable')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { ROUTES } from '../routes'
import EmptyTransactions from './EmptyTransactions'

const renderCard = (navigation = { navigate: jest.fn() }) => {
	let tree
	act(() => { tree = create(<EmptyTransactions navigation={navigation} />) })
	return tree
}

beforeEach(() => { mockIsDark = true })

test('educates the new user and offers the Añadir saldo CTA', () => {
	const out = JSON.stringify(renderCard().toJSON())
	expect(out).toContain('Aún no tienes transacciones')
	expect(out).toContain('Añade saldo o haz tu primer pago y aparecerá aquí.')
	expect(out).toContain('Añadir saldo')
})

test('tapping the CTA navigates to the Add flow', () => {
	const navigation = { navigate: jest.fn() }
	const tree = renderCard(navigation)
	act(() => { tree.root.findByType('QPPressable').props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.ADD)
})

test('card border only shows in light mode (house dark-surface rule)', () => {
	expect(JSON.stringify(renderCard().toJSON().props.style)).not.toContain('borderWidth')
	mockIsDark = false
	expect(JSON.stringify(renderCard().toJSON().props.style)).toContain('"borderWidth":1')
})
