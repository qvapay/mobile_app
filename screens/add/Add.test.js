/**
 * Behavior tests for the deposit ("Add money") screen — node environment with
 * every collaborator mocked (see keypadAmount.test.js for why node env, and
 * auth/screens/Login.test.js for the screen-testing pattern).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../helpers/walletDeeplinks', () => ({ detectInstalledWallets: jest.fn() }))
jest.mock('../../helpers/inAppReview', () => ({ maybeRequestReview: jest.fn() }))
jest.mock('../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/AmountInput', () => 'AmountInput')
jest.mock('../../ui/QPCoinRow', () => 'QPCoinRow')
jest.mock('../../ui/QPCoinPicker', () => 'QPCoinPicker')
jest.mock('../../ui/WalletPickerSheet', () => 'WalletPickerSheet')
jest.mock('./DepositDetailsModal', () => 'DepositDetailsModal')
jest.mock('../../api/client', () => ({
	__esModule: true,
	default: { get: jest.fn(), post: jest.fn() },
}))
jest.mock('../../hooks/useTransactionSSE', () => jest.fn())
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

import React from 'react'
import { Linking } from 'react-native'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../../auth/AuthContext'
import { detectInstalledWallets } from '../../helpers/walletDeeplinks'
import { maybeRequestReview } from '../../helpers/inAppReview'
import apiClient from '../../api/client'
import useTransactionSSE from '../../hooks/useTransactionSSE'
import { toast } from 'sonner-native'
import Add from './Add'

const updateUser = jest.fn()
const USDT = { tick: 'USDT', name: 'Tether', min_in: '10', network: 'TRC20' }

// The SSE hook is mocked; capture its status callback so tests can emit updates
let sseCallback = null

const renderAdd = async () => {
	let tree
	await act(async () => { tree = create(<Add navigation={{ navigate: jest.fn() }} />) })
	return tree
}

const pickCoinAndAmount = async (tree, coin = USDT, amount = '50') => {
	await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(coin) })
	await act(async () => { tree.root.findByType('AmountInput').props.onAmountChange(amount) })
}

const pressGenerate = (tree) => act(async () => { tree.root.findByType('QPButton').props.onPress() })

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	jest.spyOn(Linking, 'openURL').mockResolvedValue()
	useAuth.mockReturnValue({ user: { balance: '100.00' }, updateUser })
	apiClient.get.mockResolvedValue({ data: [] })
	apiClient.post.mockResolvedValue({ status: 200, data: { data: { transaction_uuid: 'tx-1', wallet: null } } })
	detectInstalledWallets.mockResolvedValue([])
	useTransactionSSE.mockImplementation((uuid, cb) => {
		sseCallback = cb
		return { isConnected: !!uuid }
	})
})
afterEach(() => {
	jest.useRealTimers()
	Linking.openURL.mockRestore()
})

test('loads the deposit-enabled coin catalog on mount', async () => {
	const coins = [{ name: 'Criptomonedas', coins: [USDT] }]
	apiClient.get.mockResolvedValue({ data: coins })
	const tree = await renderAdd()
	expect(apiClient.get).toHaveBeenCalledWith('/coins/v2?enabled_in=true')
	expect(tree.root.findByType('QPCoinPicker').props.coins).toBe(coins)
})

describe('topup validations', () => {
	test('rejects a non-positive amount', async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, USDT, '0')
		await pressGenerate(tree)
		expect(toast.error).toHaveBeenCalledWith('Por favor ingresa un monto válido')
		expect(apiClient.post).not.toHaveBeenCalled()
	})

	test('enforces the coin minimum with its name in the message', async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, USDT, '5')
		await pressGenerate(tree)
		expect(toast.error).toHaveBeenCalledWith('El monto mínimo para Tether es 10')
		expect(apiClient.post).not.toHaveBeenCalled()
	})

	test('the button stays disabled until coin and amount are set', async () => {
		const tree = await renderAdd()
		expect(tree.root.findByType('QPButton').props.disabled).toBe(true)
		await pickCoinAndAmount(tree)
		expect(tree.root.findByType('QPButton').props.disabled).toBe(false)
	})
})

describe('deposit creation', () => {
	test('posts the topup payload and opens the invoice modal', async () => {
		const invoice = { transaction_uuid: 'tx-1', wallet: 'TAddr', coin: 'USDT', network: 'TRC20', value: '50' }
		apiClient.post.mockResolvedValue({ status: 200, data: { data: invoice } })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'USDT', amount: 50 })
		const modal = tree.root.findByType('DepositDetailsModal')
		expect(modal.props.visible).toBe(true)
		expect(modal.props.topupData).toBe(invoice)
		expect(modal.props.countdown).toBe(1800)
	})

	test('fiat gateways with a redirect_url open externally', async () => {
		apiClient.post.mockResolvedValue({
			status: 200,
			data: { data: { transaction_uuid: 'tx-2', redirect_url: 'https://paypal.com/pay/x' } },
		})
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(Linking.openURL).toHaveBeenCalledWith('https://paypal.com/pay/x')
	})

	test('an API failure surfaces the retry message on screen', async () => {
		apiClient.post.mockRejectedValue(new Error('500'))
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(JSON.stringify(tree.toJSON())).toContain('Error al crear la solicitud de depósito, intente nuevamente en unos minutos')
	})

	test('crypto invoices trigger installed-wallet detection with the coin and network', async () => {
		apiClient.post.mockResolvedValue({
			status: 200,
			data: { data: { transaction_uuid: 'tx-3', wallet: 'TAddr', coin: 'USDT', network: 'TRC20' } },
		})
		detectInstalledWallets.mockResolvedValue([{ id: 'trust' }])
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(detectInstalledWallets).toHaveBeenCalledWith('USDT', 'TRC20')
		expect(tree.root.findByType('DepositDetailsModal').props.installedWallets).toEqual([{ id: 'trust' }])
	})
})

describe('real-time deposit status over SSE', () => {
	const openInvoice = async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		return tree
	}

	test('subscribes to the created transaction uuid', async () => {
		await openInvoice()
		expect(useTransactionSSE).toHaveBeenLastCalledWith('tx-1', expect.any(Function))
	})

	test('a paid status toasts, closes the modal, refreshes the balance and asks for review', async () => {
		const tree = await openInvoice()
		await act(async () => { sseCallback('paid') })
		expect(toast.success).toHaveBeenCalledWith('Pago confirmado', expect.anything())
		expect(tree.root.findByType('DepositDetailsModal').props.depositStatus).toBe('paid')
		await act(async () => { jest.advanceTimersByTime(2000) })
		expect(tree.root.findByType('DepositDetailsModal').props.visible).toBe(false)
		expect(updateUser).toHaveBeenCalled()
		await act(async () => { jest.advanceTimersByTime(1500) })
		expect(maybeRequestReview).toHaveBeenCalled()
	})

	test('an expired status zeroes the 30-minute countdown', async () => {
		const tree = await openInvoice()
		await act(async () => { jest.advanceTimersByTime(5000) }) // countdown running
		expect(tree.root.findByType('DepositDetailsModal').props.countdown).toBe(1795)
		await act(async () => { sseCallback('expired') })
		expect(tree.root.findByType('DepositDetailsModal').props.countdown).toBe(0)
	})
})
