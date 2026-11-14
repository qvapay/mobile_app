/**
 * Almacén de la seed. Lo que se fija aquí: «¿hay seed?» tiene tres respuestas (sí, no y «no
 * lo sé»), una seed NUNCA se pisa en silencio, y eliminarla solo cuenta si el Keychain lo
 * confirma después.
 * @jest-environment node
 */
jest.mock('react-native-keychain', () => ({
	getGenericPassword: jest.fn(),
	setGenericPassword: jest.fn(),
	resetGenericPassword: jest.fn(),
	hasGenericPassword: jest.fn(),
	ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly', AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AfterFirstUnlockThisDeviceOnly' },
}))
jest.mock('../helpers/biometricMarker', () => ({
	authenticateBiometricMarker: jest.fn(),
	disableBiometricMarker: jest.fn(),
	enableBiometricMarker: jest.fn(),
	hasBiometricMarker: jest.fn(),
}))

import * as Keychain from 'react-native-keychain'
import { getWalletCheck, getWalletMnemonic, removeWalletCheck, removeWalletMnemonic, setWalletCheck, setWalletMnemonic, walletSeedEntry } from './keystore'

const SEED = { service: 'com.qvapay.wallet' }
const CHECK = { service: 'com.qvapay.walletcheck' }
const PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

beforeEach(() => { jest.resetAllMocks() })

describe('walletSeedEntry', () => {
	test('tres respuestas: hay, no hay y no se sabe', async () => {
		Keychain.hasGenericPassword.mockResolvedValue(true)
		await expect(walletSeedEntry()).resolves.toBe('present')
		expect(Keychain.hasGenericPassword).toHaveBeenCalledWith(SEED)
		Keychain.hasGenericPassword.mockResolvedValue(false)
		await expect(walletSeedEntry()).resolves.toBe('absent')
		// Antes un Keychain que fallaba contaba como «no hay»
		Keychain.hasGenericPassword.mockRejectedValue(new Error('keystore'))
		await expect(walletSeedEntry()).resolves.toBe('unknown')
	})
})

describe('setWalletMnemonic', () => {
	test('sin seed previa: guarda y verifica leyendo de vuelta', async () => {
		Keychain.hasGenericPassword.mockResolvedValue(false)
		Keychain.setGenericPassword.mockResolvedValue({})
		Keychain.getGenericPassword.mockResolvedValue({ username: 'mnemonic', password: PHRASE })
		await expect(setWalletMnemonic(PHRASE)).resolves.toBe(true)
		expect(Keychain.setGenericPassword).toHaveBeenCalledWith('mnemonic', PHRASE, { service: 'com.qvapay.wallet', accessible: 'WhenUnlockedThisDeviceOnly' })
	})

	test('con una seed ya guardada NO escribe (pisarla es perder una wallet)', async () => {
		Keychain.hasGenericPassword.mockResolvedValue(true)
		await expect(setWalletMnemonic(PHRASE)).resolves.toBe(false)
		expect(Keychain.setGenericPassword).not.toHaveBeenCalled()
	})

	test('si no puede saber si hay una, tampoco escribe', async () => {
		Keychain.hasGenericPassword.mockRejectedValue(new Error('keystore'))
		await expect(setWalletMnemonic(PHRASE)).resolves.toBe(false)
		expect(Keychain.setGenericPassword).not.toHaveBeenCalled()
	})

	test('overwrite (solo «Restaurar») escribe encima sin preguntar', async () => {
		Keychain.hasGenericPassword.mockResolvedValue(true)
		Keychain.setGenericPassword.mockResolvedValue({})
		Keychain.getGenericPassword.mockResolvedValue({ username: 'mnemonic', password: PHRASE })
		await expect(setWalletMnemonic(PHRASE, { overwrite: true })).resolves.toBe(true)
		expect(Keychain.hasGenericPassword).not.toHaveBeenCalled()
		expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(1)
	})

	test('una escritura que no se puede leer de vuelta no cuenta como guardada', async () => {
		Keychain.hasGenericPassword.mockResolvedValue(false)
		Keychain.setGenericPassword.mockResolvedValue({})
		Keychain.getGenericPassword.mockResolvedValue({ username: 'mnemonic', password: 'otra cosa' })
		await expect(setWalletMnemonic(PHRASE)).resolves.toBe(false)
		Keychain.getGenericPassword.mockResolvedValue(false)
		await expect(setWalletMnemonic(PHRASE)).resolves.toBe(false)
		Keychain.setGenericPassword.mockRejectedValue(new Error('disk'))
		await expect(setWalletMnemonic(PHRASE)).resolves.toBe(false)
	})
})

describe('getWalletMnemonic', () => {
	test('la frase, o null si no hay o no se deja leer (sin borrar nada)', async () => {
		Keychain.getGenericPassword.mockResolvedValue({ username: 'mnemonic', password: PHRASE })
		await expect(getWalletMnemonic()).resolves.toBe(PHRASE)
		Keychain.getGenericPassword.mockResolvedValue(false)
		await expect(getWalletMnemonic()).resolves.toBeNull()
		Keychain.getGenericPassword.mockRejectedValue(new Error('decrypt'))
		await expect(getWalletMnemonic()).resolves.toBeNull()
		expect(Keychain.resetGenericPassword).not.toHaveBeenCalled()
	})
})

describe('removeWalletMnemonic', () => {
	test('solo cuenta si después el Keychain confirma que ya no hay seed', async () => {
		Keychain.resetGenericPassword.mockResolvedValue(true)
		Keychain.hasGenericPassword.mockResolvedValue(false)
		await expect(removeWalletMnemonic()).resolves.toBe(true)
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith(SEED)
	})

	test('el borrado «fue bien» pero la seed sigue ahí: NO está eliminada', async () => {
		Keychain.resetGenericPassword.mockResolvedValue(true)
		Keychain.hasGenericPassword.mockResolvedValue(true)
		await expect(removeWalletMnemonic()).resolves.toBe(false)
	})

	test('el borrado lanza: decide igualmente lo que diga el Keychain después', async () => {
		Keychain.resetGenericPassword.mockRejectedValue(new Error('keystore'))
		Keychain.hasGenericPassword.mockResolvedValue(true)
		await expect(removeWalletMnemonic()).resolves.toBe(false)
		Keychain.hasGenericPassword.mockResolvedValue(false)
		await expect(removeWalletMnemonic()).resolves.toBe(true)
		// Y si ni eso se puede saber, no se da por eliminada
		Keychain.hasGenericPassword.mockRejectedValue(new Error('keystore'))
		await expect(removeWalletMnemonic()).resolves.toBe(false)
	})
})

describe('testigo', () => {
	test('guarda la dirección (pública) en minúsculas, en su propia entrada', async () => {
		Keychain.setGenericPassword.mockResolvedValue({})
		await expect(setWalletCheck('0xAbCdEf')).resolves.toBe(true)
		expect(Keychain.setGenericPassword).toHaveBeenCalledWith('check', '0xabcdef', { service: 'com.qvapay.walletcheck', accessible: 'WhenUnlockedThisDeviceOnly' })
	})

	test('ausente o ilegible se lee igual: null (en ambos casos toca comprobar la seed)', async () => {
		Keychain.getGenericPassword.mockResolvedValue({ username: 'check', password: '0xabcdef' })
		await expect(getWalletCheck()).resolves.toBe('0xabcdef')
		expect(Keychain.getGenericPassword).toHaveBeenCalledWith(CHECK)
		Keychain.getGenericPassword.mockResolvedValue(false)
		await expect(getWalletCheck()).resolves.toBeNull()
		Keychain.getGenericPassword.mockRejectedValue(new Error('decrypt'))
		await expect(getWalletCheck()).resolves.toBeNull()
	})

	test('se retira con la wallet', async () => {
		Keychain.resetGenericPassword.mockResolvedValue(true)
		await removeWalletCheck()
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith(CHECK)
	})
})
