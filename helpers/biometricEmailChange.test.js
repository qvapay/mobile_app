/**
 * La marca que permite volver a ofrecer la biometría tras cambiar de correo.
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import { biometricsOutdatedFor, forgetEmailBeforeChange, rememberEmailBeforeChange } from './biometricEmailChange'

beforeEach(() => { jest.clearAllMocks() })

describe('biometricsOutdatedFor', () => {

	test('without a change noted there is nothing to redo', async () => {
		AsyncStorage.getItem.mockResolvedValue(null)
		expect(await biometricsOutdatedFor('nuevo@ejemplo.com')).toBe(false)
	})

	test('logging in with the old email while the change waits keeps the credential', async () => {
		AsyncStorage.getItem.mockResolvedValue('viejo@ejemplo.com')
		expect(await biometricsOutdatedFor(' Viejo@Ejemplo.com ')).toBe(false)
		expect(AsyncStorage.removeItem).not.toHaveBeenCalled()
	})

	test('logging in with another email offers it again, only once', async () => {
		AsyncStorage.getItem.mockResolvedValue('viejo@ejemplo.com')
		expect(await biometricsOutdatedFor('nuevo@ejemplo.com')).toBe(true)
		expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1)
	})

	test('a storage failure never blocks the login', async () => {
		AsyncStorage.getItem.mockRejectedValue(new Error('boom'))
		expect(await biometricsOutdatedFor('nuevo@ejemplo.com')).toBe(false)
	})
})

describe('the note', () => {

	test('saves and clears the same key', async () => {
		await rememberEmailBeforeChange('viejo@ejemplo.com')
		await forgetEmailBeforeChange()
		expect(AsyncStorage.setItem.mock.calls[0][0]).toBe(AsyncStorage.removeItem.mock.calls[0][0])
	})

	test('a storage failure stays silent', async () => {
		AsyncStorage.setItem.mockRejectedValue(new Error('boom'))
		AsyncStorage.removeItem.mockRejectedValue(new Error('boom'))
		await expect(rememberEmailBeforeChange('a@b.co')).resolves.toBeUndefined()
		await expect(forgetEmailBeforeChange()).resolves.toBeUndefined()
	})
})
