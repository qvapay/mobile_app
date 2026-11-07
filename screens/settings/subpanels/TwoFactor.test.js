/**
 * El 2FA de verdad: activar enseña los códigos de recuperación, que solo llegan una vez,
 * y desactivar exige demostrar el factor.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
const mockUpdateUser = jest.fn()
jest.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ updateUser: mockUpdateUser }) }))
jest.mock('../../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('../../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPLoader', () => 'QPLoader')
jest.mock('react-native-qrcode-styled', () => 'QRCodeStyled')
jest.mock('../../../hooks/useMaxBrightness', () => jest.fn())
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../../helpers', () => ({ copyTextToClipboard: jest.fn() }))
const mockDispatch = jest.fn()
let mockPrevent
jest.mock('@react-navigation/native', () => ({
	useNavigation: () => ({ dispatch: mockDispatch }),
	usePreventRemove: (prevent, callback) => { mockPrevent = { prevent, callback } },
}))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('../../../api/userApi', () => ({
	userApi: { getUserProfile: jest.fn(), generate2FA: jest.fn(), activate2FA: jest.fn(), deactivate2FA: jest.fn() },
}))

import React from 'react'
import { Alert, Share, Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner-native'
import { userApi } from '../../../api/userApi'
import { copyTextToClipboard } from '../../../helpers'
import TwoFactor from './TwoFactor'

const CODES = ['ABCD-2345', 'EFGH-6789']

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

let tree
let client
const open = async (secret = null) => {
	userApi.getUserProfile.mockResolvedValue({ success: true, data: { two_factor_secret: secret } })
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	await act(async () => { tree = create(<QueryClientProvider client={client}><TwoFactor /></QueryClientProvider>) })
	await settle()
}

const button = (title) => tree.root.findAllByType('QPButton').find(item => item.props.title === title)
const press = async (title) => { await act(async () => { await button(title).props.onPress() }); await settle() }
const hasText = (needle) => tree.root.findAllByType(Text).some(node => [].concat(node.props.children).join('').includes(needle))
const typeCode = (value) => act(async () => { tree.root.findByType('QPInput').props.onChangeText(value) })

const activate = async () => {
	userApi.generate2FA.mockResolvedValue({ success: true, data: { secret: 'ABC', otpauth_url: 'otpauth://totp/QvaPay' } })
	userApi.activate2FA.mockResolvedValue({ success: true, data: { result: 'OK', recovery_codes: CODES } })
	await open()
	await press('Configurar 2FA')
	await typeCode('123456')
	await press('Activar 2FA')
}

beforeEach(() => { jest.clearAllMocks() })
afterEach(async () => { await act(async () => { tree.unmount() }); client.clear() })

describe('estado', () => {

	test('el perfil leído al entrar también va al AuthContext: Enviar y Retirar deciden por él', async () => {
		await open('***')
		expect(mockUpdateUser).toHaveBeenCalledWith({ two_factor_secret: '***' })
		expect(hasText('2FA activo')).toBe(true)
	})
})

describe('activar', () => {

	test('el QR sale del secreto que devuelve el servidor', async () => {
		userApi.generate2FA.mockResolvedValue({ success: true, data: { secret: 'ABC', otpauth_url: 'otpauth://totp/QvaPay' } })
		await open()
		await press('Configurar 2FA')
		expect(tree.root.findByType('QRCodeStyled').props.data).toBe('otpauth://totp/QvaPay')
	})

	test('enseña los códigos de recuperación antes de nada', async () => {
		await activate()
		expect(userApi.activate2FA).toHaveBeenCalledWith({ code: '123456', secret: 'ABC' })
		expect(hasText('ABCD-2345')).toBe(true)
		expect(hasText('EFGH-6789')).toBe(true)
		expect(mockUpdateUser).toHaveBeenCalledWith({ two_factor_secret: '***' })
	})

	test('se pueden copiar y guardar', async () => {
		const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })
		await activate()
		await press('Copiar')
		expect(copyTextToClipboard).toHaveBeenCalledWith('ABCD-2345\nEFGH-6789')
		await press('Guardar')
		expect(share).toHaveBeenCalledWith({ message: 'ABCD-2345\nEFGH-6789' })
		share.mockRestore()
	})

	test('al confirmar que los guardó pasa al estado activo y ya no están', async () => {
		await activate()
		await press('Ya los guardé')
		expect(hasText('ABCD-2345')).toBe(false)
		expect(hasText('2FA activo')).toBe(true)
		expect(mockPrevent.prevent).toBe(false)
	})

	test('salir sin guardarlos pide confirmación', async () => {
		const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => { })
		await activate()
		expect(mockPrevent.prevent).toBe(true)
		const action = { type: 'GO_BACK' }
		act(() => { mockPrevent.callback({ data: { action } }) })
		expect(mockDispatch).not.toHaveBeenCalled()
		alert.mock.calls[0][2].find(item => item.style === 'destructive').onPress()
		expect(mockDispatch).toHaveBeenCalledWith(action)
		alert.mockRestore()
	})

	test('un código malo no activa nada', async () => {
		userApi.generate2FA.mockResolvedValue({ success: true, data: { secret: 'ABC', otpauth_url: 'x' } })
		userApi.activate2FA.mockResolvedValue({ success: false, status: 400, error: 'Código inválido' })
		await open()
		await press('Configurar 2FA')
		await typeCode('123456')
		await press('Activar 2FA')
		expect(mockUpdateUser).not.toHaveBeenCalledWith({ two_factor_secret: '***' })
		expect(toast.error).toHaveBeenCalledWith('Código inválido', { description: 'Código inválido' })
	})
})

describe('desactivar', () => {

	test('el botón no desactiva: pide el código', async () => {
		await open('***')
		await press('Desactivar 2FA')
		expect(userApi.deactivate2FA).not.toHaveBeenCalled()
		expect(button('Desactivar').props.disabled).toBe(true)
	})

	test('acepta un código de recuperación', async () => {
		userApi.deactivate2FA.mockResolvedValue({ success: true, data: { result: 'OK' } })
		await open('***')
		await press('Desactivar 2FA')
		await typeCode('abcd-2345')
		await press('Desactivar')
		expect(userApi.deactivate2FA).toHaveBeenCalledWith({ code: 'ABCD-2345' })
		expect(mockUpdateUser).toHaveBeenCalledWith({ two_factor_secret: null })
		expect(hasText('2FA No Activo')).toBe(true)
	})

	test('un código incorrecto no desactiva y deja reintentar', async () => {
		userApi.deactivate2FA.mockResolvedValue({ success: false, status: 422, error: 'Código incorrecto', details: { code: 'OTP_REQUIRED' } })
		await open('***')
		await press('Desactivar 2FA')
		await typeCode('123456')
		await press('Desactivar')
		expect(mockUpdateUser).not.toHaveBeenCalledWith({ two_factor_secret: null })
		expect(tree.root.findByType('QPInput').props.value).toBe('')
		expect(toast.error).toHaveBeenCalledWith('Código inválido', { description: 'El código ingresado no es válido' })
	})

	test('cancelar vuelve al estado activo', async () => {
		await open('***')
		await press('Desactivar 2FA')
		await press('Cancelar')
		expect(hasText('2FA activo')).toBe(true)
	})
})
