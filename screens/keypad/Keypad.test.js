/**
 * Behavior tests for the Keypad screen — what the screen adds on top of the
 * unit-tested applyKeypadKey logic: amount display, max-balance shortcut,
 * balance validation on send, and navigation to Send/Receive — node
 * environment with every collaborator mocked (see keypadAmount.test.js for
 * why node env, and auth/screens/Login.test.js for the pattern).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/particles/QPBalance', () => 'QPBalance')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

import React from 'react'
import { AccessibilityInfo, Vibration } from 'react-native'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../../auth/AuthContext'
import { toast } from 'sonner-native'
import { ROUTES } from '../../routes'
import Keypad from './Keypad'

const navigation = { navigate: jest.fn() }

const renderKeypad = () => {
	let tree
	act(() => { tree = create(<Keypad navigation={navigation} />) })
	return tree
}

// Finds the pressable node carrying the given accessibility label (the RN
// Pressable also mirrors the label onto its host view, so filter by onPress)
const findPressable = (tree, predicate) =>
	tree.root.findAll(n => typeof n.props.onPress === 'function' && predicate(n.props.accessibilityLabel || ''))[0]

const pressKey = (tree, key) => {
	const label = key === 'backspace' ? 'Delete last digit' : `Number ${key}`
	act(() => { findPressable(tree, l => l === label).props.onPress() })
}

const typeAmount = (tree, keys) => { for (const key of keys) pressKey(tree, key) }

const displayedAmount = (tree) => tree.root.findByType('QPBalance').props.formattedAmount

const pressAction = (tree, title) =>
	act(async () => { tree.root.findAllByType('QPButton').find(b => b.props.title === title).props.onPress() })

beforeEach(() => {
	jest.clearAllMocks()
	jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {})
	jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
	useAuth.mockReturnValue({ user: { balance: 100 } })
})

describe('amount entry', () => {
	test('digit presses replace the leading zero and build the amount', () => {
		const tree = renderKeypad()
		expect(displayedAmount(tree)).toBe('0')
		typeAmount(tree, ['2', '5'])
		expect(displayedAmount(tree)).toBe('25')
	})

	test('rejected keys are no-ops: one decimal point, two decimals max', () => {
		const tree = renderKeypad()
		typeAmount(tree, ['1', '.', '5', '.'])
		expect(displayedAmount(tree)).toBe('1.5')
		typeAmount(tree, ['0', '9'])
		expect(displayedAmount(tree)).toBe('1.50')
	})

	test('backspace shortens the amount and falls back to 0 when emptied', () => {
		const tree = renderKeypad()
		typeAmount(tree, ['7', '2'])
		pressKey(tree, 'backspace')
		expect(displayedAmount(tree)).toBe('7')
		pressKey(tree, 'backspace')
		expect(displayedAmount(tree)).toBe('0')
	})

	test('tapping the balance chip sets the amount to the full balance', () => {
		const tree = renderKeypad()
		act(() => { findPressable(tree, l => l.startsWith('Current balance')).props.onPress() })
		expect(displayedAmount(tree)).toBe('100')
	})
})

describe('send validation and navigation', () => {
	test('sending a zero amount toasts a Spanish error and never navigates', async () => {
		const tree = renderKeypad()
		await pressAction(tree, 'Enviar')
		expect(toast.error).toHaveBeenCalledWith('Monto inválido', { description: 'El monto debe ser mayor a 0' })
		expect(navigation.navigate).not.toHaveBeenCalled()
	})

	test('sending more than the balance toasts insufficient funds', async () => {
		const tree = renderKeypad()
		typeAmount(tree, ['5', '0', '0'])
		await pressAction(tree, 'Enviar')
		expect(toast.error).toHaveBeenCalledWith('Saldo insuficiente', { description: 'El monto no puede exceder tu saldo disponible' })
		expect(navigation.navigate).not.toHaveBeenCalled()
	})

	test('a valid amount navigates to Send with send_amount as a string', async () => {
		const tree = renderKeypad()
		typeAmount(tree, ['2', '5'])
		await pressAction(tree, 'Enviar')
		expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.SEND, { send_amount: '25' })
	})

	test('an amount equal to the balance is allowed through', async () => {
		const tree = renderKeypad()
		typeAmount(tree, ['1', '0', '0'])
		await pressAction(tree, 'Enviar')
		expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.SEND, { send_amount: '100' })
	})
})

describe('receive navigation', () => {
	test('Recibir navigates to Receive with receive_amount and no validation', async () => {
		const tree = renderKeypad()
		typeAmount(tree, ['9', '9', '9'])
		await pressAction(tree, 'Recibir')
		expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.RECEIVE, { receive_amount: '999' })
	})
})
