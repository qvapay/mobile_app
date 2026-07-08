import { apiClient } from './client'

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
	 * @param {Object} credentials - Login credentials
	 * @param {string} credentials.email - User email
	 * @param {string} credentials.password - User password
	 * @param {string} [credentials.two_factor_code] - 2FA code (email PIN or 6-digit TOTP); empty on the first call
	 * @returns {Promise<Object>} `{ success, status?, data?, accessToken?, tokenType?, me?, security_warning?, error?, details?, action? }`
	 */
	login: async (credentials) => {

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

		} catch (error) {

			// Handle specific API errors
			if (error?.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.message || errorData.error || 'No se pudo iniciar sesión',
					details: errorData,
					status: error.response?.status ?? null,
					action: errorData.action || null,
				}
			}

			// Network or unexpected error
			const friendlyMessage = 'No se ha podido conectar al servidor'
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
	 * @param {Object} credentials - Request PIN credentials
	 * @param {string} credentials.email - User email
	 * @param {string} credentials.password - User password
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` echoes the backend confirmation message
	 */
	requestPin: async (credentials) => {
		try {
			const response = await apiClient.post('/auth/request-pin', {
				email: credentials.email,
				password: credentials.password
			})
			return { success: true, data: response.data }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.message || 'No se pudo solicitar el PIN', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response.status }
		}
	},

	/**
	 * Revokes the current session server-side (`POST /auth/logout`, requires auth).
	 * Best-effort: resolves `success: true` even when the request fails, so local
	 * logout (clearing the Keychain token) always proceeds.
	 *
	 * @returns {Promise<Object>} `{ success: true, data?, error?, status? }`
	 */
	logout: async () => {
		try {
			const response = await apiClient.post('/auth/logout')
			return { success: true, data: response.data }
		} catch (error) { return { success: true, error: error.message, status: error.response.status } }
	},

	/**
	 * Registers a new account (`POST /auth/register`, no auth).
	 * The account starts unverified — the backend emails a PIN that must be
	 * confirmed via `confirmRegistration` (or consumed by the login flow).
	 *
	 * @param {Object} credentials - Registration credentials
	 * @param {string} credentials.name - User's first name
	 * @param {string} credentials.lastname - User's last name
	 * @param {string} credentials.email - User's email address
	 * @param {string} credentials.password - User's password
	 * @param {string} [credentials.invite] - Optional referral username
	 * @param {string} [credentials.source] - Optional acquisition source tag
	 * @param {boolean} [credentials.terms] - Terms acceptance (defaults to true)
	 * @returns {Promise<Object>} `{ success, data?, message?, user?, error?, details? }` — `user` holds the created profile (incl. `uuid` for confirmation)
	 */
	register: async (credentials) => {
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
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo registrar', details: errorData }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red' }
		}
	},

	/**
	 * Confirms a fresh registration with the emailed PIN
	 * (`POST /auth/confirm-registration`, no auth). Marks the email as verified.
	 *
	 * @param {Object} credentials - Confirmation credentials
	 * @param {string} credentials.uuid - UUID returned by `register`
	 * @param {string} credentials.email - The registered email
	 * @param {string} credentials.pin - PIN received by email
	 * @returns {Promise<Object>} `{ success, data?, message?, error?, details? }`
	 */
	confirmRegistration: async (credentials) => {
		try {
			const response = await apiClient.post('/auth/confirm-registration', {
				uuid: credentials.uuid,
				email: credentials.email,
				pin: credentials.pin
			})
			return { success: true, data: response.data, message: response.data.message }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudo confirmar el registro',
					details: errorData
				}
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red' }
		}
	},

	// ── Passkeys (WebAuthn) ──────────────────────────────────────────

	/**
	 * Lists the user's registered passkeys (`GET /auth/passkey/list`, requires auth).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error? }` — `data` is the array of passkeys (id, name, created_at, ...)
	 */
	getPasskeys: async () => {
		try {
			const response = await apiClient.get('/auth/passkey/list')
			return { success: true, data: response.data.passkeys }
		} catch (error) {
			return { success: false, error: error.response?.data?.error || 'Error al obtener passkeys' }
		}
	},

	/**
	 * Deletes a passkey by ID (`POST /auth/passkey/delete`, requires auth).
	 *
	 * @param {string|number} id - Passkey identifier from `getPasskeys`.
	 * @returns {Promise<Object>} `{ success, error? }`
	 */
	deletePasskey: async (id) => {
		try {
			const response = await apiClient.post('/auth/passkey/delete', { id })
			return { success: true }
		} catch (error) {
			return { success: false, error: error.response?.data?.error || 'Error al eliminar passkey' }
		}
	},

	/**
	 * Fetches WebAuthn creation options for enrolling a new passkey
	 * (`POST /auth/passkey/register-options`, requires auth). The options are
	 * handed to `react-native-passkey` to run the platform ceremony.
	 *
	 * @param {string} name - Display name for the new passkey (e.g. device name).
	 * @returns {Promise<Object>} `{ success, data?, error? }` — `data` is the WebAuthn `PublicKeyCredentialCreationOptions`
	 */
	getPasskeyRegisterOptions: async (name) => {
		try {
			const response = await apiClient.post('/auth/passkey/register-options', { name })
			return { success: true, data: response.data }
		} catch (error) { return { success: false, error: error.response?.data?.error || 'Error al generar opciones de registro' } }
	},

	/**
	 * Verifies the attestation from the platform ceremony and persists the new
	 * passkey (`POST /auth/passkey/register-verify`, requires auth).
	 *
	 * @param {Object} attestation - Attestation response produced by `react-native-passkey`.
	 * @returns {Promise<Object>} `{ success, data?, error? }`
	 */
	verifyPasskeyRegistration: async (attestation) => {
		try {
			const response = await apiClient.post('/auth/passkey/register-verify', attestation)
			return { success: true, data: response.data }
		} catch (error) { return { success: false, error: error.response?.data?.error || 'Error al verificar el registro' } }
	},

	/**
	 * Fetches WebAuthn request options for passkey login
	 * (`POST /auth/passkey/login-options`, no auth required).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error? }` — `data` is the WebAuthn `PublicKeyCredentialRequestOptions`
	 */
	getPasskeyLoginOptions: async () => {
		try {
			const response = await apiClient.post('/auth/passkey/login-options')
			return { success: true, data: response.data }
		} catch (error) { return { success: false, error: error.response?.data?.error || 'Error al generar opciones de autenticación' } }
	},

	/**
	 * Verifies the passkey assertion and completes login
	 * (`POST /auth/passkey/login-verify`, no auth required). On success the
	 * response mirrors a 200 `login`: `accessToken`, `tokenType` and `me`.
	 * Skips the password/2FA flow entirely.
	 *
	 * @param {Object} assertion - Assertion response produced by `react-native-passkey`.
	 * @returns {Promise<Object>} `{ success, data?, accessToken?, tokenType?, me?, error? }`
	 */
	verifyPasskeyLogin: async (assertion) => {
		try {
			const response = await apiClient.post('/auth/passkey/login-verify', assertion)
			return {
				success: true,
				data: response.data,
				accessToken: response.data.accessToken,
				tokenType: response.data.token_type,
				me: response.data.me,
			}
		} catch (error) { return { success: false, error: error.response?.data?.error || 'Error al verificar la autenticación' } }
	},

	/**
	 * Requests a password reset email (`POST /auth/reset-password`, no auth).
	 * The backend responds generically whether or not the email exists.
	 *
	 * @param {Object} credentials - Reset password credentials
	 * @param {string} credentials.email - User email
	 * @returns {Promise<Object>} `{ success, data?, message?, error?, details? }`
	 */
	resetPassword: async (credentials) => {
		try {
			const response = await apiClient.post('/auth/reset-password', {
				email: credentials.email
			})
			return {
				success: true,
				data: response.data,
				message: response.data.message,
			}
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudo solicitar el restablecimiento de contraseña',
					details: errorData
				}
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red' }
		}
	}
}
