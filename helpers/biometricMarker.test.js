/**
 * helpers/biometricMarker — en Android la huella la pide el módulo nativo
 * BiometricGate (un diálogo nuestro en cada uso). El marcador de
 * react-native-keychain se leía sin diálogo en los 5 s siguientes a desbloquear
 * el teléfono, así que ahí NUNCA autentica. En iOS sigue siendo el Keychain.
 * @jest-environment node
 */
const mockPlatform = { OS: 'android' }
const mockGate = {
	isAvailable: jest.fn(),
	hasKey: jest.fn(),
	createKey: jest.fn(),
	deleteKey: jest.fn(),
	authenticate: jest.fn(),
}
jest.mock('react-native', () => ({
	Platform: mockPlatform,
	NativeModules: {},
	TurboModuleRegistry: { get: (name) => (name === 'BiometricGate' && mockPlatform.OS === 'android' ? mockGate : null) },
}))
jest.mock('react-native-keychain', () => ({
	ACCESS_CONTROL: { BIOMETRY_CURRENT_SET: 'BiometryCurrentSet' },
	ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' },
	hasGenericPassword: jest.fn(),
	setGenericPassword: jest.fn(),
	getGenericPassword: jest.fn(),
	resetGenericPassword: jest.fn(),
}))

const Keychain = require('react-native-keychain')
const { authenticateBiometricMarker, disableBiometricMarker, enableBiometricMarker, gateAliasFor, hasBiometricMarker } = require('./biometricMarker')

const SERVICE = 'com.qvapay.applock.bio'
const ALIAS = gateAliasFor(SERVICE)

beforeEach(() => {
	jest.clearAllMocks()
	mockPlatform.OS = 'android'
})

describe('Android: BiometricGate', () => {
	test('autentica solo con un success del diálogo nativo', async () => {
		mockGate.authenticate.mockResolvedValue('success')
		await expect(authenticateBiometricMarker(SERVICE, 'Desbloquea QvaPay')).resolves.toBe(true)
		expect(mockGate.authenticate).toHaveBeenCalledWith(ALIAS, 'Desbloquea QvaPay', 'Cancelar')
		// El marcador viejo del Keychain no se lee jamás (se leía sin diálogo)
		expect(Keychain.getGenericPassword).not.toHaveBeenCalled()
	})

	test.each(['cancelled', 'lockout', 'invalidated', 'missing', 'unavailable', 'busy', 'error'])('%s → false (al PIN)', async (outcome) => {
		mockGate.authenticate.mockResolvedValue(outcome)
		await expect(authenticateBiometricMarker(SERVICE, 'x')).resolves.toBe(false)
	})

	test('un fallo del puente → false', async () => {
		mockGate.authenticate.mockRejectedValue(new Error('boom'))
		await expect(authenticateBiometricMarker(SERVICE, 'x')).resolves.toBe(false)
	})

	test('el marcador es la clave nativa, no la entrada del Keychain', async () => {
		mockGate.hasKey.mockResolvedValue(false)
		Keychain.hasGenericPassword.mockResolvedValue(true)
		await expect(hasBiometricMarker(SERVICE)).resolves.toBe(false)
		expect(mockGate.hasKey).toHaveBeenCalledWith(ALIAS)
	})

	test('armar crea la clave y borra el marcador viejo del Keychain', async () => {
		mockGate.isAvailable.mockResolvedValue(true)
		mockGate.createKey.mockResolvedValue(true)
		await expect(enableBiometricMarker(SERVICE)).resolves.toBe(true)
		expect(mockGate.createKey).toHaveBeenCalledWith(ALIAS)
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: SERVICE })
		expect(Keychain.setGenericPassword).not.toHaveBeenCalled()
	})

	test('sin biometría fuerte registrada no se arma', async () => {
		mockGate.isAvailable.mockResolvedValue(false)
		await expect(enableBiometricMarker(SERVICE)).resolves.toBe(false)
		expect(mockGate.createKey).not.toHaveBeenCalled()
	})

	test('desarmar borra la clave y el marcador viejo', async () => {
		await disableBiometricMarker(SERVICE)
		expect(mockGate.deleteKey).toHaveBeenCalledWith(ALIAS)
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: SERVICE })
	})
})

describe('iOS: Keychain', () => {
	beforeEach(() => { mockPlatform.OS = 'ios' })

	test('autentica leyendo el marcador con prompt', async () => {
		Keychain.getGenericPassword.mockResolvedValue({ username: 'marker', password: 'abc' })
		await expect(authenticateBiometricMarker(SERVICE, 'Desbloquea QvaPay')).resolves.toBe(true)
		expect(Keychain.getGenericPassword).toHaveBeenCalledWith({ service: SERVICE, authenticationPrompt: { title: 'Desbloquea QvaPay' } })
		expect(mockGate.authenticate).not.toHaveBeenCalled()
	})

	test('armar guarda el marcador solo con biometría (sin código del dispositivo)', async () => {
		Keychain.setGenericPassword.mockResolvedValue(true)
		await expect(enableBiometricMarker(SERVICE)).resolves.toBe(true)
		expect(Keychain.setGenericPassword).toHaveBeenCalledWith('marker', expect.any(String), expect.objectContaining({ service: SERVICE, accessControl: 'BiometryCurrentSet' }))
	})

	test('un marcador invalidado se borra', async () => {
		Keychain.getGenericPassword.mockRejectedValue(new Error('-25293'))
		await expect(authenticateBiometricMarker(SERVICE, 'x')).resolves.toBe(false)
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: SERVICE })
	})
})
