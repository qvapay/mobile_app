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
jest.mock('../../ui/particles/QPSwitch', () => 'QPSwitch')
jest.mock('../../ui/QPCoinPicker', () => 'QPCoinPicker')
jest.mock('./WithdrawAmountCard', () => 'WithdrawAmountCard')
jest.mock('./WithdrawSatsCard', () => 'WithdrawSatsCard')
jest.mock('./WithdrawAccountFields', () => 'WithdrawAccountFields')
jest.mock('./WithdrawDestinationSelector', () => 'WithdrawDestinationSelector')
jest.mock('../transaction/PinConfirmStep', () => 'PinConfirmStep')
jest.mock('../../api/client', () => ({
	__esModule: true,
	default: { get: jest.fn() },
}))
jest.mock('../../api/withdrawApi', () => ({
	withdrawApi: { requestPin: jest.fn(), withdraw: jest.fn(), decodeLightning: jest.fn() },
}))
let mockCoinCatalog = []
jest.mock('../../hooks/useCoins', () => ({
	__esModule: true,
	default: () => ({ coins: mockCoinCatalog, isLoading: false }),
}))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
// Gate de KYC en passthrough — su lógica se prueba en hooks/useKycGate.test.js
jest.mock('../../hooks/useKycGate', () => ({
	__esModule: true,
	default: () => ({ requireKyc: () => true, gateVisible: false, gateMessage: null, closeGate: jest.fn() }),
	KYC_WITHDRAW_THRESHOLD: 1000,
}))
jest.mock('../../ui/KycGateModal', () => 'KycGateModal')

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
// Crypto coin (category 1 + network): gated behind the destination selector
const USDT = {
	tick: 'USDT',
	name: 'Tether',
	coins_categories_id: 1,
	network: 'TRC20',
	price: '1',
	stable: true,
	fee_out: '1',
	fee_out_fixed: 0,
	decimals: 2,
	logo: 'usdt',
	working_data: JSON.stringify([{ name: 'Wallet Address', type: 'text' }]),
}
// Bitcoin Lightning: precio espejo de BTC, campo Wallet para la factura/destino
const BTCLN = {
	tick: 'BTCLN',
	name: 'Bitcoin Lightning',
	price: '60000',
	stable: false,
	fee_out: '0',
	fee_out_fixed: 0,
	decimals: 8,
	logo: 'btcln',
	working_data: JSON.stringify([{ name: 'Wallet', type: 'text' }]),
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
	return tree.root.findByType('PinConfirmStep')
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	useAuth.mockReturnValue({ user: { balance: 150, satoshis: 5000, two_factor_secret: null }, updateUser: jest.fn() })
	apiClient.get.mockResolvedValue({ data: [] })
	mockCoinCatalog = [CUP, USDCASH, THRESHOLD, BTCLN, USDT]
	withdrawApi.requestPin.mockResolvedValue({ success: true })
	withdrawApi.withdraw.mockResolvedValue({ success: true, data: {} })
	withdrawApi.decodeLightning.mockResolvedValue({ success: true, data: { kind: 'bolt11', amount_sat: 150000, description: 'test', expires_at: null } })
})
afterEach(() => { jest.useRealTimers() })

describe('coin loading and selection', () => {
	test('el catálogo llega de la caché compartida, sin pedirlo a la red al montar', async () => {
		const tree = await renderWithdraw()
		// useCoins ya sirve las monedas (memoria/disco) y revalida por detrás
		expect(apiClient.get).not.toHaveBeenCalledWith('/coins/v2?enabled_out=true')
		expect(tree.root.findByType('QPCoinPicker').props.coins).toHaveLength(5)
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
		expect(tree.root.findAllByType('PinConfirmStep')).toHaveLength(1)
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
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(withdrawApi.withdraw).toHaveBeenCalledWith({
			amount: '100',
			coin: 'BANK_CUP',
			details: { 'Card Number': '9224061799991234', 'Full Name': 'John Doe' },
			pin: '1234',
			idempotencyKey: expect.stringMatching(/^[A-Za-z0-9._-]{8,64}$/),
		})
		expect(toast.success).toHaveBeenCalledWith('Extracción procesada', { description: 'Se han extraído $100 QUSD' })
		expect(navigation.goBack).toHaveBeenCalled()
	})

	test('an incomplete PIN pressed manually toasts a validation error and never calls the API', async () => {
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onChangePin('1') })
		await pressFooter(tree)
		expect(withdrawApi.withdraw).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalledWith('Ingresa un PIN de 4 dígitos')
	})

	test('an API failure surfaces the backend error and stays on the screen', async () => {
		withdrawApi.withdraw.mockResolvedValue({ success: false, error: 'Fondos insuficientes', status: 422 })
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(toast.error).toHaveBeenCalledWith('Fondos insuficientes')
		expect(navigation.goBack).not.toHaveBeenCalled()
	})

	test('a network failure (no HTTP status) promises a safe retry and keeps the SAME idempotency key', async () => {
		withdrawApi.withdraw.mockResolvedValue({ success: false, error: 'No se ha podido conectar con el servidor' })
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(toast.error).toHaveBeenCalledWith('Error de red', {
			description: 'No se ha podido conectar con el servidor. Puedes reintentar sin riesgo de duplicar la operación.',
		})
		// Retry the same attempt via the footer button: the key must not rotate on failure
		await pressFooter(tree)
		const keys = withdrawApi.withdraw.mock.calls.map(([args]) => args.idempotencyKey)
		expect(keys).toHaveLength(2)
		expect(keys[1]).toBe(keys[0])
	})

	test('a thrown error toasts the generic Spanish message', async () => {
		withdrawApi.withdraw.mockRejectedValue(new Error('network down'))
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(toast.error).toHaveBeenCalledWith('Error al procesar la extracción')
	})
})

describe('OTP method (TOTP 2FA)', () => {
	test('toggling to OTP expects 6 digits and the screen passes a leading-zero code intact', async () => {
		useAuth.mockReturnValue({ user: { balance: 150, satoshis: 0, two_factor_secret: 'SECRET' }, updateUser: jest.fn() })
		const tree = await renderWithdraw()
		let pinStep = await goToPinStep(tree)
		expect(pinStep.props.hasOTP).toBe(true)
		expect(pinStep.props.codeLength).toBe(4)
		await act(async () => { pinStep.props.onMethodToggle('right') })
		pinStep = tree.root.findByType('PinConfirmStep')
		expect(pinStep.props.twoFactorMethod).toBe('otp')
		expect(pinStep.props.codeLength).toBe(6)
		await act(async () => { pinStep.props.onChangePin('012345') })
		// The screen forwards the string '012345' untouched, and withdrawApi now
		// serializes it as String(pin) — the leading zero survives to the server
		expect(withdrawApi.withdraw).toHaveBeenCalledWith(expect.objectContaining({
			amount: '100', coin: 'BANK_CUP', pin: '012345',
		}))
	})
})

describe('crypto destination gate', () => {
	const destinationSelector = (tree) => tree.root.findByType('WithdrawDestinationSelector')
	const chooseDestination = (tree, value) => act(async () => { destinationSelector(tree).props.onSelect(value) })

	test('a non-crypto coin never renders the destination selector', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		expect(tree.root.findAllByType('WithdrawDestinationSelector')).toHaveLength(0)
	})

	test('a crypto coin hides the account fields and blocks Continuar until the personal wallet is chosen', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, USDT)
		await typeQUSD(tree, '100')
		expect(destinationSelector(tree).props.destination).toBe(null)
		expect(tree.root.findAllByType('WithdrawAccountFields')).toHaveLength(0)
		expect(footerButton(tree).props.disabled).toBe(true)
		await chooseDestination(tree, 'personal')
		await fillField(tree, 'wallet_address', 'TXYZabc123')
		expect(footerButton(tree).props.disabled).toBe(false)
	})

	test('choosing third party keeps the fields hidden and Continuar disabled', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, USDT)
		await typeQUSD(tree, '100')
		await chooseDestination(tree, 'third_party')
		expect(tree.root.findAllByType('WithdrawAccountFields')).toHaveLength(0)
		expect(footerButton(tree).props.disabled).toBe(true)
	})

	test('switching coins resets the destination', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, USDT)
		await chooseDestination(tree, 'personal')
		expect(destinationSelector(tree).props.destination).toBe('personal')
		await selectCoin(tree, CUP)
		await selectCoin(tree, USDT)
		expect(destinationSelector(tree).props.destination).toBe(null)
	})
})

describe('Lightning (BTCLN)', () => {
	const satsCard = (tree) => tree.root.findByType('WithdrawSatsCard')

	test('lnInvoice + lnAmountSats params prefill the Wallet field and lock the invoice amount', async () => {
		const tree = await renderWithdraw({ preselectedCoin: 'BTCLN', lnInvoice: 'lnbc1500n1qqexample', lnAmountSats: 150000 })
		const fields = tree.root.findByType('WithdrawAccountFields')
		expect(fields.props.workingForm.wallet).toBe('lnbc1500n1qqexample')
		expect(fields.props.multilineKeys).toEqual(['wallet'])
		const card = amountCard(tree)
		expect(card.props.locked).toBe(true)
		expect(card.props.amountCoin).toBe('0.00150000') // 150000 sats en BTC
		expect(withdrawApi.decodeLightning).toHaveBeenCalledWith('lnbc1500n1qqexample')
	})

	test('the source switch appears for BTCLN and swaps the amount card for the sats card', async () => {
		const tree = await renderWithdraw({ preselectedCoin: 'BTCLN' })
		const sourceSwitch = tree.root.findByType('QPSwitch')
		await act(async () => { sourceSwitch.props.onChange('right') })
		expect(satsCard(tree).props.availableSats).toBe(5000)
		expect(tree.root.findAllByType('WithdrawAmountCard')).toHaveLength(0)
	})

	test('redeeming sats submits source satoshis with the integer amount and updates the local user', async () => {
		const updateUser = jest.fn()
		useAuth.mockReturnValue({ user: { balance: 150, satoshis: 5000, two_factor_secret: null }, updateUser })
		withdrawApi.withdraw.mockResolvedValue({ success: true, data: { result: 'OK', data: { satoshis: 3000 } } })
		const tree = await renderWithdraw({ preselectedCoin: 'BTCLN' })
		await act(async () => { tree.root.findByType('QPSwitch').props.onChange('right') })
		await act(async () => { satsCard(tree).props.onChangeAmountSats('2000') })
		await fillField(tree, 'wallet', 'usuario@getalby.com')
		await pressFooter(tree)
		const pinStep = tree.root.findByType('PinConfirmStep')
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(withdrawApi.withdraw).toHaveBeenCalledWith({
			amount: '',
			coin: 'BTCLN',
			details: { Wallet: 'usuario@getalby.com' },
			pin: '1234',
			source: 'satoshis',
			amountSats: 2000,
			idempotencyKey: expect.stringMatching(/^[A-Za-z0-9._-]{8,64}$/),
		})
		expect(updateUser).toHaveBeenCalledWith({ satoshis: 3000 })
	})

	test('sats below the minimum or above the available balance keep the form invalid', async () => {
		const tree = await renderWithdraw({ preselectedCoin: 'BTCLN' })
		await act(async () => { tree.root.findByType('QPSwitch').props.onChange('right') })
		await fillField(tree, 'wallet', 'usuario@getalby.com')
		await act(async () => { satsCard(tree).props.onChangeAmountSats('50') }) // < 100
		expect(footerButton(tree).props.disabled).toBe(true)
		await act(async () => { satsCard(tree).props.onChangeAmountSats('9000') }) // > 5000 disponibles
		expect(footerButton(tree).props.disabled).toBe(true)
		await act(async () => { satsCard(tree).props.onChangeAmountSats('2000') })
		expect(footerButton(tree).props.disabled).toBe(false)
	})
})
