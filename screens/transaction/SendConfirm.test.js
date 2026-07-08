/**
 * Behavior tests for the SendConfirm screen — recipient resolution, the
 * PIN/OTP confirmation step, the transferMoney payload and success/error
 * handling — node environment with every collaborator mocked (see
 * keypadAmount.test.js for why node env, and auth/screens/Login.test.js for
 * the screen-testing pattern).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../hooks/OnlineStatusContext', () => ({ useOnlineStatus: jest.fn() }))
jest.mock('../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('./PinConfirmStep', () => 'PinConfirmStep')
jest.mock('./TransferSummaryCards', () => 'TransferSummaryCards')
jest.mock('../../api/userApi', () => ({ userApi: { searchUser: jest.fn() } }))
jest.mock('../../api/transferApi', () => ({ transferApi: { transferMoney: jest.fn() } }))
jest.mock('../../api/withdrawApi', () => ({ withdrawApi: { requestPin: jest.fn() } }))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../../auth/AuthContext'
import { useOnlineStatus } from '../../hooks/OnlineStatusContext'
import { userApi } from '../../api/userApi'
import { transferApi } from '../../api/transferApi'
import { withdrawApi } from '../../api/withdrawApi'
import { toast } from 'sonner-native'
import { ROUTES } from '../../routes'
import SendConfirm from './SendConfirm'

const RECIPIENT = { uuid: 'u-9', name: 'Ana', username: 'ana' }
const PARAMS = { send_amount: '25', user_uuid: 'u-9', description: 'para el café' }
const navigation = { navigate: jest.fn(), goBack: jest.fn() }

const renderConfirm = async (params = PARAMS) => {
	let tree
	await act(async () => { tree = create(<SendConfirm navigation={navigation} route={{ params }} />) })
	return tree
}

const buttonByTitle = (tree, title) => tree.root.findAllByType('QPButton').find(b => b.props.title === title)
const pressContinuar = (tree) => act(async () => { buttonByTitle(tree, 'Continuar').props.onPress() })
const pinStep = (tree) => tree.root.findByType('PinConfirmStep')
const enterPin = (tree, code) => act(async () => { pinStep(tree).props.onPinChange(code, 0) })

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	useAuth.mockReturnValue({ user: { balance: 100, two_factor_secret: null } })
	useOnlineStatus.mockReturnValue({ trackUsers: jest.fn(), untrackUsers: jest.fn(), isUserOnline: jest.fn(() => false) })
	userApi.searchUser.mockResolvedValue({ success: true, data: [RECIPIENT] })
	transferApi.transferMoney.mockResolvedValue({ success: true, data: {} })
	withdrawApi.requestPin.mockResolvedValue({ success: true })
})
afterEach(() => { jest.useRealTimers() })

describe('recipient resolution', () => {
	test('resolves the recipient and shows the transfer summary', async () => {
		const tree = await renderConfirm()
		expect(userApi.searchUser).toHaveBeenCalledWith('u-9')
		const summary = tree.root.findByType('TransferSummaryCards')
		expect(summary.props.recipientUser).toEqual(RECIPIENT)
		expect(summary.props.sendAmount).toBe('25')
		expect(summary.props.description).toBe('para el café')
	})

	test('an unknown recipient toasts an error and goes back', async () => {
		userApi.searchUser.mockResolvedValue({ success: true, data: [] })
		await renderConfirm()
		expect(toast.error).toHaveBeenCalledWith('Error', { description: 'No se pudo encontrar el usuario destinatario' })
		expect(navigation.goBack).toHaveBeenCalled()
	})

	test('a thrown lookup error toasts and goes back too', async () => {
		userApi.searchUser.mockRejectedValue(new Error('network'))
		await renderConfirm()
		expect(toast.error).toHaveBeenCalledWith('Error', { description: 'Error al cargar los datos del destinatario' })
		expect(navigation.goBack).toHaveBeenCalled()
	})

	test('no user_uuid param renders the not-found state with a Volver button', async () => {
		const tree = await renderConfirm({ send_amount: '25' })
		expect(JSON.stringify(tree.toJSON())).toContain('Usuario no encontrado')
		await act(async () => { buttonByTitle(tree, 'Volver').props.onPress() })
		expect(navigation.goBack).toHaveBeenCalled()
	})
})

describe('PIN step', () => {
	test('Continuar opens the PIN step expecting a 4-digit emailed PIN', async () => {
		const tree = await renderConfirm()
		expect(tree.root.findAllByType('PinConfirmStep')).toHaveLength(0)
		await pressContinuar(tree)
		expect(pinStep(tree).props.codeLength).toBe(4)
		expect(pinStep(tree).props.hasOTP).toBe(false)
	})

	test('a successful PIN request toasts the email hint; a failure surfaces the error', async () => {
		const tree = await renderConfirm()
		await pressContinuar(tree)
		await act(async () => { await pinStep(tree).props.onRequestPin() })
		expect(toast.success).toHaveBeenCalledWith('PIN enviado', { description: 'Revisa tu correo electrónico' })
		withdrawApi.requestPin.mockResolvedValue({ success: false, error: 'Espera un momento' })
		await act(async () => { await pinStep(tree).props.onRequestPin() })
		expect(toast.error).toHaveBeenCalledWith('Espera un momento')
	})

	test('pressing Confirmar with an incomplete PIN toasts a validation error', async () => {
		const tree = await renderConfirm()
		await pressContinuar(tree)
		await enterPin(tree, '1')
		await act(async () => { buttonByTitle(tree, 'Confirmar Envío').props.onPress() })
		expect(transferApi.transferMoney).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalledWith('Ingresa un PIN de 4 dígitos')
	})
})

describe('transfer execution', () => {
	test('a complete PIN auto-submits the transfer payload and navigates to SendSuccess', async () => {
		const tree = await renderConfirm()
		await pressContinuar(tree)
		await enterPin(tree, '1234')
		expect(transferApi.transferMoney).toHaveBeenCalledWith({
			amount: '25',
			description: 'para el café',
			to: 'u-9',
			pin: '1234',
		})
		expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.SEND_SUCCESS, {
			amount: '25',
			recipient: RECIPIENT,
			description: 'para el café',
		})
	})

	test('a failed transfer surfaces the backend error and stays on the screen', async () => {
		transferApi.transferMoney.mockResolvedValue({ success: false, error: 'Saldo insuficiente' })
		const tree = await renderConfirm()
		await pressContinuar(tree)
		await enterPin(tree, '1234')
		expect(toast.error).toHaveBeenCalledWith('Error en la transacción', { description: 'Saldo insuficiente' })
		expect(navigation.navigate).not.toHaveBeenCalled()
	})

	test('a thrown transfer error toasts its message', async () => {
		transferApi.transferMoney.mockRejectedValue(new Error('network down'))
		const tree = await renderConfirm()
		await pressContinuar(tree)
		await enterPin(tree, '1234')
		expect(toast.error).toHaveBeenCalledWith('Error', { description: 'network down' })
	})
})

describe('OTP method (TOTP 2FA)', () => {
	test('toggling to OTP expects 6 digits and the pin travels as a string, leading zero intact', async () => {
		useAuth.mockReturnValue({ user: { balance: 100, two_factor_secret: 'SECRET' } })
		const tree = await renderConfirm()
		await pressContinuar(tree)
		expect(pinStep(tree).props.hasOTP).toBe(true)
		await act(async () => { pinStep(tree).props.onMethodToggle('right') })
		expect(pinStep(tree).props.codeLength).toBe(6)
		// 4 digits are not enough in OTP mode — no auto-submit yet
		await enterPin(tree, '1234')
		expect(transferApi.transferMoney).not.toHaveBeenCalled()
		await enterPin(tree, '012345')
		// transferMoney stringifies the pin, so the leading zero survives here
		// (unlike withdrawApi.withdraw — see api/withdrawApi.test.js)
		expect(transferApi.transferMoney).toHaveBeenCalledWith(expect.objectContaining({ pin: '012345' }))
	})
})
