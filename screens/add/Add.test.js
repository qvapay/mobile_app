/**
 * Behavior tests for the deposit ("Add money") screen — node environment with
 * every collaborator mocked (see keypadAmount.test.js for why node env, and
 * auth/screens/Login.test.js for the screen-testing pattern).
 * @jest-environment node
 */
let mockCoinCatalog = []
jest.mock('../../hooks/useCoins', () => ({
	__esModule: true,
	default: () => ({ coins: mockCoinCatalog, isLoading: false }),
}))
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
jest.mock('./cardPaymentSheet', () => ({ presentCardDeposit: jest.fn() }))
jest.mock('./CardFeeModeSelector', () => 'CardFeeModeSelector')
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { detectInstalledWallets } from '../../helpers/walletDeeplinks'
import { maybeRequestReview } from '../../helpers/inAppReview'
import apiClient from '../../api/client'
import { presentCardDeposit } from './cardPaymentSheet'
import useTransactionSSE from '../../hooks/useTransactionSSE'
import { toast } from 'sonner-native'
import Add from './Add'

const updateUser = jest.fn()
const USDT = { tick: 'USDT', name: 'Tether', min_in: '10', network: 'TRC20' }

// The SSE hook is mocked; capture its status callback so tests can emit updates
let sseCallback = null
// Se guardan para desmontarlos: un QueryClient vivo deja temporizadores de
// recolección abiertos y jest no llega a cerrar el proceso (patrón Send.test.js)
let trees = []
let clients = []

const renderAdd = async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	let tree
	await act(async () => {
		tree = create(
			<QueryClientProvider client={client}>
				<Add navigation={{ navigate: jest.fn() }} />
			</QueryClientProvider>
		)
	})
	trees.push(tree)
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
	trees.forEach(tree => tree.unmount())
	trees = []
	clients.forEach(client => client.clear())
	clients = []
	jest.useRealTimers()
	Linking.openURL.mockRestore()
})

test('el catálogo llega de la caché compartida, sin pedirlo al montar', async () => {
	const coins = [{ name: 'Criptomonedas', coins: [USDT] }]
	mockCoinCatalog = coins
	const tree = await renderAdd()
	// useCoins sirve el catálogo desde memoria/disco y revalida por detrás
	expect(apiClient.get).not.toHaveBeenCalledWith('/coins/v2?enabled_in=true')
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

describe('depósito con tarjeta (CARD)', () => {
	const CARD = { tick: 'CARD', name: 'Tarjeta', min_in: '10', fee_in: '6' }
	const eligibleUser = {
		balance: '100.00',
		kyc: true,
		telegram_id: '1',
		phone_verified: true,
		created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
		vip: false,
		trustscore: 95,
	}
	const cardInvoice = {
		transaction_uuid: 'tx-card',
		wallet: 'pi_123',
		coin: 'CARD',
		value: '53',
		client_secret: 'pi_123_secret_abc',
		publishable_key: 'pk_test_x',
	}

	beforeEach(() => {
		mockCoinCatalog = [{ name: 'Fiat', coins: [CARD, USDT] }]
		useAuth.mockReturnValue({ user: eligibleUser, updateUser })
		apiClient.post.mockResolvedValue({ status: 200, data: { data: cardInvoice } })
		presentCardDeposit.mockResolvedValue({ status: 'paid' })
	})

	test('un usuario no elegible no ve la opción CARD en el catálogo ni en las pills', async () => {
		useAuth.mockReturnValue({ user: { ...eligibleUser, kyc: false }, updateUser })
		const tree = await renderAdd()
		const picker = tree.root.findByType('QPCoinPicker')
		expect(picker.props.coins).toEqual([{ name: 'Fiat', coins: [USDT] }])
		expect(picker.props.defaultCoins.some(c => c.tick === 'CARD')).toBe(false)
	})

	test('un usuario elegible ve CARD y la pill Tarjeta primero', async () => {
		const tree = await renderAdd()
		const picker = tree.root.findByType('QPCoinPicker')
		expect(picker.props.coins).toBe(mockCoinCatalog)
		expect(picker.props.defaultCoins[0]).toEqual({ tick: 'CARD', label: 'Tarjeta' })
	})

	test('generar el depósito abre el modal y presenta el PaymentSheet nativo', async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD)
		await pressGenerate(tree)
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'CARD', amount: 50, fee_mode: 'on_top' })
		expect(presentCardDeposit).toHaveBeenCalledWith(expect.objectContaining({ topupData: cardInvoice, user: eligibleUser }))
		const modal = tree.root.findByType('DepositDetailsModal')
		expect(modal.props.visible).toBe(true)
		// La hoja confirmó: queda en processing hasta que el webhook acredite (SSE 'paid')
		expect(modal.props.depositStatus).toBe('processing')
		// El id del PaymentIntent no es una dirección: nada de detección de wallets
		expect(detectInstalledWallets).not.toHaveBeenCalled()
	})

	test('el selector de fee aparece solo con CARD elegida (y su fee > 0)', async () => {
		const tree = await renderAdd()
		expect(tree.root.findAllByType('CardFeeModeSelector')).toHaveLength(0)
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(CARD) })
		const selector = tree.root.findByType('CardFeeModeSelector')
		expect(selector.props.value).toBe('on_top')
		expect(selector.props.feeRate).toBe(6)
		// Cambiar a otra moneda lo quita
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(USDT) })
		expect(tree.root.findAllByType('CardFeeModeSelector')).toHaveLength(0)
	})

	test('con CARD sin fee no hay selector y no cambia el flujo', async () => {
		const tree = await renderAdd()
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect({ ...CARD, fee_in: '0' }) })
		expect(tree.root.findAllByType('CardFeeModeSelector')).toHaveLength(0)
	})

	test('elegir "fee incluido" viaja en el POST; re-elegir moneda vuelve al default', async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD)
		await act(async () => { tree.root.findByType('CardFeeModeSelector').props.onChange('included') })
		await pressGenerate(tree)
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'CARD', amount: 50, fee_mode: 'included' })
		// Volver a seleccionar una moneda resetea el modo a on_top
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(CARD) })
		expect(tree.root.findByType('CardFeeModeSelector').props.value).toBe('on_top')
	})

	test('el POST de monedas no-CARD no lleva fee_mode', async () => {
		apiClient.post.mockResolvedValue({ status: 200, data: { data: { transaction_uuid: 'tx-1', wallet: 'TAddr', coin: 'USDT' } } })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, USDT)
		await pressGenerate(tree)
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'USDT', amount: 50 })
	})

	test('cancelar la hoja deja la orden pendiente y permite reintentar desde el modal', async () => {
		presentCardDeposit.mockResolvedValue({ status: 'canceled' })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD)
		await pressGenerate(tree)
		const modal = tree.root.findByType('DepositDetailsModal')
		expect(modal.props.depositStatus).toBe('pending')
		presentCardDeposit.mockClear()
		await act(async () => { modal.props.onPayWithCard() })
		expect(presentCardDeposit).toHaveBeenCalledWith(expect.objectContaining({ topupData: cardInvoice }))
	})

	test('un fallo del PaymentSheet muestra el error en un toast', async () => {
		presentCardDeposit.mockResolvedValue({ status: 'failed', message: 'Tarjeta rechazada' })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD)
		await pressGenerate(tree)
		expect(toast.error).toHaveBeenCalledWith('Pago con tarjeta', { description: 'Tarjeta rechazada' })
		expect(tree.root.findByType('DepositDetailsModal').props.depositStatus).toBe('pending')
	})

	test('el rechazo del gate del servidor pinta su mensaje literal', async () => {
		apiClient.post.mockRejectedValue({ response: { data: { error: 'Método de pago no soportado para este usuario' } } })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD)
		await pressGenerate(tree)
		expect(JSON.stringify(tree.toJSON())).toContain('Método de pago no soportado para este usuario')
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
		const client = clients[clients.length - 1]
		const invalidate = jest.spyOn(client, 'invalidateQueries')
		// Histórico infinito cacheado con dos páginas: el pago debe recortarlo a
		// la primera para que el refetch posterior sea UNA petición
		client.setQueryData(['transactions', 'list', {}], {
			pages: [[{ uuid: 't-old' }], [{ uuid: 't-older' }]],
			pageParams: [null, 2],
		})
		await act(async () => { sseCallback('paid') })
		expect(toast.success).toHaveBeenCalledWith('Pago confirmado', expect.anything())
		expect(tree.root.findByType('DepositDetailsModal').props.depositStatus).toBe('paid')
		// El historial también se refresca al momento (feed del Home + histórico)
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['home'] })
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['transactions'] })
		expect(client.getQueryData(['transactions', 'list', {}]).pages).toHaveLength(1)
		await act(async () => { jest.advanceTimersByTime(2000) })
		expect(tree.root.findByType('DepositDetailsModal').props.visible).toBe(false)
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
