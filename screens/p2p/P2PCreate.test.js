/**
 * Behavior tests for the P2P offer creation screen: the p2p_enabled gate, the
 * coin catalog, publish validations (amounts, ratio fields from working_data),
 * the `POST /p2p/create` payload (201 contract) and the saved payment methods
 * picker — node environment with every collaborator mocked (see
 * auth/screens/Login.test.js for the screen-testing pattern).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../api/coinsApi', () => ({ __esModule: true, default: { index: jest.fn() } }))
jest.mock('../../api/p2pApi', () => ({ __esModule: true, default: { create: jest.fn() } }))
jest.mock('../../api/userApi', () => ({ userApi: { getPaymentMethods: jest.fn() } }))
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/QPCoinPicker', () => 'QPCoinPicker')
jest.mock('../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('./P2PCreateForm', () => 'P2PCreateForm')
jest.mock('./SavedMethodsModal', () => 'SavedMethodsModal')
jest.mock('./P2PRequirementsGate', () => 'P2PRequirementsGate')
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../../auth/AuthContext'
import coinsApi from '../../api/coinsApi'
import p2pApi from '../../api/p2pApi'
import { userApi } from '../../api/userApi'
import { toast } from 'sonner-native'
import P2PCreate from './P2PCreate'

const navigation = { navigate: jest.fn() }

// A coin whose working_data drives two dynamic payment-details fields
const BANK_CUP = {
	tick: 'BANK_CUP',
	name: 'CUP',
	working_data: JSON.stringify([{ name: 'Card Number' }, { name: 'Phone' }]),
}
// A coin without payment-details fields
const USDT = { tick: 'USDT', name: 'Tether' }

const renderCreate = async () => {
	let tree
	await act(async () => { tree = create(<P2PCreate navigation={navigation} />) })
	return tree
}

const formPanel = (tree) => tree.root.findByType('P2PCreateForm')
const publishButton = (tree) => tree.root.findByType('QPButton')

const selectCoin = (tree, coin) =>
	act(() => { tree.root.findByType('QPCoinPicker').props.onSelect(coin) })

const setField = (tree, field, value) =>
	act(() => { formPanel(tree).props.onField(field, value) })

const setWorkingField = (tree, key, value) =>
	act(() => { formPanel(tree).props.onChangeWorkingField(key, value) })

const fillOffer = async (tree, { coin = USDT, amount = '50', receive = '480' } = {}) => {
	selectCoin(tree, coin)
	setField(tree, 'amount', amount)
	setField(tree, 'receive', receive)
}

const pressPublish = (tree) => act(async () => { publishButton(tree).props.onPress() })

beforeEach(() => {
	jest.clearAllMocks()
	useAuth.mockReturnValue({ user: { p2p_enabled: true, kyc: 1 } })
	coinsApi.index.mockResolvedValue({ data: [] })
	p2pApi.create.mockResolvedValue({ status: 201, data: { p2p: { uuid: 'offer-1' } } })
	userApi.getPaymentMethods.mockResolvedValue({ success: true, data: [] })
})

describe('requirements gate and coin catalog', () => {
	test('users without p2p_enabled only see the requirements gate', async () => {
		useAuth.mockReturnValue({ user: { p2p_enabled: false } })
		const tree = await renderCreate()
		expect(tree.root.findByType('P2PRequirementsGate')).toBeDefined()
		expect(tree.root.findAllByType('P2PCreateForm')).toHaveLength(0)
	})

	test('loads the p2p-enabled coins on mount and feeds them to the picker', async () => {
		const coins = [{ name: 'Bancarias', coins: [BANK_CUP] }]
		coinsApi.index.mockResolvedValue({ data: coins })
		const tree = await renderCreate()
		expect(coinsApi.index).toHaveBeenCalledWith({ enabled_p2p: true })
		expect(tree.root.findByType('QPCoinPicker').props.coins).toBe(coins)
	})
})

describe('publish button state', () => {
	test('stays disabled until coin and both amounts are set, then shows the buy label', async () => {
		const tree = await renderCreate()
		expect(publishButton(tree).props.disabled).toBe(true)
		await fillOffer(tree)
		expect(publishButton(tree).props.disabled).toBe(false)
		expect(publishButton(tree).props.title).toBe('Comprar $50')
	})

	test('switching to sell flips the label', async () => {
		const tree = await renderCreate()
		await fillOffer(tree)
		setField(tree, 'type', 'sell')
		expect(publishButton(tree).props.title).toBe('Vender $50')
	})
})

describe('publish validations', () => {
	test('rejects publishing without a coin', async () => {
		const tree = await renderCreate()
		setField(tree, 'amount', '50')
		setField(tree, 'receive', '480')
		await pressPublish(tree)
		expect(toast.error).toHaveBeenCalledWith('Datos incompletos', { description: 'Debes seleccionar una moneda' })
		expect(p2pApi.create).not.toHaveBeenCalled()
	})

	test('rejects publishing with a missing amount', async () => {
		const tree = await renderCreate()
		selectCoin(tree, USDT)
		setField(tree, 'amount', '50')
		await pressPublish(tree)
		expect(toast.error).toHaveBeenCalledWith('Datos incompletos', { description: 'Debes completar los montos de comprar y vender' })
		expect(p2pApi.create).not.toHaveBeenCalled()
	})

	test('rejects zero or non-numeric amounts', async () => {
		const tree = await renderCreate()
		await fillOffer(tree, { amount: '0', receive: 'abc' })
		await pressPublish(tree)
		expect(toast.error).toHaveBeenCalledWith('Montos inválidos', expect.anything())
		expect(p2pApi.create).not.toHaveBeenCalled()
	})

	test('requires every working_data field of the selected coin before publishing', async () => {
		const tree = await renderCreate()
		await fillOffer(tree, { coin: BANK_CUP })
		setWorkingField(tree, 'card_number', '9224 0699 9632 8054')
		// "Phone" left empty
		await pressPublish(tree)
		expect(toast.error).toHaveBeenCalledWith('Faltan datos', expect.anything())
		expect(p2pApi.create).not.toHaveBeenCalled()
	})
})

describe('offer creation', () => {
	test('publishes the full payload (normalizing comma decimals) and navigates to the created offer', async () => {
		const tree = await renderCreate()
		await fillOffer(tree, { coin: BANK_CUP, amount: '10,5', receive: '4200,75' })
		setWorkingField(tree, 'card_number', '9224 0699 9632 8054')
		setWorkingField(tree, 'phone', '55555555')
		setField(tree, 'message', 'Pago rápido')
		setField(tree, 'onlyVIP', true)
		await pressPublish(tree)
		expect(p2pApi.create).toHaveBeenCalledWith({
			type: 'buy',
			coin: 'BANK_CUP',
			amount: 10.5,
			receive: 4200.75,
			details: [
				{ name: 'Card Number', value: '9224 0699 9632 8054' },
				{ name: 'Phone', value: '55555555' },
			],
			only_vip: 1,
			private: 0,
			message: 'Pago rápido',
		})
		expect(toast.success).toHaveBeenCalledWith('Listo', { description: 'Tu oferta se ha creado correctamente' })
		expect(navigation.navigate).toHaveBeenCalledWith('P2POffer', { p2p_uuid: 'offer-1' })
	})

	test('coins without working_data publish an empty details array', async () => {
		const tree = await renderCreate()
		await fillOffer(tree)
		await pressPublish(tree)
		expect(p2pApi.create).toHaveBeenCalledWith(expect.objectContaining({ coin: 'USDT', details: [] }))
	})

	test('a non-201 response surfaces the API error and does not navigate', async () => {
		p2pApi.create.mockResolvedValue({ status: 422, error: 'Ya tienes una oferta abierta' })
		const tree = await renderCreate()
		await fillOffer(tree)
		await pressPublish(tree)
		expect(toast.error).toHaveBeenCalledWith('Error al crear la oferta', { description: 'Ya tienes una oferta abierta' })
		expect(navigation.navigate).not.toHaveBeenCalled()
		expect(publishButton(tree).props.loading).toBe(false)
	})

	test('a thrown network error is toasted with its message', async () => {
		p2pApi.create.mockRejectedValue(new Error('Network Error'))
		const tree = await renderCreate()
		await fillOffer(tree)
		await pressPublish(tree)
		expect(toast.error).toHaveBeenCalledWith('Error al crear la oferta', { description: 'Network Error' })
	})
})

describe('saved payment methods', () => {
	test('opening the picker without a coin selected only toasts', async () => {
		const tree = await renderCreate()
		await act(async () => { formPanel(tree).props.onLaunchSavedMethods() })
		expect(toast.error).toHaveBeenCalledWith('Selecciona una moneda')
		expect(userApi.getPaymentMethods).not.toHaveBeenCalled()
	})

	test('loads the saved methods filtered by the selected coin and opens the modal', async () => {
		const cupMethod = { id: 1, coin: { tick: 'BANK_CUP' }, details: [] }
		userApi.getPaymentMethods.mockResolvedValue({
			success: true,
			data: [cupMethod, { id: 2, coin: { tick: 'USDT' }, details: [] }],
		})
		const tree = await renderCreate()
		selectCoin(tree, BANK_CUP)
		await act(async () => { formPanel(tree).props.onLaunchSavedMethods() })
		const modal = tree.root.findByType('SavedMethodsModal')
		expect(modal.props.visible).toBe(true)
		expect(modal.props.methods).toEqual([cupMethod])
	})

	test('selecting a saved method maps its details into the working form and closes the modal', async () => {
		userApi.getPaymentMethods.mockResolvedValue({
			success: true,
			data: [{ id: 1, coin: { tick: 'BANK_CUP' }, details: [] }],
		})
		const tree = await renderCreate()
		selectCoin(tree, BANK_CUP)
		await act(async () => { formPanel(tree).props.onLaunchSavedMethods() })
		const method = {
			details: [
				{ name: 'Card Number', value: '9224 0699 9632 8054' },
				{ name: 'Other', value: 'ignored' },
			],
		}
		await act(async () => { tree.root.findByType('SavedMethodsModal').props.onSelect(method) })
		expect(formPanel(tree).props.workingForm).toEqual({ card_number: '9224 0699 9632 8054', phone: '' })
		expect(tree.root.findByType('SavedMethodsModal').props.visible).toBe(false)
	})

	test('a failed methods fetch surfaces the error without opening the modal', async () => {
		userApi.getPaymentMethods.mockResolvedValue({ success: false, error: 'No autorizado' })
		const tree = await renderCreate()
		selectCoin(tree, BANK_CUP)
		await act(async () => { formPanel(tree).props.onLaunchSavedMethods() })
		expect(toast.error).toHaveBeenCalledWith('No autorizado')
		expect(tree.root.findByType('SavedMethodsModal').props.visible).toBe(false)
	})
})
