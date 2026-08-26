import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiFailure, ApiResult, ApiSuccess } from '../types/api'
import type { Me } from '../types/domain'

/** Credenciales de `authApi.login`. */
export type LoginCredentials = {
	email: string
	password: string
	/** 2FA code (email PIN or 6-digit TOTP); empty on the first call. */
	two_factor_code?: string
}

/**
 * Resultado de `authApi.login`: tres formas según la fase del flujo —
 * 202 prelogin (2FA pendiente), 200 autenticado (token + `me`), o fallo
 * (con `status: null` cuando no hubo respuesta y `action` opcional del backend).
 */
export type LoginResult =
	| (ApiSuccess<unknown> & {
		/** 202 en el prelogin (2FA pendiente); ausente en el 200 completo. */
		status?: number
		notified?: unknown
		has_otp?: boolean
		accessToken?: string
		tokenType?: string
		me?: Me
		security_warning?: string | null
	})
	| (Omit<ApiFailure, 'status'> & { status: number | null, action?: string | null })

/** Resultado de `authApi.logout`: SIEMPRE `success: true` (best-effort). */
export type LogoutResult = ApiSuccess<unknown> & { error?: string }

/** Credenciales de `authApi.register`. */
export type RegisterCredentials = {
	name: string
	lastname: string
	email: string
	password: string
	/** Optional referral username. */
	invite?: string
	/** Optional acquisition source tag. */
	source?: string
	/** Terms acceptance (defaults to true). */
	terms?: boolean
}

/** Resultado de `authApi.register`: éxito con `message` y `user` extra. */
export type RegisterResult = (ApiSuccess<unknown> & { message?: string, user?: unknown }) | ApiFailure

/** Credenciales de `authApi.confirmRegistration`. */
export type ConfirmRegistrationCredentials = {
	/** UUID returned by `register`. */
	uuid: string
	email: string
	/** PIN received by email. */
	pin: string
}

/** Resultado de `authApi.confirmRegistration`: éxito con `message` extra. */
export type ConfirmRegistrationResult = (ApiSuccess<unknown> & { message?: string }) | ApiFailure

/** Resultado de `authApi.verifyPasskeyLogin`: espeja un `login` 200. */
export type PasskeyLoginResult =
	| (ApiSuccess<unknown> & { accessToken?: string, tokenType?: string, me?: Me })
	| ApiFailure

/** Resultado de `authApi.resetPassword`: éxito con `message` extra. */
export type ResetPasswordResult = (ApiSuccess<unknown> & { message?: string }) | ApiFailure

// Authentication API functions
export const authApi = {
	/**
	 * Logs a user in (`POST /auth/login`). Two-phase flow:
	 * - 202 = prelogin accepted, a 2FA challenge is pending → returns
	 *   `{ status: 202, success: true, notified, has_otp }` (`has_otp` true when
	 *   the user has TOTP configured; otherwise a 4-digit PIN was emailed).
	 * - 200 = fully authenticated → returns `accessToken`, `tokenType` and `me`
	 *   (the caller is responsible for persisting the token via `setAuthToken`).
	 * Always sends `remember: true` for a long-lived session.
	 *
	 * @param credentials - Login credentials
	 * @param credentials.email - User email
	 * @param credentials.password - User password
	 * @param credentials.two_factor_code - 2FA code (email PIN or 6-digit TOTP); empty on the first call
	 * @returns `{ success, status?, data?, accessToken?, tokenType?, me?, security_warning?, error?, details?, action? }`
	 */
	login: async (credentials: LoginCredentials): Promise<LoginResult> => {

		try {

			const response = await apiClient.post('/auth/login', {
				email: credentials.email,
				password: credentials.password,
				two_factor_code: credentials.two_factor_code || '',
				remember: true
			})

			// If Prelogin is successful, we return the status and success
			if (response.status === 202) { return { status: response.status, success: true, notified: response.data.notified, has_otp: response.data.has_otp || false } }

			// If Login is successful, we return the data, accessToken, tokenType and me
			return {
				success: true,
				data: response.data,
				accessToken: response.data.accessToken,
				tokenType: response.data.token_type,
				me: response.data.me,
				security_warning: response.data.security_warning || null,
			}

		} catch (err) {

			const error = err as ApiClientError

			// Handle specific API errors
			if (error?.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.message || errorData.error || i18n.t('api.auth.loginFailed'),
					details: errorData,
					status: error.response?.status ?? null,
					action: (errorData.action as string | null | undefined) || null,
				}
			}

			// Network or unexpected error
			const friendlyMessage = i18n.t('api.auth.connectFailed')
			return {
				success: false,
				error: error.message || friendlyMessage,
				status: error?.response?.status ?? null
			}
		}
	},

	/**
	 * Requests (or re-sends) the 2FA login PIN by email (`POST /auth/request-pin`).
	 * Used when the user did not receive the PIN from the initial 202 prelogin.
	 *
	 * @param credentials - Request PIN credentials
	 * @param credentials.email - User email
	 * @param credentials.password - User password
	 * @returns `{ success, data?, error?, status? }` — `data` echoes the backend confirmation message
	 */
	requestPin: async (credentials: { email: string, password: string }): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post('/auth/request-pin', {
				email: credentials.email,
				password: credentials.password
			})
			return { success: true, data: response.data }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.message || i18n.t('api.auth.requestPinFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response!.status }
		}
	},

	/**
	 * Revokes the current session server-side (`POST /auth/logout`, requires auth).
	 * Best-effort: resolves `success: true` even when the request fails, so local
	 * logout (clearing the Keychain token) always proceeds.
	 *
	 * @returns `{ success: true, data?, error?, status? }`
	 */
	logout: async (): Promise<LogoutResult> => {
		try {
			const response = await apiClient.post('/auth/logout')
			return { success: true, data: response.data }
		} catch (err) {
			const error = err as ApiClientError
			return { success: true, error: error.message, status: error.response!.status }
		}
	},

	/**
	 * Registers a new account (`POST /auth/register`, no auth).
	 * The account starts unverified — the backend emails a PIN that must be
	 * confirmed via `confirmRegistration` (or consumed by the login flow).
	 *
	 * @param credentials - Registration credentials
	 * @param credentials.name - User's first name
	 * @param credentials.lastname - User's last name
	 * @param credentials.email - User's email address
	 * @param credentials.password - User's password
	 * @param credentials.invite - Optional referral username
	 * @param credentials.source - Optional acquisition source tag
	 * @param credentials.terms - Terms acceptance (defaults to true)
	 * @returns `{ success, data?, message?, user?, error?, details? }` — `user` holds the created profile (incl. `uuid` for confirmation)
	 */
	register: async (credentials: RegisterCredentials): Promise<RegisterResult> => {
		try {
			const response = await apiClient.post('/auth/register', {
				name: credentials.name,
				lastname: credentials.lastname,
				email: credentials.email,
				password: credentials.password,
				invite: credentials.invite || undefined,
				source: credentials.source || undefined,
				terms: credentials.terms || true
			})
			return { success: true, data: response.data, message: response.data.message, user: response.data.user }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.auth.registerFailed'), details: errorData }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError') }
		}
	},

	/**
	 * Confirms a fresh registration with the emailed PIN
	 * (`POST /auth/confirm-registration`, no auth). Marks the email as verified.
	 *
	 * @param credentials - Confirmation credentials
	 * @param credentials.uuid - UUID returned by `register`
	 * @param credentials.email - The registered email
	 * @param credentials.pin - PIN received by email
	 * @returns `{ success, data?, message?, error?, details? }`
	 */
	confirmRegistration: async (credentials: ConfirmRegistrationCredentials): Promise<ConfirmRegistrationResult> => {
		try {
			const response = await apiClient.post('/auth/confirm-registration', {
				uuid: credentials.uuid,
				email: credentials.email,
				pin: credentials.pin
			})
			return { success: true, data: response.data, message: response.data.message }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || i18n.t('api.auth.confirmRegistrationFailed'),
					details: errorData
				}
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError') }
		}
	},

	// ── Passkeys (WebAuthn) ──────────────────────────────────────────

	/**
	 * Lists the user's registered passkeys (`GET /auth/passkey/list`, requires auth).
	 *
	 * @returns `{ success, data?, error? }` — `data` is the array of passkeys (id, name, created_at, ...)
	 */
	getPasskeys: async (): Promise<ApiResult<unknown[]>> => {
		try {
			const response = await apiClient.get('/auth/passkey/list')
			return { success: true, data: response.data.passkeys }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || i18n.t('api.auth.passkeysLoadFailed') }
		}
	},

	/**
	 * Deletes a passkey by ID (`POST /auth/passkey/delete`, requires auth).
	 *
	 * @param id - Passkey identifier from `getPasskeys`.
	 * @returns `{ success, error? }`
	 */
	deletePasskey: async (id: string | number): Promise<ApiResult<unknown>> => {
		try {
			await apiClient.post('/auth/passkey/delete', { id })
			return { success: true }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || i18n.t('api.auth.passkeyDeleteFailed') }
		}
	},

	/**
	 * Fetches WebAuthn creation options for enrolling a new passkey
	 * (`POST /auth/passkey/register-options`, requires auth). The options are
	 * handed to `react-native-passkey` to run the platform ceremony.
	 *
	 * @param name - Display name for the new passkey (e.g. device name).
	 * @returns `{ success, data?, error? }` — `data` is the WebAuthn `PublicKeyCredentialCreationOptions`
	 */
	getPasskeyRegisterOptions: async (name: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post('/auth/passkey/register-options', { name })
			return { success: true, data: response.data }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || i18n.t('api.auth.passkeyRegisterOptionsFailed') }
		}
	},

	/**
	 * Verifies the attestation from the platform ceremony and persists the new
	 * passkey (`POST /auth/passkey/register-verify`, requires auth).
	 *
	 * @param attestation - Attestation response produced by `react-native-passkey`.
	 * @returns `{ success, data?, error? }`
	 */
	verifyPasskeyRegistration: async (attestation: unknown): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post('/auth/passkey/register-verify', attestation)
			return { success: true, data: response.data }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || i18n.t('api.auth.passkeyRegisterVerifyFailed') }
		}
	},

	/**
	 * Fetches WebAuthn request options for passkey login
	 * (`POST /auth/passkey/login-options`, no auth required).
	 *
	 * @returns `{ success, data?, error? }` — `data` is the WebAuthn `PublicKeyCredentialRequestOptions`
	 */
	getPasskeyLoginOptions: async (): Promise<ApiResult<{ sessionId: string } & Record<string, unknown>>> => {
		try {
			const response = await apiClient.post('/auth/passkey/login-options')
			return { success: true, data: response.data }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || i18n.t('api.auth.passkeyLoginOptionsFailed') }
		}
	},

	/**
	 * Verifies the passkey assertion and completes login
	 * (`POST /auth/passkey/login-verify`, no auth required). On success the
	 * response mirrors a 200 `login`: `accessToken`, `tokenType` and `me`.
	 * Skips the password/2FA flow entirely.
	 *
	 * @param assertion - Assertion response produced by `react-native-passkey`.
	 * @returns `{ success, data?, accessToken?, tokenType?, me?, error? }`
	 */
	verifyPasskeyLogin: async (assertion: unknown): Promise<PasskeyLoginResult> => {
		try {
			const response = await apiClient.post('/auth/passkey/login-verify', assertion)
			return {
				success: true,
				data: response.data,
				accessToken: response.data.accessToken,
				tokenType: response.data.token_type,
				me: response.data.me,
			}
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || i18n.t('api.auth.passkeyLoginVerifyFailed') }
		}
	},

	/**
	 * Requests a password reset email (`POST /auth/reset-password`, no auth).
	 * The backend responds generically whether or not the email exists.
	 *
	 * @param credentials - Reset password credentials
	 * @param credentials.email - User email
	 * @returns `{ success, data?, message?, error?, details? }`
	 */
	resetPassword: async (credentials: { email: string }): Promise<ResetPasswordResult> => {
		try {
			const response = await apiClient.post('/auth/reset-password', {
				email: credentials.email
			})
			return {
				success: true,
				data: response.data,
				message: response.data.message,
			}
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || i18n.t('api.auth.resetPasswordFailed'),
					details: errorData
				}
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError') }
		}
	}
}
