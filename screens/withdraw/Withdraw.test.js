/**
 * Behavior tests for the Withdraw screen — fee math (percent, fixed and
 * threshold fees), the QUSD ⇄ coin converter, form validation, the two-step
 * PIN/OTP confirmation and the withdraw payload — node environment with every
 * collaborator mocked (see keypadAmount.test.js for why node env, and
 * auth/screens/Login.test.js for the screen-testing pattern).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/QPCoinPicker', () => 'QPCoinPicker')
jest.mock('./WithdrawAmountCard', () => 'WithdrawAmountCard')
jest.mock('./WithdrawAccountFields', () => 'WithdrawAccountFields')
jest.mock('./WithdrawPinStep', () => 'WithdrawPinStep')
jest.mock('../../api/client', () => ({
	__esModule: true,
	default: { get: jest.fn() },
}))
jest.mock('../../api/withdrawApi', () => ({
	withdrawApi: { requestPin: jest.fn(), withdraw: jest.fn() },
}))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../../auth/AuthContext'
import apiClient from '../../api/client'
import { withdrawApi } from '../../api/withdrawApi'
import { toast } from 'sonner-native'
import Withdraw from './Withdraw'

// Non-stable coin: 5% fee, price 0.5 USD per unit, two account fields
const CUP = {
	tick: 'BANK_CUP',
	name: 'Banco CUP',
	price: '0.5',
	stable: false,
	fee_out: '5',
	fee_out_fixed: 0,
	decimals: 2,
	logo: 'bank_cup',
	working_data: JSON.stringify([
		{ name: 'Card Number', type: 'number' },
		{ name: 'Full Name', type: 'text' },
	]),
}
// Stable coin with a flat fixed fee and no account fields
const USDCASH = {
	tick: 'USDCASH',
	name: 'Cash',
	price: '1',
	stable: true,
	fee_out: '0',
	fee_out_fixed: 2,
	decimals: 2,
	logo: 'usdcash',
	working_data: null,
}
// Threshold fee: below 50 USD a fixed 2, above it 5%
const THRESHOLD = {
	tick: 'THR',
	name: 'Threshold coin',
	price: '1',
	stable: true,
	fee_out: '5',
	fee_out_fixed: ['50', '2'],
	decimals: 2,
	logo: 'thr',
	working_data: null,
}

const navigation = { navigate: jest.fn(), goBack: jest.fn() }

const renderWithdraw = async (params) => {
	let tree
	await act(async () => { tree = create(<Withdraw navigation={navigation} route={{ params }} />) })
	return tree
}

const amountCard = (tree) => tree.root.findByType('WithdrawAmountCard')
const footerButton = (tree) => tree.root.findByType('QPButton')

const selectCoin = (tree, coin) => act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(coin) })
const typeQUSD = (tree, value) => act(async () => { amountCard(tree).props.onChangeQUSD(value) })
const typeCoinAmount = (tree, value) => act(async () => { amountCard(tree).props.onChangeAmountCoin(value) })
const fillField = (tree, key, text) => act(async () => { tree.root.findByType('WithdrawAccountFields').props.onChangeField(key, text) })
const pressFooter = (tree) => act(async () => { footerButton(tree).props.onPress() })

// Drives the happy path up to the PIN step: coin + amount + account fields + Continuar
const goToPinStep = async (tree) => {
	await selectCoin(tree, CUP)
	await typeQUSD(tree, '100')
	await fillField(tree, 'card_number', '9224061799991234')
	await fillField(tree, 'full_name', 'John Doe')
	await pressFooter(tree)
	return tree.root.findByType('WithdrawPinStep')
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	useAuth.mockReturnValue({ user: { balance: 150, two_factor_secret: null } })
	apiClient.get.mockResolvedValue({ data: [CUP, USDCASH, THRESHOLD] })
	withdrawApi.requestPin.mockResolvedValue({ success: true })
	withdrawApi.withdraw.mockResolvedValue({ success: true, data: {} })
})
afterEach(() => { jest.useRealTimers() })

describe('coin loading and selection', () => {
	test('fetches the enabled_out coins on mount', async () => {
		await renderWithdraw()
		expect(apiClient.get).toHaveBeenCalledWith('/coins/v2?enabled_out=true')
	})

	test('a preselectedCoin route param selects the matching coin', async () => {
		const tree = await renderWithdraw({ preselectedCoin: 'BANK_CUP' })
		expect(amountCard(tree).props.selectedCoin.tick).toBe('BANK_CUP')
	})

	test('selecting a coin with an amount already typed recomputes the receive amount', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, USDCASH)
		await typeQUSD(tree, '50')
		expect(amountCard(tree).props.amountCoin).toBe('48.00')
		await selectCoin(tree, CUP)
		// 50 QUSD - 5% fee = 47.5 USD net → 47.5 / 0.5 = 95 CUP
		expect(amountCard(tree).props.amountCoin).toBe('95.00')
	})
})

describe('amount conversion and fees', () => {
	test('QUSD to coin subtracts the percent fee and converts at the coin price', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await typeQUSD(tree, '100')
		// 100 - 5% = 95 USD net → 95 / 0.5 = 190 CUP
		expect(amountCard(tree).props.amountCoin).toBe('190.00')
	})

	test('coin to QUSD adds the fee back to compute the required gross amount', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await typeCoinAmount(tree, '190')
		// 190 CUP = 95 USD net → 95 / (1 - 0.05) = 100 QUSD gross
		expect(amountCard(tree).props.amountQUSD).toBe('100')
	})

	test('a threshold fee charges the fixed amount below it and the percent above it', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, THRESHOLD)
		await typeQUSD(tree, '30')
		expect(amountCard(tree).props.amountCoin).toBe('28.00')
		await typeQUSD(tree, '100')
		expect(amountCard(tree).props.amountCoin).toBe('95.00')
	})

	test('clearing the amount clears the converted amount too', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await typeQUSD(tree, '100')
		await typeQUSD(tree, '')
		expect(amountCard(tree).props.amountCoin).toBe('')
	})
})

describe('form validation', () => {
	test('Continuar stays disabled until coin, amount and every account field are set', async () => {
		const tree = await renderWithdraw()
		expect(footerButton(tree).props.disabled).toBe(true)
		await selectCoin(tree, CUP)
		expect(footerButton(tree).props.disabled).toBe(true)
		await typeQUSD(tree, '100')
		expect(footerButton(tree).props.disabled).toBe(true)
		await fillField(tree, 'card_number', '9224061799991234')
		expect(footerButton(tree).props.disabled).toBe(true)
		await fillField(tree, 'full_name', 'John Doe')
		expect(footerButton(tree).props.disabled).toBe(false)
	})

	test('CURRENT BEHAVIOR: the amount is never validated against the balance client-side', async () => {
		// balance is 150 but 9999 QUSD still enables Continuar — only the server rejects it
		const tree = await renderWithdraw()
		await selectCoin(tree, USDCASH)
		await typeQUSD(tree, '9999')
		expect(footerButton(tree).props.disabled).toBe(false)
	})

	test('Continuar opens the PIN step and the footer becomes the Extraer button', async () => {
		const tree = await renderWithdraw()
		await goToPinStep(tree)
		expect(tree.root.findAllByType('WithdrawPinStep')).toHaveLength(1)
		expect(footerButton(tree).props.title).toBe('Extraer $100 QUSD')
	})
})

describe('PIN request', () => {
	test('a successful PIN request toasts the email hint', async () => {
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { await pinStep.props.onRequestPin() })
		expect(withdrawApi.requestPin).toHaveBeenCalled()
		expect(toast.success).toHaveBeenCalledWith('PIN enviado', { description: 'Revisa tu correo electrónico' })
	})

	test('a failed PIN request surfaces the backend error', async () => {
		withdrawApi.requestPin.mockResolvedValue({ success: false, error: 'Espera un momento' })
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { await pinStep.props.onRequestPin() })
		expect(toast.error).toHaveBeenCalledWith('Espera un momento')
	})
})

describe('withdraw submission', () => {
	test('a complete PIN auto-submits with amount, coin, original field names and the pin', async () => {
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onPinChange('1234', 0) })
		expect(withdrawApi.withdraw).toHaveBeenCalledWith(
			'100',
			'BANK_CUP',
			{ 'Card Number': '9224061799991234', 'Full Name': 'John Doe' },
			'1234',
		)
		expect(toast.success).toHaveBeenCalledWith('Extracción procesada', { description: 'Se han extraído $100 QUSD' })
		expect(navigation.goBack).toHaveBeenCalled()
	})

	test('an incomplete PIN pressed manually toasts a validation error and never calls the API', async () => {
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onPinChange('1', 0) })
		await pressFooter(tree)
		expect(withdrawApi.withdraw).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalledWith('Ingresa un PIN de 4 dígitos')
	})

	test('an API failure surfaces the backend error and stays on the screen', async () => {
		withdrawApi.withdraw.mockResolvedValue({ success: false, error: 'Fondos insuficientes' })
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onPinChange('1234', 0) })
		expect(toast.error).toHaveBeenCalledWith('Fondos insuficientes')
		expect(navigation.goBack).not.toHaveBeenCalled()
	})

	test('a thrown error toasts the generic Spanish message', async () => {
		withdrawApi.withdraw.mockRejectedValue(new Error('network down'))
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onPinChange('1234', 0) })
		expect(toast.error).toHaveBeenCalledWith('Error al procesar la extracción')
	})
})

describe('OTP method (TOTP 2FA)', () => {
	test('toggling to OTP expects 6 digits and the screen passes a leading-zero code intact', async () => {
		useAuth.mockReturnValue({ user: { balance: 150, two_factor_secret: 'SECRET' } })
		const tree = await renderWithdraw()
		let pinStep = await goToPinStep(tree)
		expect(pinStep.props.hasOTP).toBe(true)
		expect(pinStep.props.codeLength).toBe(4)
		await act(async () => { pinStep.props.onMethodToggle('right') })
		pinStep = tree.root.findByType('WithdrawPinStep')
		expect(pinStep.props.twoFactorMethod).toBe('otp')
		expect(pinStep.props.codeLength).toBe(6)
		await act(async () => { pinStep.props.onPinChange('012345', 0) })
		// The screen forwards the string '012345' untouched — the leading zero is
		// lost later inside withdrawApi.withdraw via Number(pin) (known latent bug,
		// documented in api/withdrawApi.test.js)
		expect(withdrawApi.withdraw).toHaveBeenCalledWith('100', 'BANK_CUP', expect.any(Object), '012345')
	})
})
