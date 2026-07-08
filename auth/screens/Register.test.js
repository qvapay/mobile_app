/**
 * Behavior tests for the Register wizard (name → email → password → email PIN →
 * phone → phone code → push): per-step validations, step transitions, API
 * payloads, the silent session (token to Keychain without flipping
 * isAuthenticated) and error handling — node environment with every
 * collaborator mocked (see Login.test.js for the screen-testing pattern).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-navigation/native', () => ({ usePreventRemove: jest.fn() }))
jest.mock('../AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../hooks/usePinCountdown', () => jest.fn())
jest.mock('../../hooks/useStepTransitions', () => jest.fn())
jest.mock('../../hooks/usePushPrompt', () => jest.fn())
jest.mock('../../api/authApi', () => ({ authApi: { login: jest.fn() } }))
jest.mock('../../api/userApi', () => ({ userApi: { verifyPhone: jest.fn() } }))
jest.mock('../../api/client', () => ({ setAuthToken: jest.fn() }))
jest.mock('../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/particles/QPCodeInput', () => 'QPCodeInput')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../ui/QPPhoneInput', () => 'QPPhoneInput')
jest.mock('../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { usePreventRemove } from '@react-navigation/native'
import { useAuth } from '../AuthContext'
import usePinCountdown from '../hooks/usePinCountdown'
import useStepTransitions from '../../hooks/useStepTransitions'
import usePushPrompt from '../../hooks/usePushPrompt'
import { authApi } from '../../api/authApi'
import { userApi } from '../../api/userApi'
import { setAuthToken } from '../../api/client'
import { toast } from 'sonner-native'
import RegisterScreen from './Register'

const register = jest.fn()
const completeSession = jest.fn()
const startCountdown = jest.fn()
const enablePush = jest.fn()
const dismissOnboardPrompt = jest.fn()
const navigation = { navigate: jest.fn() }

const renderRegister = () => {
	let tree
	act(() => { tree = create(<RegisterScreen navigation={navigation} />) })
	return tree
}

const input = (tree, placeholder) =>
	tree.root.findAllByType('QPInput').find((i) => i.props.placeholder === placeholder)

const button = (tree, title) =>
	tree.root.findAllByType('QPButton').find((b) => b.props.title === title)

const press = (tree, title) => act(async () => { button(tree, title).props.onPress() })

const fillName = (tree, name = 'John', lastname = 'Doe') => {
	act(() => { input(tree, 'Nombre').props.onChangeText(name) })
	act(() => { input(tree, 'Apellidos').props.onChangeText(lastname) })
}

const goToEmailStep = async (tree) => {
	fillName(tree)
	await press(tree, 'Continuar')
}

const goToPasswordStep = async (tree, email = 'john@doe.com') => {
	await goToEmailStep(tree)
	act(() => { input(tree, 'tucorreo@gmail.com').props.onChangeText(email) })
	await press(tree, 'Continuar')
}

const goToEmailPinStep = async (tree) => {
	await goToPasswordStep(tree)
	act(() => { input(tree, 'Contraseña').props.onChangeText('Secret1!') })
	await press(tree, 'Crear cuenta')
}

// Typing the 4th PIN digit auto-submits the email verification
const goToPhoneStep = async (tree) => {
	await goToEmailPinStep(tree)
	await act(async () => { tree.root.findByType('QPCodeInput').props.onChangeCode('1234') })
}

const goToPhoneCodeStep = async (tree, phone = '55555555') => {
	await goToPhoneStep(tree)
	act(() => { tree.root.findByType('QPPhoneInput').props.onChangeText(phone) })
	await press(tree, 'Enviar código')
}

beforeEach(() => {
	jest.clearAllMocks()
	useAuth.mockReturnValue({ register, clearError: jest.fn(), completeSession })
	usePinCountdown.mockReturnValue({ label: 'Solicitar PIN', isDisabled: false, start: startCountdown })
	useStepTransitions.mockReturnValue({ direction: { value: 1 }, makeStepEnter: () => ({}), stepExit: {} })
	usePushPrompt.mockReturnValue({ isPushEnabled: false, enablePush, dismissOnboardPrompt })
	register.mockResolvedValue({ success: true })
	authApi.login.mockResolvedValue({ success: true, accessToken: 'tok-1', me: { username: 'john' } })
	userApi.verifyPhone.mockResolvedValue({ success: true })
	completeSession.mockResolvedValue()
	setAuthToken.mockResolvedValue()
	enablePush.mockResolvedValue()
	dismissOnboardPrompt.mockResolvedValue()
})

describe('name and email steps', () => {
	test('Continuar stays disabled until both names have at least 2 characters', () => {
		const tree = renderRegister()
		expect(button(tree, 'Continuar').props.disabled).toBe(true)
		fillName(tree, 'J', 'D')
		expect(button(tree, 'Continuar').props.disabled).toBe(true)
		fillName(tree)
		expect(button(tree, 'Continuar').props.disabled).toBe(false)
	})

	test('a valid name advances to the email step, and a malformed email keeps it locked', async () => {
		const tree = renderRegister()
		await goToEmailStep(tree)
		const email = input(tree, 'tucorreo@gmail.com')
		expect(email).toBeDefined()
		act(() => { email.props.onChangeText('not-an-email') })
		expect(button(tree, 'Continuar').props.disabled).toBe(true)
		act(() => { email.props.onChangeText('john@doe.com') })
		expect(button(tree, 'Continuar').props.disabled).toBe(false)
	})

	test('the hardware back on the email step goes back to the name step instead of leaving', async () => {
		const tree = renderRegister()
		await goToEmailStep(tree)
		const [intercepted, onBack] = usePreventRemove.mock.calls[usePreventRemove.mock.calls.length - 1]
		expect(intercepted).toBe(true)
		act(() => { onBack() })
		expect(input(tree, 'Nombre')).toBeDefined()
	})
})

describe('password step and account creation', () => {
	test('a weak password keeps Crear cuenta disabled until every rule passes', async () => {
		const tree = renderRegister()
		await goToPasswordStep(tree)
		const password = input(tree, 'Contraseña')
		act(() => { password.props.onChangeText('secret12') }) // no uppercase, no special
		expect(button(tree, 'Crear cuenta').props.disabled).toBe(true)
		act(() => { password.props.onChangeText('Secret1!') })
		expect(button(tree, 'Crear cuenta').props.disabled).toBe(false)
	})

	test('creating the account sends the trimmed payload with terms and opens the email PIN step', async () => {
		const tree = renderRegister()
		await goToEmailStep(tree)
		act(() => { input(tree, 'tucorreo@gmail.com').props.onChangeText('  john@doe.com  ') })
		await press(tree, 'Continuar')
		act(() => { input(tree, 'Contraseña').props.onChangeText('Secret1!') })
		await press(tree, 'Crear cuenta')
		expect(register).toHaveBeenCalledWith({
			name: 'John',
			lastname: 'Doe',
			email: 'john@doe.com',
			password: 'Secret1!',
			invite: undefined,
			terms: true,
		})
		expect(tree.root.findByType('QPCodeInput').props.length).toBe(4)
	})

	test('an invite code revealed on the email step travels in the register payload', async () => {
		const tree = renderRegister()
		await goToEmailStep(tree)
		act(() => { input(tree, 'tucorreo@gmail.com').props.onChangeText('john@doe.com') })
		await act(async () => { tree.root.findByType('QPPressable').props.onPress() })
		act(() => { input(tree, 'Código de invitación').props.onChangeText('AMIGO') })
		await press(tree, 'Continuar')
		act(() => { input(tree, 'Contraseña').props.onChangeText('Secret1!') })
		await press(tree, 'Crear cuenta')
		expect(register).toHaveBeenCalledWith(expect.objectContaining({ invite: 'AMIGO' }))
	})

	test('a failed registration toasts the backend error and stays on the password step', async () => {
		register.mockResolvedValue({ success: false, error: 'El correo ya está registrado' })
		const tree = renderRegister()
		await goToEmailPinStep(tree)
		expect(toast.error).toHaveBeenCalledWith('El correo ya está registrado')
		expect(input(tree, 'Contraseña')).toBeDefined()
	})
})

describe('email PIN verification (silent session)', () => {
	test('the 4th digit auto-submits login as 2FA, stores the token silently and opens the phone step', async () => {
		const tree = renderRegister()
		await goToPhoneStep(tree)
		expect(authApi.login).toHaveBeenCalledWith({ email: 'john@doe.com', password: 'Secret1!', two_factor_code: '1234' })
		expect(setAuthToken).toHaveBeenCalledWith('tok-1')
		expect(completeSession).not.toHaveBeenCalled() // isAuthenticated must not flip yet
		expect(tree.root.findByType('QPPhoneInput')).toBeDefined()
	})

	test('a wrong PIN toasts the error and clears the code for a retry', async () => {
		authApi.login.mockResolvedValue({ success: false, error: 'PIN inválido' })
		const tree = renderRegister()
		await goToPhoneStep(tree)
		expect(toast.error).toHaveBeenCalledWith('PIN inválido')
		expect(tree.root.findByType('QPCodeInput').props.code).toBe('')
		expect(setAuthToken).not.toHaveBeenCalled()
	})
})

describe('phone verification via Telegram', () => {
	test('a phone under 7 digits toasts and never hits the API', async () => {
		const tree = renderRegister()
		await goToPhoneStep(tree)
		act(() => { tree.root.findByType('QPPhoneInput').props.onChangeText('123') })
		expect(button(tree, 'Enviar código').props.disabled).toBe(true)
		await press(tree, 'Enviar código')
		expect(toast.error).toHaveBeenCalledWith('El número debe tener al menos 7 dígitos')
		expect(userApi.verifyPhone).not.toHaveBeenCalled()
	})

	test('sending the code posts phone+country, starts the 60s cooldown and opens the code step', async () => {
		const tree = renderRegister()
		await goToPhoneCodeStep(tree)
		expect(userApi.verifyPhone).toHaveBeenCalledWith({ phone: '55555555', country: 'CU', verify: false })
		expect(toast.success).toHaveBeenCalledWith('Código enviado por Telegram')
		expect(startCountdown).toHaveBeenCalledWith(60)
		expect(tree.root.findByType('QPCodeInput').props.length).toBe(6)
	})

	test('resending stays on the code step', async () => {
		const tree = renderRegister()
		await goToPhoneCodeStep(tree)
		await press(tree, 'Reenviar código')
		expect(userApi.verifyPhone).toHaveBeenLastCalledWith({ phone: '55555555', country: 'CU', verify: false })
		expect(tree.root.findByType('QPCodeInput').props.length).toBe(6)
	})

	test('the 6th digit auto-verifies the code and moves on to the push invitation', async () => {
		const tree = renderRegister()
		await goToPhoneCodeStep(tree)
		await act(async () => { tree.root.findByType('QPCodeInput').props.onChangeCode('654321') })
		expect(userApi.verifyPhone).toHaveBeenLastCalledWith({ phone: '55555555', country: 'CU', code: '654321', verify: true })
		expect(toast.success).toHaveBeenCalledWith('Teléfono verificado correctamente')
		expect(button(tree, 'Activar notificaciones')).toBeDefined()
	})

	test('a wrong phone code surfaces the nested backend error and clears the code', async () => {
		const tree = renderRegister()
		await goToPhoneCodeStep(tree)
		userApi.verifyPhone.mockResolvedValue({ success: false, error: { message: 'Código incorrecto o expirado' } })
		await act(async () => { tree.root.findByType('QPCodeInput').props.onChangeCode('000000') })
		expect(toast.error).toHaveBeenCalledWith('Código incorrecto o expirado')
		expect(tree.root.findByType('QPCodeInput').props.code).toBe('')
	})

	test('skipping the phone goes straight to the push step', async () => {
		const tree = renderRegister()
		await goToPhoneStep(tree)
		await act(async () => { tree.root.findByType('QPPressable').props.onPress() }) // "Ahora no"
		expect(userApi.verifyPhone).not.toHaveBeenCalled()
		expect(button(tree, 'Activar notificaciones')).toBeDefined()
	})

	test('when push permission is already granted, verifying the phone finishes the session directly', async () => {
		usePushPrompt.mockReturnValue({ isPushEnabled: true, enablePush, dismissOnboardPrompt })
		const tree = renderRegister()
		await goToPhoneCodeStep(tree)
		await act(async () => { tree.root.findByType('QPCodeInput').props.onChangeCode('654321') })
		expect(completeSession).toHaveBeenCalledWith({ accessToken: 'tok-1', me: { username: 'john' }, email: 'john@doe.com' })
	})
})

describe('push step and session completion', () => {
	test('activating push enables it, marks the prompt as shown and completes the stashed session', async () => {
		const tree = renderRegister()
		await goToPhoneStep(tree)
		await act(async () => { tree.root.findByType('QPPressable').props.onPress() }) // skip phone
		await press(tree, 'Activar notificaciones')
		expect(enablePush).toHaveBeenCalled()
		expect(dismissOnboardPrompt).toHaveBeenCalled()
		expect(completeSession).toHaveBeenCalledWith({ accessToken: 'tok-1', me: { username: 'john' }, email: 'john@doe.com' })
	})

	test('declining push still dismisses the prompt and completes the session', async () => {
		const tree = renderRegister()
		await goToPhoneStep(tree)
		await act(async () => { tree.root.findByType('QPPressable').props.onPress() }) // skip phone
		await act(async () => { tree.root.findByType('QPPressable').props.onPress() }) // "Ahora no"
		expect(enablePush).not.toHaveBeenCalled()
		expect(dismissOnboardPrompt).toHaveBeenCalled()
		expect(completeSession).toHaveBeenCalled()
	})

	test('a failed completeSession toasts and releases the lock so the user can retry', async () => {
		completeSession.mockRejectedValueOnce(new Error('network'))
		const tree = renderRegister()
		await goToPhoneStep(tree)
		await act(async () => { tree.root.findByType('QPPressable').props.onPress() }) // skip phone
		await act(async () => { tree.root.findByType('QPPressable').props.onPress() }) // skip push
		expect(toast.error).toHaveBeenCalledWith('No se pudo completar el registro, intenta de nuevo')
		completeSession.mockResolvedValueOnce()
		await act(async () => { tree.root.findByType('QPPressable').props.onPress() }) // retry
		expect(completeSession).toHaveBeenCalledTimes(2)
	})
})
