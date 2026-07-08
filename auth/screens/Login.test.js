/**
 * Behavior tests for the Login screen state machine (credentials → 2FA →
 * session, 60s lockout, HIBP modal, biometric enrollment) — node environment
 * with every collaborator mocked (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../settings/SettingsContext', () => ({ useSettings: jest.fn() }))
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('./login/CredentialsForm', () => 'CredentialsForm')
jest.mock('./login/TwoFactorEntry', () => 'TwoFactorEntry')
jest.mock('./login/QuickLoginRow', () => 'QuickLoginRow')
jest.mock('./login/LeakedPasswordModal', () => 'LeakedPasswordModal')
jest.mock('../hooks/useBiometricSupport', () => jest.fn())
jest.mock('../../api/client', () => ({
	getSupportedBiometryType: jest.fn(),
	hasBiometricCredentials: jest.fn(),
	getBiometricCredentials: jest.fn(),
	setBiometricCredentials: jest.fn(),
	removeBiometricCredentials: jest.fn(),
}))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

import React from 'react'
import { Alert } from 'react-native'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../AuthContext'
import { useSettings } from '../../settings/SettingsContext'
import useBiometricSupport from '../hooks/useBiometricSupport'
import {
	getSupportedBiometryType,
	hasBiometricCredentials,
	getBiometricCredentials,
	setBiometricCredentials,
	removeBiometricCredentials,
} from '../../api/client'
import { toast } from 'sonner-native'
import LoginScreen from './Login'

const login = jest.fn()
const requestPin = jest.fn()
const loginWithPasskey = jest.fn()
const updateSettings = jest.fn()
const setHasBiometrics = jest.fn()
const navigation = { navigate: jest.fn() }

const renderLogin = () => {
	let tree
	act(() => { tree = create(<LoginScreen navigation={navigation} />) })
	return tree
}

const fillCredentials = (tree, email = 'a@b.co', password = 'secret') => {
	const form = tree.root.findByType('CredentialsForm')
	act(() => { form.props.onChangeEmail(email) })
	act(() => { form.props.onChangePassword(password) })
}

const accederButton = (tree) => tree.root.findByType('QPButton')

const pressAcceder = (tree) => act(async () => { accederButton(tree).props.onPress() })

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	jest.spyOn(Alert, 'alert').mockImplementation(() => {})
	useAuth.mockReturnValue({ login, loginWithPasskey, requestPin, clearError: jest.fn() })
	useSettings.mockReturnValue({ updateSettings })
	useBiometricSupport.mockReturnValue({ biometryType: null, hasBiometrics: false, setHasBiometrics })
	login.mockResolvedValue({ success: true, status: 200 })
	updateSettings.mockResolvedValue({ success: true })
	getSupportedBiometryType.mockResolvedValue(null)
	hasBiometricCredentials.mockResolvedValue(false)
})
afterEach(() => { jest.useRealTimers() })

describe('credentials step', () => {
	test('submits the credentials and a 202 opens the 2FA step, clearing firstTime', async () => {
		login.mockResolvedValue({ success: false, status: 202, has_otp: true })
		const tree = renderLogin()
		fillCredentials(tree)
		await pressAcceder(tree)
		expect(login).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret' })
		expect(updateSettings).toHaveBeenCalledWith('appearance', { firstTime: false })
		expect(tree.root.findByType('TwoFactorEntry').props.hasOtp).toBe(true)
	})

	test('empty fields keep the button disabled and pressing toasts a Spanish error', async () => {
		const tree = renderLogin()
		expect(accederButton(tree).props.disabled).toBe(true)
		await pressAcceder(tree)
		expect(login).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalledWith('Por favor completa todos los campos')
	})

	test('a wrong password surfaces the backend error', async () => {
		login.mockResolvedValue({ success: false, status: 401, error: 'Credenciales inválidas' })
		const tree = renderLogin()
		fillCredentials(tree)
		await pressAcceder(tree)
		expect(toast.error).toHaveBeenCalledWith('Credenciales inválidas')
	})
})

describe('60s lockout after repeated failures', () => {
	test('the 6th failed attempt disables login and shows the lockout message', async () => {
		login.mockResolvedValue({ success: false, status: 401, error: 'Credenciales inválidas' })
		const tree = renderLogin()
		fillCredentials(tree)
		for (let i = 0; i < 6; i++) { await pressAcceder(tree) }
		expect(accederButton(tree).props.disabled).toBe(true)
		expect(JSON.stringify(tree.toJSON())).toContain('Demasiados intentos, por favor espera 1 minuto para intentar nuevamente')
	})

	test('the lockout lifts after 60 seconds', async () => {
		login.mockResolvedValue({ success: false, status: 401, error: 'x' })
		const tree = renderLogin()
		fillCredentials(tree)
		for (let i = 0; i < 6; i++) { await pressAcceder(tree) }
		await act(async () => { jest.advanceTimersByTime(60000) })
		expect(accederButton(tree).props.disabled).toBe(false)
		expect(JSON.stringify(tree.toJSON())).not.toContain('Demasiados intentos')
	})

	test('non-401 failures (e.g. network) never count toward the lockout', async () => {
		login.mockResolvedValue({ success: false, error: 'No se ha podido conectar con el servidor' })
		const tree = renderLogin()
		fillCredentials(tree)
		for (let i = 0; i < 10; i++) { await pressAcceder(tree) }
		expect(accederButton(tree).props.disabled).toBe(false)
	})
})

describe('2FA step', () => {
	const enterTwoFactor = async () => {
		login.mockResolvedValueOnce({ success: false, status: 202, has_otp: true })
		const tree = renderLogin()
		fillCredentials(tree)
		await pressAcceder(tree)
		return tree
	}

	test('a complete PIN auto-submits with the two_factor_code', async () => {
		const tree = await enterTwoFactor()
		login.mockResolvedValue({ success: true, status: 200 })
		await act(async () => { tree.root.findByType('TwoFactorEntry').props.onChangeCode('1234') })
		expect(login).toHaveBeenLastCalledWith({ email: 'a@b.co', password: 'secret', two_factor_code: '1234' })
	})

	test('switching to OTP resets the code and expects 6 digits', async () => {
		const tree = await enterTwoFactor()
		const entry = tree.root.findByType('TwoFactorEntry')
		await act(async () => { entry.props.onMethodToggle('right') })
		const otpEntry = tree.root.findByType('TwoFactorEntry')
		expect(otpEntry.props.method).toBe('otp')
		expect(otpEntry.props.expectedCodeLength).toBe(6)
		expect(otpEntry.props.code).toBe('')
	})

	test('a failed PIN request toasts its error', async () => {
		const tree = await enterTwoFactor()
		requestPin.mockResolvedValue({ success: false, error: 'Espera un momento' })
		await act(async () => { await tree.root.findByType('TwoFactorEntry').props.onRequestPin() })
		expect(toast.error).toHaveBeenCalledWith('Espera un momento')
	})
})

describe('HIBP leaked-password modal', () => {
	test('a 403 with reset_password opens the modal in blocked mode', async () => {
		login.mockResolvedValue({ success: false, status: 403, action: 'reset_password', error: 'Contraseña comprometida' })
		const tree = renderLogin()
		fillCredentials(tree)
		await pressAcceder(tree)
		const modal = tree.root.findByType('LeakedPasswordModal')
		expect(modal.props.state).toMatchObject({ visible: true, blocked: true, message: 'Contraseña comprometida' })
	})

	test('a security warning on success opens the modal unblocked; reset navigates to recovery', async () => {
		login.mockResolvedValue({ success: true, status: 200, security_warning: { message: 'Vista en filtraciones', count: 3 } })
		const tree = renderLogin()
		fillCredentials(tree)
		await pressAcceder(tree)
		const modal = tree.root.findByType('LeakedPasswordModal')
		expect(modal.props.state).toMatchObject({ visible: true, blocked: false, count: 3 })
		await act(async () => { modal.props.onReset() })
		expect(navigation.navigate).toHaveBeenCalledWith('RecoverPassword', { email: 'a@b.co' })
	})
})

describe('biometric enrollment and quick login', () => {
	test('a clean login on a Face ID device offers enrollment; accepting stores the creds', async () => {
		getSupportedBiometryType.mockResolvedValue('FaceID')
		setBiometricCredentials.mockResolvedValue(true)
		const tree = renderLogin()
		fillCredentials(tree)
		await pressAcceder(tree)
		expect(Alert.alert).toHaveBeenCalledWith('Activar Face ID', expect.any(String), expect.any(Array))
		const activar = Alert.alert.mock.calls[0][2][1]
		await act(async () => { await activar.onPress() })
		expect(setBiometricCredentials).toHaveBeenCalledWith('a@b.co', 'secret')
		expect(updateSettings).toHaveBeenCalledWith('security', { biometricsEnabled: true })
	})

	test('no enrollment prompt when biometrics are unsupported or already enrolled', async () => {
		hasBiometricCredentials.mockResolvedValue(true)
		getSupportedBiometryType.mockResolvedValue('FaceID')
		const tree = renderLogin()
		fillCredentials(tree)
		await pressAcceder(tree)
		expect(Alert.alert).not.toHaveBeenCalled()
	})

	test('a 401 on biometric quick login wipes the stale Keychain credentials', async () => {
		useBiometricSupport.mockReturnValue({ biometryType: 'FaceID', hasBiometrics: true, setHasBiometrics })
		getBiometricCredentials.mockResolvedValue({ email: 'a@b.co', password: 'old' })
		removeBiometricCredentials.mockResolvedValue(true)
		login.mockResolvedValue({ success: false, status: 401, error: 'x' })
		const tree = renderLogin()
		await act(async () => { tree.root.findByType('QuickLoginRow').props.onBiometricLogin() })
		expect(removeBiometricCredentials).toHaveBeenCalled()
		expect(setHasBiometrics).toHaveBeenCalledWith(false)
		expect(updateSettings).toHaveBeenCalledWith('security', { biometricsEnabled: false })
	})

	test('a passkey failure with an error message toasts it (silent cancellations do not)', async () => {
		loginWithPasskey.mockResolvedValue({ success: false, error: null })
		const tree = renderLogin()
		await act(async () => { tree.root.findByType('QuickLoginRow').props.onPasskeyLogin() })
		expect(toast.error).not.toHaveBeenCalled()
		loginWithPasskey.mockResolvedValue({ success: false, error: 'Passkey inválida' })
		await act(async () => { tree.root.findByType('QuickLoginRow').props.onPasskeyLogin() })
		expect(toast.error).toHaveBeenCalledWith('Passkey inválida')
	})
})
