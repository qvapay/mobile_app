import { useState, useEffect, useReducer } from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'

// API
import { authApi } from '../api/authApi'
import { userApi } from '../api/userApi'
import { setAuthToken, removeAuthToken, getAuthToken } from '../api/client'

// OneSignal Push Notifications
import { OneSignal } from 'react-native-onesignal'

// Widget Bridge
import { updateWidgetBalance, reloadWidgets } from '../helpers/widgetBridge'

// Storage keys
const STORAGE_KEYS = { USER_DATA: 'user_data' }

/**
 * Maps the API `me` payload to the local user shape (shared by login,
 * passkey login and the registration wizard via `completeSession`).
 * Also derives `cover_photo_url` from the raw `cover` media path.
 *
 * @param {Object} me - `me` object returned by the auth endpoints.
 * @param {string} email - Email used to log in (the API omits it here).
 * @returns {Object} User object as stored in state and AsyncStorage.
 */
const mapMeToUser = (me, email) => ({
	uuid: me.uuid,
	email,
	username: me.username,
	name: me.name,
	lastname: me.lastname,
	two_factor_secret: me.two_factor_secret,
	bio: me.bio,
	balance: me.balance,
	satoshis: me.satoshis,
	phone: me.phone,
	phone_verified: me.phone_verified,
	kyc: me.kyc,
	vip: me.vip,
	golden_check: me.golden_check,
	golden_expire: me.golden_expire,
	p2p_enabled: me.p2p_enabled,
	cover_photo_url: me.cover ? `https://media.qvapay.com/${me.cover}` : null,
	image: me.image,
	average_rating: me.average_rating,
	role: me.role,
})

// isAuthenticated / user / token move together on login & logout — one session slice
const initialSession = { isAuthenticated: false, user: null, token: null }

function sessionReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/**
 * Owns all auth state + actions. The AuthProvider just exposes its return value.
 *
 * Persistence model (secrets never touch AsyncStorage):
 * - Bearer token → Keychain, service `com.qvapay.auth` (via api/client helpers).
 * - User profile → AsyncStorage `user_data` (non-secret cache for instant cold-start UI).
 *
 * Side effects on session changes: links/unlinks the user with OneSignal
 * (uuid + kyc/vip/gold tags) and pushes the balance to home-screen widgets.
 *
 * @returns {{
 *   isAuthenticated: boolean,
 *   user: Object|null,
 *   token: string|null,
 *   isLoading: boolean,
 *   error: string|null,
 *   login: Function,
 *   loginWithPasskey: Function,
 *   logout: Function,
 *   register: Function,
 *   updateUser: Function,
 *   clearError: Function,
 *   requestPin: Function,
 *   confirmRegistration: Function,
 *   completeSession: Function,
 * }}
 */
export default function useAuthState() {

	// Session slice (same-named setters keep every call site unchanged)
	const [session, dispatchSession] = useReducer(sessionReducer, initialSession)
	const { isAuthenticated, user, token } = session
	const setIsAuthenticated = (value) => dispatchSession({ type: 'set', field: 'isAuthenticated', value })
	const setUser = (value) => dispatchSession({ type: 'set', field: 'user', value })
	const setToken = (value) => dispatchSession({ type: 'set', field: 'token', value })

	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState(null)

	// Initialize auth state on app start
	useEffect(() => {
		initializeAuth()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	/**
	 * Initializes authentication state from storage (runs once on app start).
	 * Optimistic: trust the Keychain token + cached user on cold start, then
	 * refresh the profile from `/user/extended` in the background.
	 * Only force logout on definitive auth failures (401/403) from a real request;
	 * network errors, rate limits and 5xx must not kick the user to the login screen.
	 */
	const initializeAuth = async () => {

		try {

			setIsLoading(true)

			// Purge the pre-Keychain plaintext token (the Feb 2026 Keychain migration
			// switched reads but never deleted the old AsyncStorage key, and those
			// remember-me sessions live 180 days)
			AsyncStorage.removeItem('token').catch(() => { })

			const saved_token = await getAuthToken()

			if (!saved_token) {
				await clearAuthData()
				setUser(null)
				setToken(null)
				setIsAuthenticated(false)
				return
			}

			// Hydrate from cache so the UI can render immediately
			let cachedUser = null
			try {
				const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA)
				if (raw) { cachedUser = JSON.parse(raw) }
			} catch (_) { /* corrupt cache — ignore */ }

			setToken(saved_token)
			setIsAuthenticated(true)
			if (cachedUser) {
				setUser(cachedUser)
				if (cachedUser.uuid) { OneSignal.login(cachedUser.uuid) }
				if (cachedUser.balance != null && cachedUser.username) {
					updateWidgetBalance(cachedUser.balance, cachedUser.username)
					reloadWidgets()
				}
			}

			// Refresh profile in the background. Only logout on real auth rejection.
			const userData = await userApi.getUserProfile()
			if (userData.success && userData.data) {
				if (userData.data.cover && !userData.data.cover_photo_url) { userData.data.cover_photo_url = `https://media.qvapay.com/${userData.data.cover}` }
				try { await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData.data)) } catch (_) { /* cache write failed */ }
				setUser(userData.data)
				updateWidgetBalance(userData.data.balance, userData.data.username)
				reloadWidgets()
				if (userData.data.uuid) { OneSignal.login(userData.data.uuid) }
			} else if (userData.status === 401 || userData.status === 403) {
				// Token genuinely revoked/invalid — clear and require re-login
				await clearAuthData()
				setUser(null)
				setToken(null)
				setIsAuthenticated(false)
			}
			// Any other failure (network, 429, 5xx): keep the cached session intact.

		} catch (err) { /* Non-auth bootstrap error — keep cached session */ }
		finally { setIsLoading(false) }
	}

	/**
	 * Establishes a full session from a successful auth API response: persists the
	 * token (Keychain) + user (AsyncStorage), flips auth state and links OneSignal.
	 * Shared by login, loginWithPasskey and the registration wizard (which
	 * authenticates silently and completes the session only after its optional
	 * phone-verification step).
	 *
	 * @param {Object} params
	 * @param {string} params.accessToken - Bearer token from the API.
	 * @param {Object} params.me - `me` payload from the API.
	 * @param {string} [params.email] - Login email; falls back to `me.email`.
	 * @returns {Promise<Object>} The mapped user object now held in state.
	 */
	const completeSession = async ({ accessToken, me, email }) => {

		const userData = mapMeToUser(me, email || me.email)

		await Promise.all([
			AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData)),
			setAuthToken(accessToken),
		])

		setUser(userData)
		setToken(accessToken)
		setIsAuthenticated(true)

		// Register user with OneSignal for targeted push notifications
		OneSignal.login(userData.uuid)
		OneSignal.User.addTags({
			kyc: userData.kyc ? 'true' : 'false',
			vip: userData.vip ? 'true' : 'false',
			golden_check: userData.golden_check ? 'true' : 'false',
		})

		return userData
	}

	/**
	 * Logs in against the QvaPay API. Two-phase flow:
	 * - HTTP 202 = 2FA challenge (prelogin accepted, PIN/TOTP required) — returns
	 *   `{ success: true, status: 202, notified, has_otp }` WITHOUT touching state;
	 *   the caller re-invokes with `credentials.code` to finish.
	 * - HTTP 200 = full success — persists token + user via `completeSession`.
	 *
	 * Note: the 60s "too many attempts" lockout after 5 failed logins is enforced
	 * client-side by the Login screen (and by ArcJet on the backend), not here.
	 *
	 * @param {{ email: string, password: string, code?: string }} credentials
	 * @returns {Promise<{ success: boolean, status?: number, notified?: boolean,
	 *   has_otp?: boolean, security_warning?: string|null, error?: string,
	 *   details?: Object, action?: string }>}
	 */
	const login = async (credentials) => {

		try {

			setError(null)

			// Call QvaPay API for authentication
			const apiResponse = await authApi.login(credentials)

			if (!apiResponse.success) {
				setError(apiResponse.error || 'Login failed')
				return { success: false, error: apiResponse.error, details: apiResponse.details, status: apiResponse.status, action: apiResponse.action }
			}

			// If Prelogin is successful, we return the status and success
			if (apiResponse.status === 202) { return { success: true, status: apiResponse.status, notified: apiResponse.notified, has_otp: apiResponse.has_otp } }

			// Extract data from API response and establish the session
			const { accessToken, me } = apiResponse
			await completeSession({ accessToken, me, email: credentials.email })

			return { success: true, security_warning: apiResponse.security_warning || null }

		} catch (err) {
			setError('Login failed. Please try again.')
			return { success: false, error: err.message, details: err.details }
		} finally { setIsLoading(false) }
	}


	/**
	 * Logs in with a Passkey (WebAuthn): fetches challenge options, runs the
	 * platform authenticator via `react-native-passkey`, verifies the assertion
	 * server-side, then establishes the session exactly like a password login.
	 * A user-cancelled prompt resolves as `{ success: false, error: null }` so
	 * callers can ignore it silently.
	 *
	 * @returns {Promise<{ success: boolean, error?: string|null }>}
	 */
	const loginWithPasskey = async () => {

		try {

			setError(null)

			// 1. Get authentication options from server
			const optionsResult = await authApi.getPasskeyLoginOptions()
			if (!optionsResult.success) { return { success: false, error: optionsResult.error } }

			const { sessionId, ...options } = optionsResult.data

			// 2. Authenticate with device passkey
			const { Passkey } = require('react-native-passkey')
			const assertion = await Passkey.get(options)

			// 3. Verify with server
			const verifyResult = await authApi.verifyPasskeyLogin({ sessionId, ...assertion })
			if (!verifyResult.success) { return { success: false, error: verifyResult.error } }

			// 4. Store credentials (same as regular login)
			const { accessToken, me } = verifyResult
			await completeSession({ accessToken, me, email: me.email })

			return { success: true }

		} catch (err) {
			// User cancelled or passkey not available
			if (err?.message?.includes('cancel') || err?.code === 'ERR_PASSKEY_CANCELLED') {
				return { success: false, error: null } // silent cancel
			}
			setError('Error al iniciar sesión con Passkey')
			return { success: false, error: err.message || 'Error al iniciar sesión con Passkey' }
		} finally { setIsLoading(false) }
	}

	/**
	 * Requests a login 2FA PIN to be sent to the user (email delivery).
	 *
	 * @param {{ email: string, password: string }} credentials
	 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
	 */
	const requestPin = async (credentials) => {

		try {

			setError(null)
			const apiResponse = await authApi.requestPin(credentials)

			if (apiResponse.success) {
				return { success: true, message: apiResponse.message }
			} else {
				setError(apiResponse.error)
				return { success: false, error: apiResponse.error }
			}
		}
		catch (err) {
			setError('Failed to request PIN')
			return { success: false, error: err.message }
		} finally { setIsLoading(false) }
	}

	/**
	 * Logs out: revokes the session server-side (best effort — a failed API call
	 * never blocks the local logout), unlinks OneSignal, wipes the Keychain token
	 * and cached user/contacts data, and resets all auth state.
	 *
	 * @returns {Promise<{ success: boolean, error?: string }>}
	 */
	const logout = async () => {

		try {

			if (token) {
				try { await authApi.logout() }
				catch (apiError) { /* API logout failed */ }
			}

			// Unlink user from OneSignal push notifications
			OneSignal.logout()

			// Clear all stored data
			await clearAuthData()

			// Reset state
			setUser(null)
			setToken(null)
			setIsAuthenticated(false)
			setError(null)

			return { success: true }

		} catch (err) {
			setError('Logout failed. Please try again.')
			return { success: false, error: err.message }
		} finally { setIsLoading(false) }
	}

	/**
	 * Registers a new account. Does NOT create a session — the account still needs
	 * email confirmation (`confirmRegistration`) and the wizard signs in afterwards.
	 *
	 * @param {Object} credentials - Registration payload (name, email, password, ...).
	 * @returns {Promise<{ success: boolean, message?: string, user?: Object, error?: string }>}
	 */
	const register = async (credentials) => {

		try {

			setError(null)

			const apiResponse = await authApi.register(credentials)
			if (apiResponse.success) {

				// Return success response
				return {
					success: true,
					message: apiResponse.message,
					user: apiResponse.user
				}

			} else {

				setError(apiResponse.error)

				return {
					success: false,
					error: apiResponse.error
				}
			}

		} catch (err) {
			setError('Registration failed. Please try again.')
			return {
				success: false,
				error: 'Registration failed. Please try again.'
			}
		} finally { setIsLoading(false) }
	}

	/**
	 * Confirms a fresh registration with the PIN emailed to the user.
	 *
	 * @param {{ email: string, pin: string }} credentials
	 * @returns {Promise<{ success: boolean, message?: string, error?: string, details?: Object }>}
	 */
	const confirmRegistration = async (credentials) => {
		try {
			const apiResponse = await authApi.confirmRegistration(credentials)
			if (apiResponse.success) {
				return { success: true, message: apiResponse.message }
			} else {
				setError(apiResponse.error)
				return {
					success: false,
					error: apiResponse.error,
					details: apiResponse.details || {}
				}
			}
		}
		catch (err) {
			setError('Failed to confirm registration')
			return {
				success: false,
				error: err.message || 'Failed to confirm registration',
				details: {}
			}
		} finally { setIsLoading(false) }
	}

	/**
	 * Clears all persisted authentication data: the Keychain token
	 * (`com.qvapay.auth`), the cached user profile, and the synced
	 * device-contacts keys (matches, last sync, consent).
	 */
	const clearAuthData = async () => {
		try {
			await Promise.all([
				removeAuthToken(), // Use API client's token removal
				AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA),
				AsyncStorage.removeMany([
					'device_contacts_matched',
					'device_contacts_last_sync',
					'device_contacts_consent',
				]),
			])
		} catch (err) { /* error clearing auth data */ }
	}

	/**
	 * Merges partial user data into state + the AsyncStorage cache and refreshes
	 * home-screen widgets with the latest balance. Local only — call the relevant
	 * API endpoint first; this just keeps the client copy in sync.
	 *
	 * @param {Object} newUserData - Partial user fields to merge over the current user.
	 * @returns {Promise<{ success: boolean, error?: string }>}
	 */
	const updateUser = async (newUserData) => {
		try {
			const updatedUser = { ...user, ...newUserData }
			await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser))
			setUser(updatedUser)
			// Update home screen widgets with latest balance
			updateWidgetBalance(updatedUser.balance, updatedUser.username)
			reloadWidgets()
			return { success: true }
		} catch (err) {
			setError('Failed to update user data')
			return { success: false, error: err.message }
		}
	}

	// Clear error
	const clearError = () => { setError(null) }

	return {
		// State
		isAuthenticated,
		user,
		token,
		isLoading,
		error,

		// Functions
		login,
		loginWithPasskey,
		logout,
		register,
		updateUser,
		clearError,
		requestPin,
		confirmRegistration,
		completeSession
	}
}
