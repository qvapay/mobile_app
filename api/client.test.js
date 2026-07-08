/**
 * Unit tests for the shared axios client: interceptors (token attach, global
 * loading bar, error normalization) and the Keychain helpers. Node environment
 * with axios/device-info/keychain mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('axios', () => {
	const instance = {
		interceptors: {
			request: { use: jest.fn() },
			response: { use: jest.fn() },
		},
		get: jest.fn(),
		post: jest.fn(),
	}
	return { create: jest.fn(() => instance) }
})
jest.mock('react-native-device-info', () => ({
	getVersion: () => '1.8.5',
	getBuildNumber: () => '1805',
	getDeviceNameSync: () => 'TestPhone',
}))
jest.mock('react-native-keychain', () => ({
	getGenericPassword: jest.fn(),
	setGenericPassword: jest.fn(),
	resetGenericPassword: jest.fn(),
	hasGenericPassword: jest.fn(),
	getSupportedBiometryType: jest.fn(),
	ACCESS_CONTROL: { BIOMETRY_ANY_OR_DEVICE_PASSCODE: 'BiometryAnyOrDevicePasscode' },
	ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly' },
}))
jest.mock('../config', () => ({ API_BASE_URL: 'https://api.test/api', API_TIMEOUT: 20000 }))

import axios from 'axios'
import * as Keychain from 'react-native-keychain'
import {
	registerLoadingCallbacks,
	unregisterLoadingCallbacks,
	setAuthToken,
	getAuthToken,
	removeAuthToken,
	getSupportedBiometryType,
	setBiometricCredentials,
	getBiometricCredentials,
	removeBiometricCredentials,
	hasBiometricCredentials,
	setAppLockPin,
	getAppLockPin,
	hasAppLockPin,
	removeAppLockPin,
} from './client'

// Capture what was registered at module load BEFORE beforeEach clears the mocks
const instance = axios.create.mock.results[0].value
const createConfig = axios.create.mock.calls[0][0]
const [onRequest, onRequestError] = instance.interceptors.request.use.mock.calls[0]
const [onResponse, onResponseError] = instance.interceptors.response.use.mock.calls[0]

const AUTH_SERVICE = { service: 'com.qvapay.auth' }
const BIOMETRIC_SERVICE = { service: 'com.qvapay.biometrics' }
const APP_LOCK_SERVICE = { service: 'com.qvapay.applock' }

beforeEach(() => {
	jest.clearAllMocks()
	unregisterLoadingCallbacks()
})

describe('axios instance creation', () => {
	test('uses the config base URL, 20s timeout and QvaPay client headers', () => {
		const cfg = createConfig
		expect(cfg.baseURL).toBe('https://api.test/api')
		expect(cfg.timeout).toBe(20000)
		expect(cfg.headers).toMatchObject({
			'X-QvaPay-Client': 'QvaPayAPP',
			'User-Agent': 'QvaPayClient',
			'X-QvaPay-Client-Version': '1.8.5',
			'X-QvaPay-Client-Platform': 'TestPhone',
			'X-QvaPay-Client-Platform-Version': '1805',
		})
	})
})

describe('request interceptor', () => {
	test('attaches the Keychain bearer token when one exists', async () => {
		Keychain.getGenericPassword.mockResolvedValue({ username: 'token', password: 'tok123' })
		const cfg = await onRequest({ headers: {} })
		expect(Keychain.getGenericPassword).toHaveBeenCalledWith(AUTH_SERVICE)
		expect(cfg.headers.Authorization).toBe('Bearer tok123')
	})

	test('goes out unauthenticated when there is no stored token', async () => {
		Keychain.getGenericPassword.mockResolvedValue(false)
		const cfg = await onRequest({ headers: {} })
		expect(cfg.headers.Authorization).toBeUndefined()
	})

	test('a Keychain read failure does not block the request', async () => {
		Keychain.getGenericPassword.mockRejectedValue(new Error('locked'))
		const cfg = await onRequest({ headers: {} })
		expect(cfg.headers.Authorization).toBeUndefined()
	})

	test('starts the global loading bar unless the request is silent', async () => {
		Keychain.getGenericPassword.mockResolvedValue(false)
		const start = jest.fn(), stop = jest.fn()
		registerLoadingCallbacks(start, stop)
		await onRequest({ headers: {} })
		expect(start).toHaveBeenCalledTimes(1)
		await onRequest({ headers: {}, silent: true })
		expect(start).toHaveBeenCalledTimes(1) // unchanged
	})

	test('a request setup error stops the loading bar and rejects', async () => {
		const start = jest.fn(), stop = jest.fn()
		registerLoadingCallbacks(start, stop)
		const err = new Error('bad config')
		err.config = {}
		await expect(onRequestError(err)).rejects.toBe(err)
		expect(stop).toHaveBeenCalledTimes(1)
	})
})

describe('response interceptor', () => {
	test('stops the loading bar and passes the response through', () => {
		const start = jest.fn(), stop = jest.fn()
		registerLoadingCallbacks(start, stop)
		const response = { config: {}, data: { ok: true } }
		expect(onResponse(response)).toBe(response)
		expect(stop).toHaveBeenCalledTimes(1)
	})

	test('silent responses do not touch the loading bar', () => {
		const start = jest.fn(), stop = jest.fn()
		registerLoadingCallbacks(start, stop)
		onResponse({ config: { silent: true } })
		expect(stop).not.toHaveBeenCalled()
	})

	test('401 clears the Keychain token and rejects with the original error', async () => {
		Keychain.resetGenericPassword.mockResolvedValue()
		const err = { config: {}, response: { status: 401 } }
		await expect(onResponseError(err)).rejects.toBe(err)
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith(AUTH_SERVICE)
	})

	test('403 and 422 pass through WITHOUT touching the token (screen handles them)', async () => {
		for (const status of [403, 422]) {
			const err = { config: {}, response: { status } }
			await expect(onResponseError(err)).rejects.toBe(err)
		}
		expect(Keychain.resetGenericPassword).not.toHaveBeenCalled()
	})

	test('500 rejects with the generic Spanish support message (plain object, no .response)', async () => {
		const err = { config: {}, response: { status: 500 } }
		await expect(onResponseError(err)).rejects.toEqual({ message: 'Ha ocurrido un error, contacte a soporte' })
	})

	test('network errors (no response) reject with the Spanish connectivity message', async () => {
		const err = { config: {}, request: {} }
		await expect(onResponseError(err)).rejects.toEqual({ message: 'No se ha podido conectar con el servidor' })
	})

	test('errors with neither response nor request reject with the unexpected-error message', async () => {
		await expect(onResponseError({ config: {} })).rejects.toEqual({ message: 'Ha ocurrido un error inesperado' })
	})

	test('stops the loading bar on errors too', async () => {
		const start = jest.fn(), stop = jest.fn()
		registerLoadingCallbacks(start, stop)
		await onResponseError({ config: {}, response: { status: 422 } }).catch(() => {})
		expect(stop).toHaveBeenCalledTimes(1)
	})
})

describe('auth token helpers', () => {
	test('setAuthToken stores the token under com.qvapay.auth and fails silently', async () => {
		Keychain.setGenericPassword.mockResolvedValue()
		await setAuthToken('tok123')
		expect(Keychain.setGenericPassword).toHaveBeenCalledWith('token', 'tok123', AUTH_SERVICE)
		Keychain.setGenericPassword.mockRejectedValue(new Error('full'))
		await expect(setAuthToken('tok456')).resolves.toBeUndefined()
	})

	test('getAuthToken returns the stored token, null when logged out or on failure', async () => {
		Keychain.getGenericPassword.mockResolvedValue({ username: 'token', password: 'tok123' })
		await expect(getAuthToken()).resolves.toBe('tok123')
		Keychain.getGenericPassword.mockResolvedValue(false)
		await expect(getAuthToken()).resolves.toBeNull()
		Keychain.getGenericPassword.mockRejectedValue(new Error('locked'))
		await expect(getAuthToken()).resolves.toBeNull()
	})

	test('removeAuthToken resets the auth service entry', async () => {
		Keychain.resetGenericPassword.mockResolvedValue()
		await removeAuthToken()
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith(AUTH_SERVICE)
	})
})

describe('biometric credential helpers', () => {
	test('getSupportedBiometryType passes through and nulls on error', async () => {
		Keychain.getSupportedBiometryType.mockResolvedValue('FaceID')
		await expect(getSupportedBiometryType()).resolves.toBe('FaceID')
		Keychain.getSupportedBiometryType.mockRejectedValue(new Error('x'))
		await expect(getSupportedBiometryType()).resolves.toBeNull()
	})

	test('setBiometricCredentials stores device-only creds behind biometrics', async () => {
		Keychain.setGenericPassword.mockResolvedValue()
		await expect(setBiometricCredentials('a@b.co', 'pw')).resolves.toBe(true)
		expect(Keychain.setGenericPassword).toHaveBeenCalledWith('a@b.co', 'pw', {
			service: 'com.qvapay.biometrics',
			accessControl: 'BiometryAnyOrDevicePasscode',
			accessible: 'WhenUnlockedThisDeviceOnly',
		})
		Keychain.setGenericPassword.mockRejectedValue(new Error('x'))
		await expect(setBiometricCredentials('a@b.co', 'pw')).resolves.toBe(false)
	})

	test('getBiometricCredentials returns creds after a successful prompt', async () => {
		Keychain.getSupportedBiometryType.mockResolvedValue('FaceID')
		Keychain.getGenericPassword.mockResolvedValue({ username: 'a@b.co', password: 'pw' })
		await expect(getBiometricCredentials()).resolves.toEqual({ email: 'a@b.co', password: 'pw' })
		expect(Keychain.getGenericPassword).toHaveBeenCalledWith(expect.objectContaining(BIOMETRIC_SERVICE))
	})

	test('getBiometricCredentials returns null without prompting when biometry is unavailable', async () => {
		Keychain.getSupportedBiometryType.mockResolvedValue(null)
		await expect(getBiometricCredentials()).resolves.toBeNull()
		expect(Keychain.getGenericPassword).not.toHaveBeenCalled()
	})

	test('getBiometricCredentials wipes the corrupted entry when the read fails', async () => {
		Keychain.getSupportedBiometryType.mockResolvedValue('FaceID')
		Keychain.getGenericPassword.mockRejectedValue(new Error('access control mismatch'))
		Keychain.resetGenericPassword.mockResolvedValue()
		await expect(getBiometricCredentials()).resolves.toBeNull()
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith(BIOMETRIC_SERVICE)
	})

	test('removeBiometricCredentials and hasBiometricCredentials', async () => {
		Keychain.resetGenericPassword.mockResolvedValue()
		await expect(removeBiometricCredentials()).resolves.toBe(true)
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith(BIOMETRIC_SERVICE)
		Keychain.hasGenericPassword.mockResolvedValue(true)
		await expect(hasBiometricCredentials()).resolves.toBe(true)
		Keychain.hasGenericPassword.mockRejectedValue(new Error('x'))
		await expect(hasBiometricCredentials()).resolves.toBe(false)
	})
})

describe('app-lock PIN helpers', () => {
	test('setAppLockPin stores a device-only entry under com.qvapay.applock', async () => {
		Keychain.setGenericPassword.mockResolvedValue()
		await expect(setAppLockPin('1234')).resolves.toBe(true)
		expect(Keychain.setGenericPassword).toHaveBeenCalledWith('applock', '1234', {
			service: 'com.qvapay.applock',
			accessible: 'WhenUnlockedThisDeviceOnly',
		})
	})

	test('getAppLockPin returns the PIN or null when not set up', async () => {
		Keychain.getGenericPassword.mockResolvedValue({ username: 'applock', password: '1234' })
		await expect(getAppLockPin()).resolves.toBe('1234')
		expect(Keychain.getGenericPassword).toHaveBeenCalledWith(APP_LOCK_SERVICE)
		Keychain.getGenericPassword.mockResolvedValue(false)
		await expect(getAppLockPin()).resolves.toBeNull()
	})

	test('hasAppLockPin and removeAppLockPin', async () => {
		Keychain.hasGenericPassword.mockResolvedValue(false)
		await expect(hasAppLockPin()).resolves.toBe(false)
		Keychain.resetGenericPassword.mockResolvedValue()
		await expect(removeAppLockPin()).resolves.toBe(true)
		expect(Keychain.resetGenericPassword).toHaveBeenCalledWith(APP_LOCK_SERVICE)
		Keychain.resetGenericPassword.mockRejectedValue(new Error('x'))
		await expect(removeAppLockPin()).resolves.toBe(false)
	})
})
