import { useState, useEffect, useReducer, useRef, useCallback } from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'

// API
import { authApi } from '../api/authApi'
import { userApi } from '../api/userApi'
import { setAuthToken, removeAuthToken, getAuthToken } from '../api/client'

// OneSignal Push Notifications
import { OneSignal } from 'react-native-onesignal'

// Widget Bridge
import { updateWidgetBalance, reloadWidgets } from '../helpers/widgetBridge'

// Cold-start data cache (transactions, quick-pay, catalogs…) — purged with the session
import { clearDataCache } from '../helpers/dataCache'

// React Query cache (se importa el singleton, no vía hook: clearAuthData corre
// fuera del árbol de React en algunos caminos de arranque)
import { queryClient, persister } from '../api/queryClient'

// i18n (call time: los setError corren en callbacks async, fuera de render)
import i18n from '../i18n'

// Tipos
import type { Me, User } from '../types/domain'
import type { LoginCredentials, RegisterCredentials, ConfirmRegistrationCredentials } from '../api/authApi'

// Storage keys
const STORAGE_KEYS = { USER_DATA: 'user_data' }

/**
 * Maps the API `me` payload to the local user shape (shared by login,
 * passkey login and the registration wizard via `completeSession`).
 * Also derives `cover_photo_url` from the raw `cover` media path.
 *
 * @param me - `me` object returned by the auth endpoints.
 * @param email - Email used to log in (the API omits it here).
 * @returns User object as stored in state and AsyncStorage.
 */
const mapMeToUser = (me: Me, email?: string) => ({
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
	// none | pending | approved | declined — señal de UI (pending = Didit en
	// revisión); el flag autoritativo de gating sigue siendo `kyc`
	kyc_status: me.kyc_status,
	telegram_id: me.telegram_id,
	// Insumos del gate cliente de depósito con tarjeta (helpers/cardDepositEligibility)
	trustscore: me.trustscore,
	created_at: me.createdAt,
	vip: me.vip,
	golden_check: me.golden_check,
	golden_expire: me.golden_expire,
	p2p_enabled: me.p2p_enabled,
	cover_photo_url: me.cover ? `https://media.qvapay.com/${me.cover}` : null,
	image: me.image,
	average_rating: me.average_rating,
	role: me.role,
})

/**
 * Clears all persisted authentication data: the Keychain token
 * (`com.qvapay.auth`), the cached user profile, the synced
 * device-contacts keys (matches, last sync, consent), every
 * `@qpcache:` cold-start slice (transactions, quick-pay, catalogs…) and the
 * React Query cache, both in memory and its persisted copy.
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
			clearDataCache(),
			// Sin esto, los datos de la cuenta anterior sobrevivirían en memoria y
			// en el snapshot del persister: al entrar con otra cuenta se verían
			// sus transacciones antes del primer fetch
			queryClient.clear(),
			persister.removeClient(),
		])
	} catch (err) { /* error clearing auth data */ }
}

// isAuthenticated / user / token move together on login & logout — one session slice
type Session = { isAuthenticated: boolean, user: User | null, token: string | null }
type SessionAction = { type: 'set', field: keyof Session, value: Session[keyof Session] }

const initialSession: Session = { isAuthenticated: false, user: null, token: null }

function sessionReducer(state: Session, action: SessionAction): Session {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value } as Session
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
 * @returns Estado (`isAuthenticated`, `user`, `token`, `isLoading`, `error`)
 *   y acciones (`login`, `loginWithPasskey`, `logout`, `register`, `updateUser`,
 *   `clearError`, `requestPin`, `confirmRegistration`, `completeSession`) —
 *   el tipo exacto lo da la inferencia.
 */
export default function useAuthState() {

	// Session slice (same-named setters keep every call site unchanged)
	const [session, dispatchSession] = useReducer(sessionReducer, initialSession)
	const { isAuthenticated, user, token } = session
	const setIsAuthenticated = (value: boolean) => dispatchSession({ type: 'set', field: 'isAuthenticated', value })
	const setUser = (value: User | null) => dispatchSession({ type: 'set', field: 'user', value })
	const setToken = (value: string | null) => dispatchSession({ type: 'set', field: 'token', value })

	const [isLoading, setIsLoading] = useState(true)
	// `undefined` admitido a propósito: varios caminos hacen setError(apiResponse.error)
	// con error opcional — normalizarlo a null sería un cambio de runtime
	const [error, setError] = useState<string | null | undefined>(null)

	// Espejo del user para que `updateUser` pueda ser ESTABLE (deps []): si la
	// función se recreara con cada cambio de `user`, todo efecto que dependa de
	// ella entraría en bucle — useHomeFeed vuelca el perfil con
	// `useEffect(..., [profile.data, updateUser])`, y ese bucle bombardeaba el
	// AuthContext con updates contra pantallas congeladas por enableFreeze,
	// que pierden el contexto y revientan con "useAuth must be used within an
	// AuthProvider" segundos después de arrancar
	const userRef = useRef<User | null>(null)
	useEffect(() => { userRef.current = user }, [user])

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
			let cachedUser: User | null = null
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
	 * @param params.accessToken - Bearer token from the API.
	 * @param params.me - `me` payload from the API.
	 * @param params.email - Login email; falls back to `me.email`.
	 * @returns The mapped user object now held in state.
	 */
	const completeSession = async ({ accessToken, me, email }: { accessToken: string, me: Me, email?: string }) => {

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
	const login = async (credentials: LoginCredentials) => {

		try {

			setError(null)

			// Call QvaPay API for authentication
			const apiResponse = await authApi.login(credentials)

			if (!apiResponse.success) {
				setError(apiResponse.error || i18n.t('hooks.authState.loginFailed'))
				return { success: false, error: apiResponse.error, details: apiResponse.details, status: apiResponse.status, action: apiResponse.action }
			}

			// If Prelogin is successful, we return the status and success
			if (apiResponse.status === 202) { return { success: true, status: apiResponse.status, notified: apiResponse.notified, has_otp: apiResponse.has_otp } }

			// Extract data from API response and establish the session
			// (el 200 completo siempre trae ambos; el tipo los deja opcionales
			// porque comparte forma con el 202)
			const { accessToken, me } = apiResponse
			await completeSession({ accessToken: accessToken as string, me: me as Me, email: credentials.email })

			return { success: true, security_warning: apiResponse.security_warning || null }

		} catch (e) {
			const err = e as { message?: string, details?: unknown }
			setError(i18n.t('hooks.authState.loginFailedRetry'))
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

			const { sessionId, ...options } = optionsResult.data!

			// 2. Authenticate with device passkey
			const { Passkey } = require('react-native-passkey')
			const assertion = await Passkey.get(options)

			// 3. Verify with server
			const verifyResult = await authApi.verifyPasskeyLogin({ sessionId, ...assertion })
			if (!verifyResult.success) { return { success: false, error: verifyResult.error } }

			// 4. Store credentials (same as regular login)
			const { accessToken, me } = verifyResult
			await completeSession({ accessToken: accessToken as string, me: me as Me, email: me?.email })

			return { success: true }

		} catch (e) {
			const err = e as { message?: string, code?: string }
			// User cancelled or passkey not available
			if (err?.message?.includes('cancel') || err?.code === 'ERR_PASSKEY_CANCELLED') {
				return { success: false, error: null } // silent cancel
			}
			setError(i18n.t('hooks.authState.passkeyLoginFailed'))
			return { success: false, error: err.message || i18n.t('hooks.authState.passkeyLoginFailed') }
		} finally { setIsLoading(false) }
	}

	/**
	 * Requests a login 2FA PIN to be sent to the user (email delivery).
	 *
	 * @param credentials - Email y password de la cuenta.
	 * @returns `{ success, message?, error? }`
	 */
	const requestPin = async (credentials: { email: string, password: string }) => {

		try {

			setError(null)
			const apiResponse = await authApi.requestPin(credentials)

			if (apiResponse.success) {
				// `message` no existe en la respuesta de requestPin (campo muerto
				// pre-existente); el cast preserva el runtime tal cual
				return { success: true, message: (apiResponse as { message?: string }).message }
			} else {
				setError(apiResponse.error)
				return { success: false, error: apiResponse.error }
			}
		}
		catch (e) {
			const err = e as { message?: string }
			setError(i18n.t('hooks.authState.requestPinFailed'))
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

		} catch (e) {
			const err = e as { message?: string }
			setError(i18n.t('hooks.authState.logoutFailed'))
			return { success: false, error: err.message }
		} finally { setIsLoading(false) }
	}

	/**
	 * Registers a new account. Does NOT create a session — the account still needs
	 * email confirmation (`confirmRegistration`) and the wizard signs in afterwards.
	 *
	 * @param credentials - Registration payload (name, email, password, ...).
	 * @returns `{ success, message?, user?, error? }`
	 */
	const register = async (credentials: RegisterCredentials) => {

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
			setError(i18n.t('hooks.authState.registerFailed'))
			return {
				success: false,
				error: i18n.t('hooks.authState.registerFailed')
			}
		} finally { setIsLoading(false) }
	}

	/**
	 * Confirms a fresh registration with the PIN emailed to the user.
	 *
	 * @param credentials - `{ uuid, email, pin }` del registro recién creado.
	 * @returns `{ success, message?, error?, details? }`
	 */
	const confirmRegistration = async (credentials: ConfirmRegistrationCredentials) => {
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
		catch (e) {
			const err = e as { message?: string }
			setError(i18n.t('hooks.authState.confirmRegistrationFailed'))
			return {
				success: false,
				error: err.message || i18n.t('hooks.authState.confirmRegistrationFailed'),
				details: {}
			}
		} finally { setIsLoading(false) }
	}

	/**
	 * Merges partial user data into state + the AsyncStorage cache and refreshes
	 * home-screen widgets with the latest balance. Local only — call the relevant
	 * API endpoint first; this just keeps the client copy in sync.
	 *
	 * @param newUserData - Partial user fields to merge over the current user.
	 * @returns `{ success, error? }`
	 */
	const updateUser = useCallback(async (newUserData: Partial<User>) => {
		try {
			const updatedUser = { ...userRef.current, ...newUserData }
			await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser))
			setUser(updatedUser)
			// Update home screen widgets with latest balance
			updateWidgetBalance(updatedUser.balance, updatedUser.username)
			reloadWidgets()
			return { success: true }
		} catch (e) {
			const err = e as { message?: string }
			setError(i18n.t('hooks.authState.updateUserFailed'))
			return { success: false, error: err.message }
		}
		// setUser/setError delegan en el dispatch estable del reducer
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

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
