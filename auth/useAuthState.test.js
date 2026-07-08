/**
 * Unit tests for the auth state hook, rendered with react-test-renderer —
 * node environment with every native/API dependency mocked
 * (see useSettingsState.test.js for the harness pattern).
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
	removeMany: jest.fn(),
}))

jest.mock('../api/authApi', () => ({
	authApi: {
		login: jest.fn(),
		logout: jest.fn(),
		register: jest.fn(),
		confirmRegistration: jest.fn(),
		requestPin: jest.fn(),
		getPasskeyLoginOptions: jest.fn(),
		verifyPasskeyLogin: jest.fn(),
	},
}))

jest.mock('../api/userApi', () => ({
	userApi: {
		getUserProfile: jest.fn(),
	},
}))

jest.mock('../api/client', () => ({
	setAuthToken: jest.fn(),
	getAuthToken: jest.fn(),
	removeAuthToken: jest.fn(),
}))

jest.mock('react-native-onesignal', () => ({
	OneSignal: {
		login: jest.fn(),
		logout: jest.fn(),
		User: { addTags: jest.fn() },
	},
}))

jest.mock('react-native-passkey', () => ({
	Passkey: { get: jest.fn() },
}))

jest.mock('../helpers/widgetBridge', () => ({
	updateWidgetBalance: jest.fn(),
	reloadWidgets: jest.fn(),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { OneSignal } from 'react-native-onesignal'
import { Passkey } from 'react-native-passkey'
import { authApi } from '../api/authApi'
import { userApi } from '../api/userApi'
import { setAuthToken, getAuthToken, removeAuthToken } from '../api/client'
import { updateWidgetBalance, reloadWidgets } from '../helpers/widgetBridge'
import useAuthState from './useAuthState'

// `me` payload as returned by the auth endpoints
const ME = {
	uuid: 'u-123',
	username: 'erich',
	name: 'Erich',
	lastname: 'Garcia',
	two_factor_secret: null,
	bio: 'hola',
	balance: 42.5,
	satoshis: 1000,
	phone: '+5355555555',
	phone_verified: 1,
	kyc: 1,
	vip: 0,
	golden_check: 0,
	golden_expire: null,
	p2p_enabled: 1,
	cover: 'covers/abc.jpg',
	image: 'https://media.qvapay.com/avatar.jpg',
	average_rating: 4.9,
	role: 'user',
	email: 'me@qvapay.com',
}

const CREDENTIALS = { email: 'login@qvapay.com', password: 'secret' }

// Minimal hook harness: renders the hook inside a throwaway component and
// exposes its latest return value through `result.current`.
const renderHook = async () => {
	const result = { current: null }
	const Harness = () => {
		result.current = useAuthState()
		return null
	}
	let root
	await act(async () => { root = create(React.createElement(Harness)) })
	return { result, root }
}

// Renders the hook and walks it through a successful 200 login
const renderAuthenticatedHook = async () => {
	authApi.login.mockResolvedValue({ success: true, status: 200, accessToken: 'tok-1', me: ME })
	const rendered = await renderHook()
	await act(async () => { await rendered.result.current.login(CREDENTIALS) })
	return rendered
}

beforeEach(() => {
	jest.clearAllMocks()
	AsyncStorage.getItem.mockResolvedValue(null)
	AsyncStorage.setItem.mockResolvedValue()
	AsyncStorage.removeItem.mockResolvedValue()
	AsyncStorage.removeMany.mockResolvedValue()
	getAuthToken.mockResolvedValue(null)
	setAuthToken.mockResolvedValue()
	removeAuthToken.mockResolvedValue()
	userApi.getUserProfile.mockResolvedValue({ success: false, error: 'network' })
	updateWidgetBalance.mockResolvedValue()
	reloadWidgets.mockResolvedValue()
})

describe('initializeAuth', () => {
	test('no stored token yields a clean unauthenticated state', async () => {
		const { result } = await renderHook()
		expect(result.current.isAuthenticated).toBe(false)
		expect(result.current.user).toBeNull()
		expect(result.current.token).toBeNull()
		expect(result.current.isLoading).toBe(false)
		// clearAuthData wipes the Keychain token and cached user/contacts data
		expect(removeAuthToken).toHaveBeenCalled()
		expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user_data')
		expect(AsyncStorage.removeMany).toHaveBeenCalledWith([
			'device_contacts_matched',
			'device_contacts_last_sync',
			'device_contacts_consent',
		])
	})

	test('always purges the legacy pre-Keychain AsyncStorage token', async () => {
		await renderHook()
		expect(AsyncStorage.removeItem).toHaveBeenCalledWith('token')
	})

	test('a stored token hydrates optimistically from the cache while the profile refresh is in flight', async () => {
		getAuthToken.mockResolvedValue('tok-1')
		const cached = { uuid: 'u-123', username: 'erich', balance: 10 }
		AsyncStorage.getItem.mockResolvedValue(JSON.stringify(cached))
		userApi.getUserProfile.mockReturnValue(new Promise(() => { })) // never resolves
		const { result } = await renderHook()
		expect(result.current.isAuthenticated).toBe(true)
		expect(result.current.token).toBe('tok-1')
		expect(result.current.user).toEqual(cached)
		expect(OneSignal.login).toHaveBeenCalledWith('u-123')
		expect(updateWidgetBalance).toHaveBeenCalledWith(10, 'erich')
		// finally hasn't run — still loading in the background
		expect(result.current.isLoading).toBe(true)
	})

	test('a successful profile refresh replaces the cached user and re-caches it', async () => {
		getAuthToken.mockResolvedValue('tok-1')
		AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ uuid: 'u-123', username: 'stale', balance: 1 }))
		const fresh = { uuid: 'u-123', username: 'erich', balance: 99, cover: 'covers/x.jpg' }
		userApi.getUserProfile.mockResolvedValue({ success: true, data: fresh })
		const { result } = await renderHook()
		expect(result.current.isAuthenticated).toBe(true)
		expect(result.current.user.username).toBe('erich')
		expect(result.current.user.balance).toBe(99)
		// cover path is expanded into a full media URL
		expect(result.current.user.cover_photo_url).toBe('https://media.qvapay.com/covers/x.jpg')
		expect(AsyncStorage.setItem).toHaveBeenCalledWith('user_data', JSON.stringify(result.current.user))
		expect(updateWidgetBalance).toHaveBeenCalledWith(99, 'erich')
		expect(reloadWidgets).toHaveBeenCalled()
		expect(result.current.isLoading).toBe(false)
	})

	test('a 401 from the profile refresh revokes the session', async () => {
		getAuthToken.mockResolvedValue('tok-1')
		AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ uuid: 'u-123' }))
		userApi.getUserProfile.mockResolvedValue({ success: false, status: 401 })
		const { result } = await renderHook()
		expect(result.current.isAuthenticated).toBe(false)
		expect(result.current.user).toBeNull()
		expect(result.current.token).toBeNull()
		expect(removeAuthToken).toHaveBeenCalled()
	})

	test('a non-auth refresh failure (network / 429 / 5xx) keeps the cached session intact', async () => {
		getAuthToken.mockResolvedValue('tok-1')
		const cached = { uuid: 'u-123', username: 'erich', balance: 10 }
		AsyncStorage.getItem.mockResolvedValue(JSON.stringify(cached))
		userApi.getUserProfile.mockResolvedValue({ success: false, status: 500 })
		const { result } = await renderHook()
		expect(result.current.isAuthenticated).toBe(true)
		expect(result.current.user).toEqual(cached)
		expect(removeAuthToken).not.toHaveBeenCalled()
		expect(result.current.isLoading).toBe(false)
	})

	test('a corrupt user cache is ignored without crashing the bootstrap', async () => {
		getAuthToken.mockResolvedValue('tok-1')
		AsyncStorage.getItem.mockResolvedValue('{not json')
		userApi.getUserProfile.mockResolvedValue({ success: false, status: 500 })
		const { result } = await renderHook()
		expect(result.current.isAuthenticated).toBe(true)
		expect(result.current.user).toBeNull()
	})
})

describe('login', () => {
	test('a 200 response establishes the full session', async () => {
		authApi.login.mockResolvedValue({ success: true, status: 200, accessToken: 'tok-1', me: ME })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.login(CREDENTIALS) })
		expect(outcome).toEqual({ success: true, security_warning: null })
		expect(result.current.isAuthenticated).toBe(true)
		expect(result.current.token).toBe('tok-1')
		// the API omits the email in `me`, so the login email is used
		expect(result.current.user.email).toBe(CREDENTIALS.email)
		expect(result.current.user.username).toBe('erich')
		expect(result.current.user.cover_photo_url).toBe('https://media.qvapay.com/covers/abc.jpg')
		expect(setAuthToken).toHaveBeenCalledWith('tok-1')
		expect(AsyncStorage.setItem).toHaveBeenCalledWith('user_data', JSON.stringify(result.current.user))
		expect(OneSignal.login).toHaveBeenCalledWith('u-123')
		expect(OneSignal.User.addTags).toHaveBeenCalledWith({ kyc: 'true', vip: 'false', golden_check: 'false' })
	})

	test('a 200 response forwards the security warning from the API', async () => {
		authApi.login.mockResolvedValue({ success: true, status: 200, accessToken: 'tok-1', me: ME, security_warning: 'leaked password' })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.login(CREDENTIALS) })
		expect(outcome).toEqual({ success: true, security_warning: 'leaked password' })
	})

	test('a 202 response signals the 2FA challenge without touching auth state', async () => {
		authApi.login.mockResolvedValue({ success: true, status: 202, notified: true, has_otp: false })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.login(CREDENTIALS) })
		expect(outcome).toEqual({ success: true, status: 202, notified: true, has_otp: false })
		expect(result.current.isAuthenticated).toBe(false)
		expect(result.current.user).toBeNull()
		expect(result.current.token).toBeNull()
		expect(setAuthToken).not.toHaveBeenCalled()
		expect(OneSignal.login).not.toHaveBeenCalled()
	})

	test('an API failure surfaces the error and passes through status, details and action', async () => {
		authApi.login.mockResolvedValue({ success: false, error: 'Credenciales incorrectas', status: 422, details: { email: ['bad'] }, action: 'retry' })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.login(CREDENTIALS) })
		expect(outcome).toEqual({ success: false, error: 'Credenciales incorrectas', details: { email: ['bad'] }, status: 422, action: 'retry' })
		expect(result.current.error).toBe('Credenciales incorrectas')
		expect(result.current.isAuthenticated).toBe(false)
	})

	test('a thrown error is caught and reported as a generic login failure', async () => {
		authApi.login.mockRejectedValue(new Error('boom'))
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.login(CREDENTIALS) })
		expect(outcome).toEqual({ success: false, error: 'boom', details: undefined })
		expect(result.current.error).toBe('Login failed. Please try again.')
	})
})

describe('loginWithPasskey', () => {
	test('the happy path chains options → assertion → verification into a session', async () => {
		authApi.getPasskeyLoginOptions.mockResolvedValue({ success: true, data: { sessionId: 'sess-1', challenge: 'abc' } })
		Passkey.get.mockResolvedValue({ id: 'cred-1', response: {} })
		authApi.verifyPasskeyLogin.mockResolvedValue({ success: true, accessToken: 'tok-pk', me: ME })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.loginWithPasskey() })
		expect(outcome).toEqual({ success: true })
		// sessionId is stripped before hitting the authenticator, then re-attached for verification
		expect(Passkey.get).toHaveBeenCalledWith({ challenge: 'abc' })
		expect(authApi.verifyPasskeyLogin).toHaveBeenCalledWith({ sessionId: 'sess-1', id: 'cred-1', response: {} })
		expect(result.current.isAuthenticated).toBe(true)
		expect(result.current.token).toBe('tok-pk')
		// no login email here — falls back to me.email
		expect(result.current.user.email).toBe(ME.email)
	})

	test('failing to fetch options aborts before touching the authenticator', async () => {
		authApi.getPasskeyLoginOptions.mockResolvedValue({ success: false, error: 'no options' })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.loginWithPasskey() })
		expect(outcome).toEqual({ success: false, error: 'no options' })
		expect(Passkey.get).not.toHaveBeenCalled()
	})

	test('a failed server verification does not authenticate', async () => {
		authApi.getPasskeyLoginOptions.mockResolvedValue({ success: true, data: { sessionId: 'sess-1' } })
		Passkey.get.mockResolvedValue({ id: 'cred-1' })
		authApi.verifyPasskeyLogin.mockResolvedValue({ success: false, error: 'bad assertion' })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.loginWithPasskey() })
		expect(outcome).toEqual({ success: false, error: 'bad assertion' })
		expect(result.current.isAuthenticated).toBe(false)
	})

	test('a user-cancelled prompt resolves silently with a null error', async () => {
		authApi.getPasskeyLoginOptions.mockResolvedValue({ success: true, data: { sessionId: 'sess-1' } })
		Passkey.get.mockRejectedValue(new Error('User cancelled the operation'))
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.loginWithPasskey() })
		expect(outcome).toEqual({ success: false, error: null })
		expect(result.current.error).toBeNull()
	})

	test('any other authenticator error sets the Spanish passkey error', async () => {
		authApi.getPasskeyLoginOptions.mockResolvedValue({ success: true, data: { sessionId: 'sess-1' } })
		Passkey.get.mockRejectedValue(new Error('hardware unavailable'))
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.loginWithPasskey() })
		expect(outcome).toEqual({ success: false, error: 'hardware unavailable' })
		expect(result.current.error).toBe('Error al iniciar sesión con Passkey')
	})
})

describe('logout', () => {
	test('with a session it revokes server-side, unlinks push and wipes everything', async () => {
		const { result } = await renderAuthenticatedHook()
		authApi.logout.mockResolvedValue({ success: true })
		let outcome
		await act(async () => { outcome = await result.current.logout() })
		expect(outcome).toEqual({ success: true })
		expect(authApi.logout).toHaveBeenCalled()
		expect(OneSignal.logout).toHaveBeenCalled()
		expect(removeAuthToken).toHaveBeenCalled()
		expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user_data')
		expect(AsyncStorage.removeMany).toHaveBeenCalledWith([
			'device_contacts_matched',
			'device_contacts_last_sync',
			'device_contacts_consent',
		])
		expect(result.current.isAuthenticated).toBe(false)
		expect(result.current.user).toBeNull()
		expect(result.current.token).toBeNull()
		expect(result.current.error).toBeNull()
	})

	test('without a token it skips the API call but still clears local state', async () => {
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.logout() })
		expect(outcome).toEqual({ success: true })
		expect(authApi.logout).not.toHaveBeenCalled()
		expect(OneSignal.logout).toHaveBeenCalled()
		expect(result.current.isAuthenticated).toBe(false)
	})

	test('a failed server-side revocation never blocks the local logout', async () => {
		const { result } = await renderAuthenticatedHook()
		authApi.logout.mockRejectedValue(new Error('offline'))
		let outcome
		await act(async () => { outcome = await result.current.logout() })
		expect(outcome).toEqual({ success: true })
		expect(result.current.isAuthenticated).toBe(false)
		expect(removeAuthToken).toHaveBeenCalled()
	})
})

describe('register', () => {
	test('a successful registration returns the message and user without creating a session', async () => {
		authApi.register.mockResolvedValue({ success: true, message: 'Revisa tu correo', user: { email: 'new@qvapay.com' } })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.register({ email: 'new@qvapay.com' }) })
		expect(outcome).toEqual({ success: true, message: 'Revisa tu correo', user: { email: 'new@qvapay.com' } })
		expect(result.current.isAuthenticated).toBe(false)
		expect(setAuthToken).not.toHaveBeenCalled()
	})

	test('an API failure surfaces the error', async () => {
		authApi.register.mockResolvedValue({ success: false, error: 'Email ya registrado' })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.register({ email: 'dup@qvapay.com' }) })
		expect(outcome).toEqual({ success: false, error: 'Email ya registrado' })
		expect(result.current.error).toBe('Email ya registrado')
	})

	test('a thrown error collapses to the generic registration failure', async () => {
		authApi.register.mockRejectedValue(new Error('boom'))
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.register({}) })
		expect(outcome).toEqual({ success: false, error: 'Registration failed. Please try again.' })
		expect(result.current.error).toBe('Registration failed. Please try again.')
	})
})

describe('confirmRegistration', () => {
	test('a valid PIN confirms the account', async () => {
		authApi.confirmRegistration.mockResolvedValue({ success: true, message: 'Cuenta confirmada' })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.confirmRegistration({ email: 'a@b.c', pin: '1234' }) })
		expect(outcome).toEqual({ success: true, message: 'Cuenta confirmada' })
	})

	test('an invalid PIN returns the error with its details', async () => {
		authApi.confirmRegistration.mockResolvedValue({ success: false, error: 'PIN inválido', details: { pin: ['expired'] } })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.confirmRegistration({ email: 'a@b.c', pin: '0000' }) })
		expect(outcome).toEqual({ success: false, error: 'PIN inválido', details: { pin: ['expired'] } })
		expect(result.current.error).toBe('PIN inválido')
	})

	test('a thrown error returns the fallback message with empty details', async () => {
		authApi.confirmRegistration.mockRejectedValue(new Error('boom'))
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.confirmRegistration({ email: 'a@b.c', pin: '1234' }) })
		expect(outcome).toEqual({ success: false, error: 'boom', details: {} })
		expect(result.current.error).toBe('Failed to confirm registration')
	})
})

describe('requestPin', () => {
	test('delegates to the API and returns its message', async () => {
		authApi.requestPin.mockResolvedValue({ success: true, message: 'PIN enviado' })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.requestPin(CREDENTIALS) })
		expect(outcome).toEqual({ success: true, message: 'PIN enviado' })
		expect(authApi.requestPin).toHaveBeenCalledWith(CREDENTIALS)
	})

	test('surfaces API errors', async () => {
		authApi.requestPin.mockResolvedValue({ success: false, error: 'Demasiados intentos' })
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.requestPin(CREDENTIALS) })
		expect(outcome).toEqual({ success: false, error: 'Demasiados intentos' })
		expect(result.current.error).toBe('Demasiados intentos')
	})

	test('a thrown error reports the failure', async () => {
		authApi.requestPin.mockRejectedValue(new Error('boom'))
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.requestPin(CREDENTIALS) })
		expect(outcome).toEqual({ success: false, error: 'boom' })
		expect(result.current.error).toBe('Failed to request PIN')
	})
})

describe('updateUser', () => {
	test('merges partial data over the current user, persists it and refreshes widgets', async () => {
		const { result } = await renderAuthenticatedHook()
		AsyncStorage.setItem.mockClear()
		updateWidgetBalance.mockClear()
		let outcome
		await act(async () => { outcome = await result.current.updateUser({ balance: 77, bio: 'nuevo' }) })
		expect(outcome).toEqual({ success: true })
		expect(result.current.user.balance).toBe(77)
		expect(result.current.user.bio).toBe('nuevo')
		expect(result.current.user.username).toBe('erich') // untouched fields survive
		expect(AsyncStorage.setItem).toHaveBeenCalledWith('user_data', JSON.stringify(result.current.user))
		expect(updateWidgetBalance).toHaveBeenCalledWith(77, 'erich')
		expect(reloadWidgets).toHaveBeenCalled()
	})

	test('a persistence failure reports the error and keeps the previous user', async () => {
		const { result } = await renderAuthenticatedHook()
		AsyncStorage.setItem.mockRejectedValue(new Error('disk full'))
		let outcome
		await act(async () => { outcome = await result.current.updateUser({ balance: 77 }) })
		expect(outcome).toEqual({ success: false, error: 'disk full' })
		expect(result.current.error).toBe('Failed to update user data')
		expect(result.current.user.balance).toBe(ME.balance)
	})
})

describe('completeSession', () => {
	test('the registration wizard can establish a session directly, falling back to me.email', async () => {
		const { result } = await renderHook()
		let mapped
		await act(async () => { mapped = await result.current.completeSession({ accessToken: 'tok-wiz', me: ME }) })
		expect(mapped.email).toBe(ME.email)
		expect(result.current.isAuthenticated).toBe(true)
		expect(result.current.token).toBe('tok-wiz')
		expect(setAuthToken).toHaveBeenCalledWith('tok-wiz')
		expect(OneSignal.login).toHaveBeenCalledWith(ME.uuid)
	})
})

describe('clearError', () => {
	test('wipes a previously set error', async () => {
		authApi.login.mockResolvedValue({ success: false, error: 'nope' })
		const { result } = await renderHook()
		await act(async () => { await result.current.login(CREDENTIALS) })
		expect(result.current.error).toBe('nope')
		await act(async () => { result.current.clearError() })
		expect(result.current.error).toBeNull()
	})
})
