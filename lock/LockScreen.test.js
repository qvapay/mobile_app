/**
 * LockScreen — el PIN se teclea en el teclado de la app (QPKeypad), la
 * biometría es su tecla de abajo a la izquierda y, con cuenta, el héroe es el
 * avatar con un saludo. Entorno node con los colaboradores mockeados (ver
 * screens/keypad/Keypad.test.js).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('./AppLockContext', () => ({ useAppLock: jest.fn() }))
jest.mock('./useLockBiometrics', () => ({ useLockBiometrics: jest.fn(), getBiometryLabelKey: () => 'misc.lock.unlock.faceId' }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('react-native-edge-to-edge', () => ({ SystemBars: () => null }))
jest.mock('../ui/particles/QPAvatar', () => 'QPAvatar')
jest.mock('../ui/particles/FaceIDIcon', () => 'FaceIDIcon')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('react-native-haptic-feedback', () => ({ __esModule: true, default: { trigger: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import { useAuth } from '../auth/AuthContext'
import { useAppLock } from './AppLockContext'
import { useLockBiometrics } from './useLockBiometrics'
import LockScreen from './LockScreen'

const unlockWithPin = jest.fn()
const biometricUnlock = jest.fn()

const render = () => {
	let tree
	act(() => { tree = create(<LockScreen />) })
	return tree
}

const key = (tree, id) => tree.root.find(n => n.props.testID === `lock-key-${id}` && typeof n.props.onPress === 'function')
const tap = (tree, id) => act(async () => { key(tree, id).props.onPress() })
const texts = (tree) => tree.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children)
const dots = (tree) => tree.root.find(n => n.props.testID === 'lock-pin' && n.props.accessibilityLabel).props.accessibilityLabel

beforeEach(() => {
	jest.clearAllMocks()
	useAuth.mockReturnValue({ user: { uuid: 'u1', name: 'Erich', username: 'erich' } })
	useAppLock.mockReturnValue({ isLocked: true, unlockWithPin })
	useLockBiometrics.mockReturnValue({ biometryType: 'FaceID', available: true, unlock: biometricUnlock })
	unlockWithPin.mockResolvedValue({ success: true })
})

describe('teclado', () => {
	test('el cuarto dígito verifica el PIN', async () => {
		const tree = render()
		for (const d of ['1', '2', '3', '4']) await tap(tree, d)
		expect(unlockWithPin).toHaveBeenCalledWith('1234')
		expect(ReactNativeHapticFeedback.trigger).toHaveBeenCalledTimes(4)
	})

	// Dos toques antes de que React vuelva a pintar no se pisan: el PIN vive en un ref
	test('toques seguidos sin repintar entre medias no pierden dígitos', async () => {
		const tree = render()
		const one = key(tree, '1').props.onPress
		const two = key(tree, '2').props.onPress
		await act(async () => { one(); two() })
		expect(dots(tree)).toBe('PIN: 2 de 4 dígitos')
	})

	test('borrar quita el último dígito', async () => {
		const tree = render()
		await tap(tree, '5')
		await tap(tree, '6')
		await tap(tree, 'backspace')
		expect(dots(tree)).toBe('PIN: 1 de 4 dígitos')
	})

	test('un PIN incorrecto avisa y vacía los puntos', async () => {
		unlockWithPin.mockResolvedValue({ success: false })
		const tree = render()
		for (const d of ['9', '9', '9', '9']) await tap(tree, d)
		expect(texts(tree)).toContain('PIN incorrecto')
		expect(dots(tree)).toBe('PIN: 0 de 4 dígitos')
		// Teclear de nuevo quita el aviso
		await tap(tree, '1')
		expect(texts(tree)).not.toContain('PIN incorrecto')
	})

	test('mientras verifica, el teclado no escribe', async () => {
		let resolve
		unlockWithPin.mockImplementation(() => new Promise(r => { resolve = r }))
		const tree = render()
		for (const d of ['1', '2', '3', '4']) await tap(tree, d)
		await tap(tree, '5')
		expect(unlockWithPin).toHaveBeenCalledTimes(1)
		await act(async () => { resolve({ success: true }) })
	})
})

describe('biometría', () => {
	test('es la tecla de abajo a la izquierda', async () => {
		const tree = render()
		expect(key(tree, 'extra').props.accessibilityLabel).toBe('Desbloquear con Face ID')
		await tap(tree, 'extra')
		expect(biometricUnlock).toHaveBeenCalled()
	})

	test('sin biometría ese hueco queda vacío', () => {
		useLockBiometrics.mockReturnValue({ biometryType: null, available: false, unlock: biometricUnlock })
		const tree = render()
		expect(tree.root.findAll(n => n.props.testID === 'lock-key-extra')).toHaveLength(0)
	})
})

describe('héroe', () => {
	test('con cuenta: avatar y saludo', () => {
		const tree = render()
		expect(tree.root.findAllByType('QPAvatar')).toHaveLength(1)
		expect(texts(tree)).toContain('Hola, Erich')
	})

	test('sin cuenta (modo wallet): el glifo del bloqueo y la invitación a teclear', () => {
		useAuth.mockReturnValue({ user: null })
		const tree = render()
		expect(tree.root.findAllByType('QPAvatar')).toHaveLength(0)
		expect(texts(tree)).toContain('Ingresa tu PIN de seguridad')
	})

	test('desbloqueada no pinta nada', () => {
		useAppLock.mockReturnValue({ isLocked: false, unlockWithPin })
		expect(render().toJSON()).toBeNull()
	})
})
