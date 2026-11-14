/**
 * Gate de identidad antes de leer la seed. El PIN son 4 dígitos y es lo único entre quien
 * tenga el teléfono desbloqueado y la frase: aquí se fija que el modal NO compara el PIN por
 * su cuenta (pasa por el bloqueo y su límite de intentos) y que con el límite cerrado ni
 * siquiera hay campo donde teclear. Antes, cinco fallos solo cerraban el modal y se podía
 * volver a abrir sin fin.
 * @jest-environment node
 */
jest.mock('../../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-navigation/native', () => ({ useNavigation: jest.fn() }))
jest.mock('../../../../settings/SettingsContext', () => ({ useSettings: () => ({ getSetting: (_group, _key, fallback) => fallback }) }))
jest.mock('../../../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../../../api/client', () => ({ getSupportedBiometryType: jest.fn(), appLockPinStatus: jest.fn() }))
jest.mock('../../../../wallet/keystore', () => ({
	authenticateWalletBiometrics: jest.fn(),
	enableWalletBiometrics: jest.fn(async () => true),
	hasWalletBiometrics: jest.fn(),
}))
jest.mock('../../../../lock/AppLockContext', () => ({ useAppLock: jest.fn() }))
jest.mock('react-native/Libraries/Modal/Modal', () => ({ __esModule: true, default: 'Modal' }))
jest.mock('../../../../ui/QPModalCard', () => 'QPModalCard')
jest.mock('../../../../ui/QPKeyboardAvoidingView', () => 'QPKeyboardAvoidingView')
jest.mock('../../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../../ui/particles/QPCodeInput', () => 'QPCodeInput')
jest.mock('../../../../ui/particles/FaceIDIcon', () => 'FaceIDIcon')
jest.mock('./WalletPinSetup', () => 'WalletPinSetup')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../../../../auth/AuthContext'
import { appLockPinStatus, getSupportedBiometryType } from '../../../../api/client'
import { authenticateWalletBiometrics, enableWalletBiometrics, hasWalletBiometrics } from '../../../../wallet/keystore'
import { useAppLock } from '../../../../lock/AppLockContext'
import WalletAuthModal from './WalletAuthModal'

const verifyAppLockPin = jest.fn()
const proveDeviceOwner = jest.fn()
const forgivePinAttempts = jest.fn(async () => {})
const onAuthorized = jest.fn()
const onClose = jest.fn()
const navigate = jest.fn()

/** El bloqueo con `failures` fallos seguidos, el último hace `agoMs`. */
const withAttempts = (failures, agoMs = 0) => useAppLock.mockReturnValue({
	verifyAppLockPin, proveDeviceOwner, forgivePinAttempts,
	pinAttempts: { failures, lastFailureAt: Date.now() - agoMs }, ownerProofAvailable: true,
})

let tree
const element = () => <WalletAuthModal visible subtitle="Enviar 1 USDT" onClose={onClose} onAuthorized={onAuthorized} />
const render = async () => { await act(async () => { tree = create(element()) }) }
const pinInput = () => tree.root.findAll(n => n.type === 'QPCodeInput')
const texts = () => tree.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children)
const limit = () => tree.root.findAll(n => n.props.testID === 'wallet-auth-limit' && typeof n.props.children === 'string').map(n => n.props.children)[0]
const proofButton = () => tree.root.findAll(n => n.type === 'QPButton' && n.props.testID === 'wallet-auth-owner-proof')
const enter = (code) => act(async () => { await pinInput()[0].props.onFilled(code) })

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	useNavigation.mockReturnValue({ navigate })
	useAuth.mockReturnValue({ isAuthenticated: true })
	appLockPinStatus.mockResolvedValue('set')
	getSupportedBiometryType.mockResolvedValue(null)
	hasWalletBiometrics.mockResolvedValue(false)
	authenticateWalletBiometrics.mockResolvedValue(false)
	verifyAppLockPin.mockResolvedValue({ ok: true })
	withAttempts(0)
})
afterEach(() => {
	act(() => { tree?.unmount() })
	jest.useRealTimers()
})

describe('PIN', () => {
	test('se comprueba por el bloqueo: el PIN correcto autoriza', async () => {
		await render()
		await enter('1234')
		expect(verifyAppLockPin).toHaveBeenCalledWith('1234')
		expect(onAuthorized).toHaveBeenCalledTimes(1)
	})

	test('un PIN incorrecto avisa, no autoriza y no cierra el modal', async () => {
		verifyAppLockPin.mockResolvedValue({ ok: false, reason: 'wrong', gate: { kind: 'open', freeLeft: 3 } })
		await render()
		await enter('0000')
		expect(texts()).toContain('PIN incorrecto')
		expect(onAuthorized).not.toHaveBeenCalled()
		expect(onClose).not.toHaveBeenCalled()
		expect(pinInput()[0].props.code).toBe('')
	})

	test('si no se pudo comprobar (Keychain), lo dice y tampoco autoriza', async () => {
		verifyAppLockPin.mockResolvedValue({ ok: false, reason: 'error', gate: { kind: 'open', freeLeft: 5 } })
		await render()
		await enter('1234')
		expect(texts()).toContain('Error verificando PIN')
		expect(onAuthorized).not.toHaveBeenCalled()
	})

	test('el primer PIN correcto arma la biometría de la wallet si el teléfono la tiene', async () => {
		getSupportedBiometryType.mockResolvedValue('FaceID')
		await render()
		await enter('1234')
		expect(enableWalletBiometrics).toHaveBeenCalled()
	})
})

describe('límite de intentos', () => {
	test('durante la espera no hay campo de PIN: solo la cuenta atrás', async () => {
		withAttempts(5)
		await render()
		expect(pinInput()).toHaveLength(0)
		expect(limit()).toBe('Demasiados intentos. Espera 0:30.')
		await act(async () => { jest.advanceTimersByTime(12_000) })
		expect(limit()).toBe('Demasiados intentos. Espera 0:18.')
		// Cumplida, vuelve el campo
		await act(async () => { jest.advanceTimersByTime(18_000) })
		expect(pinInput()).toHaveLength(1)
		expect(limit()).toBeUndefined()
	})

	test('cerrar y volver a abrir el modal no devuelve intentos', async () => {
		withAttempts(5)
		await render()
		act(() => { tree.update(<WalletAuthModal visible={false} subtitle="Enviar 1 USDT" onClose={onClose} onAuthorized={onAuthorized} />) })
		await act(async () => { tree.update(element()) })
		expect(pinInput()).toHaveLength(0)
		expect(limit()).toBe('Demasiados intentos. Espera 0:30.')
	})

	test('el fallo que cierra el límite quita el campo y enseña su aviso', async () => {
		withAttempts(4)
		verifyAppLockPin.mockImplementation(async () => {
			withAttempts(5)
			return { ok: false, reason: 'wrong', gate: { kind: 'wait', until: Date.now() + 30_000, remainingMs: 30_000 } }
		})
		await render()
		await enter('0000')
		act(() => { tree.update(element()) })
		expect(pinInput()).toHaveLength(0)
		expect(limit()).toBe('Demasiados intentos. Espera 0:30.')
		expect(texts()).not.toContain('PIN incorrecto')
		expect(onClose).not.toHaveBeenCalled()
	})

	test('al décimo fallo: prueba de dueño del dispositivo, y esperar no la quita', async () => {
		withAttempts(10)
		proveDeviceOwner.mockResolvedValue('cancelled')
		await render()
		expect(pinInput()).toHaveLength(0)
		expect(limit()).toBe('Demasiados intentos. Confirma que eres tú.')
		await act(async () => { jest.advanceTimersByTime(2 * 3600_000) })
		expect(pinInput()).toHaveLength(0)

		await act(async () => { proofButton()[0].props.onPress() })
		expect(proveDeviceOwner).toHaveBeenCalledTimes(1)
		// La prueba no autoriza nada: solo devuelve los intentos
		expect(onAuthorized).not.toHaveBeenCalled()
	})

	test('si el diálogo del sistema no puede salir, se dice', async () => {
		withAttempts(10)
		proveDeviceOwner.mockResolvedValue('error')
		await render()
		await act(async () => { proofButton()[0].props.onPress() })
		expect(limit()).toBe('No pudimos confirmar que este teléfono es tuyo. Inténtalo de nuevo.')
	})
})

describe('biometría de la wallet', () => {
	beforeEach(() => {
		getSupportedBiometryType.mockResolvedValue('FaceID')
		hasWalletBiometrics.mockResolvedValue(true)
	})

	test('si pasa, autoriza y devuelve los intentos del PIN (es el dueño)', async () => {
		withAttempts(7)
		authenticateWalletBiometrics.mockResolvedValue(true)
		await render()
		await act(async () => { jest.advanceTimersByTime(400) })
		expect(authenticateWalletBiometrics).toHaveBeenCalledTimes(1)
		expect(forgivePinAttempts).toHaveBeenCalledTimes(1)
		expect(onAuthorized).toHaveBeenCalledTimes(1)
	})

	test('cancelada no autoriza ni devuelve nada', async () => {
		withAttempts(7)
		authenticateWalletBiometrics.mockResolvedValue(false)
		await render()
		await act(async () => { jest.advanceTimersByTime(400) })
		expect(forgivePinAttempts).not.toHaveBeenCalled()
		expect(onAuthorized).not.toHaveBeenCalled()
		// Y con el límite cerrado sigue sin haber campo de PIN
		expect(pinInput()).toHaveLength(0)
	})
})

describe('sin PIN', () => {
	beforeEach(() => { appLockPinStatus.mockResolvedValue('none') })

	test('sin cuenta: se crea aquí mismo, avisando de la prueba de dueño', async () => {
		useAuth.mockReturnValue({ isAuthenticated: false })
		await render()
		const setup = tree.root.findAll(n => n.type === 'WalletPinSetup')
		expect(setup).toHaveLength(1)
		expect(setup[0].props.ownerProof).toBe(true)
		expect(pinInput()).toHaveLength(0)
	})

	// Viajó cifrado a otro teléfono, sin su clave: no lo acierta nadie. Cuenta como «sin PIN»
	// y se crea otro (con la wallet ya aquí, `enableAppLock` exige la prueba de dueño)
	test('un PIN que no se deja leer cuenta como «sin PIN»: no se pide teclearlo', async () => {
		appLockPinStatus.mockResolvedValue('unreadable')
		useAuth.mockReturnValue({ isAuthenticated: false })
		await render()
		expect(pinInput()).toHaveLength(0)
		expect(tree.root.findAll(n => n.type === 'WalletPinSetup')).toHaveLength(1)
	})

	test('con cuenta: se manda a Ajustes → Bloqueo', async () => {
		await render()
		expect(pinInput()).toHaveLength(0)
		const button = tree.root.findAll(n => n.type === 'QPButton')
		expect(button).toHaveLength(1)
		act(() => { button[0].props.onPress() })
		expect(onClose).toHaveBeenCalled()
		expect(navigate).toHaveBeenCalled()
	})
})
