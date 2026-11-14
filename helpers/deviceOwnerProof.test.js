/**
 * helpers/deviceOwnerProof — «¿quien tiene el teléfono es su dueño?»: huella/cara o el
 * código del teléfono. Es lo único que se interpone entre una wallet sin PIN y quien
 * quiera ponerle el suyo, así que lo que importa aquí es que NADA que no sea una
 * autenticación de verdad (o un teléfono sin bloqueo) cuente como prueba.
 * @jest-environment node
 */
const mockPlatform = { OS: 'android' }
const mockGate = { confirmDeviceOwner: jest.fn() }
let mockGatePresent = true
jest.mock('react-native', () => ({
	Platform: mockPlatform,
	NativeModules: {},
	TurboModuleRegistry: { get: (name) => (name === 'BiometricGate' && mockPlatform.OS === 'android' && mockGatePresent ? mockGate : null) },
}))
jest.mock('react-native-keychain', () => ({
	ACCESS_CONTROL: { USER_PRESENCE: 'UserPresence', BIOMETRY_CURRENT_SET: 'BiometryCurrentSet' },
	ACCESSIBLE: { WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'AccessibleWhenPasscodeSetThisDeviceOnly', WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' },
	AUTHENTICATION_TYPE: { DEVICE_PASSCODE_OR_BIOMETRICS: 'AuthenticationWithBiometricsDevicePasscode' },
	canImplyAuthentication: jest.fn(),
	hasGenericPassword: jest.fn(),
	setGenericPassword: jest.fn(),
	getGenericPassword: jest.fn(),
	resetGenericPassword: jest.fn(),
}))

const Keychain = require('react-native-keychain')
const { confirmDeviceOwner, ownerProofPasses } = require('./deviceOwnerProof')

beforeEach(() => {
	jest.clearAllMocks()
	mockPlatform.OS = 'android'
	mockGatePresent = true
})

describe('qué cuenta como prueba', () => {
	test('solo una autenticación de verdad o un teléfono sin bloqueo', () => {
		expect(ownerProofPasses('success')).toBe(true)
		// Sin bloqueo de pantalla no hay prueba posible; quitarlo para caer aquí exige el código
		expect(ownerProofPasses('unavailable')).toBe(true)
		expect(ownerProofPasses('cancelled')).toBe(false)
		expect(ownerProofPasses('error')).toBe(false)
	})
})

describe('Android: BiometricGate.confirmDeviceOwner', () => {
	test.each(['success', 'cancelled', 'unavailable'])('%s se devuelve tal cual', async (outcome) => {
		mockGate.confirmDeviceOwner.mockResolvedValue(outcome)
		await expect(confirmDeviceOwner('Confirma que eres tú', 'Vas a crear el PIN')).resolves.toBe(outcome)
		expect(mockGate.confirmDeviceOwner).toHaveBeenCalledWith('Confirma que eres tú', 'Vas a crear el PIN')
		// En Android el Keychain no pinta nada aquí
		expect(Keychain.getGenericPassword).not.toHaveBeenCalled()
	})

	test.each(['busy', 'error', 'lockout', '', undefined, true])('%p no prueba nada → error', async (outcome) => {
		mockGate.confirmDeviceOwner.mockResolvedValue(outcome)
		await expect(confirmDeviceOwner('x')).resolves.toBe('error')
	})

	test('un fallo del puente, un módulo viejo sin el método o sin módulo → error (nunca pasa)', async () => {
		mockGate.confirmDeviceOwner.mockRejectedValue(new Error('boom'))
		await expect(confirmDeviceOwner('x')).resolves.toBe('error')

		const original = mockGate.confirmDeviceOwner
		delete mockGate.confirmDeviceOwner
		await expect(confirmDeviceOwner('x')).resolves.toBe('error')
		mockGate.confirmDeviceOwner = original

		mockGatePresent = false
		await expect(confirmDeviceOwner('x')).resolves.toBe('error')
		expect(ownerProofPasses(await confirmDeviceOwner('x'))).toBe(false)
	})
})

describe('iOS: entrada efímera del Keychain con USER_PRESENCE', () => {
	beforeEach(() => {
		mockPlatform.OS = 'ios'
		Keychain.canImplyAuthentication.mockResolvedValue(true)
		Keychain.setGenericPassword.mockResolvedValue({ service: 'com.qvapay.ownerproof' })
		Keychain.resetGenericPassword.mockResolvedValue(true)
	})

	const lastNonce = () => Keychain.setGenericPassword.mock.calls[0][1]

	test('éxito: crea la entrada con biometría-o-código, la lee con el diálogo y la borra', async () => {
		Keychain.getGenericPassword.mockImplementation(async () => ({ username: 'owner', password: lastNonce() }))
		await expect(confirmDeviceOwner('Confirma que eres tú')).resolves.toBe('success')

		expect(Keychain.canImplyAuthentication).toHaveBeenCalledWith({ authenticationType: 'AuthenticationWithBiometricsDevicePasscode' })
		const [, nonce, options] = Keychain.setGenericPassword.mock.calls[0]
		expect(nonce).toMatch(/^[0-9a-f]{32}$/)
		expect(options).toEqual({ service: 'com.qvapay.ownerproof', accessControl: 'UserPresence', accessible: 'AccessibleWhenPasscodeSetThisDeviceOnly' })
		expect(Keychain.getGenericPassword).toHaveBeenCalledWith({ service: 'com.qvapay.ownerproof', authenticationPrompt: { title: 'Confirma que eres tú' } })
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: 'com.qvapay.ownerproof' })
		// El módulo de Android no existe aquí
		expect(mockGate.confirmDeviceOwner).not.toHaveBeenCalled()
	})

	test('iPhone sin código → unavailable, sin tocar el Keychain', async () => {
		Keychain.canImplyAuthentication.mockResolvedValue(false)
		await expect(confirmDeviceOwner('x')).resolves.toBe('unavailable')
		expect(Keychain.setGenericPassword).not.toHaveBeenCalled()
	})

	test('el usuario cierra el diálogo → cancelled, y la entrada se borra igual', async () => {
		Keychain.getGenericPassword.mockRejectedValue(new Error('User canceled the operation.'))
		await expect(confirmDeviceOwner('x')).resolves.toBe('cancelled')
		expect(Keychain.resetGenericPassword).toHaveBeenCalled()
	})

	test('leer OTRA cosa, no leer nada o cualquier fallo → error (no es una prueba)', async () => {
		Keychain.getGenericPassword.mockResolvedValue({ username: 'owner', password: 'otro-valor' })
		await expect(confirmDeviceOwner('x')).resolves.toBe('error')

		Keychain.getGenericPassword.mockResolvedValue(false)
		await expect(confirmDeviceOwner('x')).resolves.toBe('error')

		Keychain.getGenericPassword.mockRejectedValue(new Error('The user name or passphrase you entered is not correct.'))
		await expect(confirmDeviceOwner('x')).resolves.toBe('error')

		Keychain.setGenericPassword.mockRejectedValue(new Error('errSecNotAvailable'))
		await expect(confirmDeviceOwner('x')).resolves.toBe('error')

		// Si ni siquiera se puede preguntar si hay código, no se da por «sin bloqueo»
		Keychain.canImplyAuthentication.mockRejectedValue(new Error('boom'))
		await expect(confirmDeviceOwner('x')).resolves.toBe('error')
	})
})
