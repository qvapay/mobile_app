/**
 * Render tests de la botonera del Home (dos filas sincronizadas con el pager
 * del BalanceCard): los 4 tiles de la cuenta (Depositar/Extraer/Enviar/Pagar)
 * y las 2 pills de ahorros que navegan a Savings con la acción pre-cargada —
 * node environment con theme, reanimated y particles mockeados.
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('react-native-reanimated', () => {
	const { View } = require('react-native')
	return {
		__esModule: true,
		default: { View },
		useAnimatedStyle: () => ({}),
		useAnimatedReaction: () => {},
		useSharedValue: (v) => ({ value: v }),
		runOnJS: (fn) => fn,
	}
})
jest.mock('./particles/QPPressable', () => 'QPPressable')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { ROUTES } from '../routes'
import ActionButtons from './ActionButtons'

const labelsOf = (tree) =>
	tree.root.findAllByType('QPPressable').map((p) =>
		p.findAllByType('Text').map((t) => t.props.children).join('')
	)

const pressByLabel = (tree, label, nth = 0) => {
	const matches = tree.root.findAllByType('QPPressable').filter((p) =>
		p.findAllByType('Text').some((t) => t.props.children === label)
	)
	act(() => { matches[nth].props.onPress() })
}

const renderRow = (navigation = { navigate: jest.fn() }) => {
	let tree
	act(() => { tree = create(<ActionButtons navigation={navigation} />) })
	return tree
}

test('renderiza los 4 tiles de la cuenta y las 2 pills de ahorros', () => {
	const tree = renderRow()
	expect(labelsOf(tree)).toEqual(['Depositar', 'Extraer', 'Enviar', 'Comerciar', 'Depositar', 'Retirar'])
})

test('los tiles de la cuenta navegan a Add / Withdraw / Send / P2P', () => {
	const navigation = { navigate: jest.fn() }
	const tree = renderRow(navigation)
	pressByLabel(tree, 'Extraer')
	expect(navigation.navigate).toHaveBeenLastCalledWith(ROUTES.WITHDRAW)
	pressByLabel(tree, 'Enviar')
	expect(navigation.navigate).toHaveBeenLastCalledWith(ROUTES.SEND)
	pressByLabel(tree, 'Comerciar')
	expect(navigation.navigate).toHaveBeenLastCalledWith(ROUTES.P2P_SCREEN)
	pressByLabel(tree, 'Depositar', 0)
	expect(navigation.navigate).toHaveBeenLastCalledWith(ROUTES.ADD)
})

test('las pills de ahorros abren Savings con la acción pre-cargada', () => {
	const navigation = { navigate: jest.fn() }
	const tree = renderRow(navigation)
	pressByLabel(tree, 'Depositar', 1) // la segunda "Depositar" es la de ahorros
	expect(navigation.navigate).toHaveBeenLastCalledWith(ROUTES.SAVINGS_SCREEN, { action: 'deposit' })
	pressByLabel(tree, 'Retirar')
	expect(navigation.navigate).toHaveBeenLastCalledWith(ROUTES.SAVINGS_SCREEN, { action: 'withdraw' })
})
