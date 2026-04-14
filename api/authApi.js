import { apiClient } from './client'

// Authentication API functions
export const authApi = {
	/**
	 * Login user with email, password and 2FA code
	 * @param {Object} credentials - Login credentials
	 * @param {string} credentials.email - User email
	 * @param {string} credentials.password - User password
	 * @param {string} credentials.two_factor_code - 2FA code
	 * @returns {Promise<Object>} Login response with accessToken and user data
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
	 * Request PIN
	 * @param {Object} credentials - Request PIN credentials
	 * @param {string} credentials.email - User email
	 * @param {string} credentials.password - User password
	 * @returns {Promise<Object>} Request PIN response
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
	 * Logout user (if API supports it)
	 * @returns {Promise<Object>} Logout response
	 */
	logout: async () => {
		try {
			const response = await apiClient.post('/auth/logout')
			return { success: true, data: response.data }
		} catch (error) { return { success: true, error: error.message, status: error.response.status } }
	},

	/**
	 * Check if token is valid
	 * @param {string} token - Token to check
	 * @returns {Promise<Object>} Check token response
	 */
	checkToken: async () => {
		try {
			const response = await apiClient.post('/auth/check', null, { silent: true })
			if (response.data && response.data.success === 'Acceso permitido') {
				return { success: true, data: response.data }
			} else { return { success: false, error: response.data?.error || 'No se pudo verificar su sesión', data: response.data } }
		} catch (error) {
			if (error.response && error.response.data) { return { success: false, error: error.response.data.error || 'No se pudo verificar su sesión', status: error.response.status, data: error.response.data } }
			return { success: false, error: error.message || 'Ha ocurrido un error de red', isNetworkError: true }
		}
	},

	/**
	 * Register a new user
	 * @param {Object} credentials - Registration credentials
	 * @param {string} credentials.name - User's first name
	 * @param {string} credentials.lastname - User's last name
	 * @param {string} credentials.email - User's email address
	 * @param {string} credentials.password - User's password
	 * @param {string} credentials.invite - Optional referral username
	 * @param {boolean} credentials.terms - Terms acceptance
	 * @returns {Promise<Object>} Registration response with user data
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
	 * Confirm registration
	 * @param {Object} credentials - Confirmation credentials
	 * @param {string} credentials.uuid - User UUID
	 * @param {string} credentials.pin - User PIN
	 * @returns {Promise<Object>} Confirmation response
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
	 * List user's registered passkeys (requires auth)
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
	 * Delete a passkey by ID (requires auth)
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
	 * Get registration options for a new passkey (requires auth)
	 */
	getPasskeyRegisterOptions: async (name) => {
		try {
			const response = await apiClient.post('/auth/passkey/register-options', { name })
			return { success: true, data: response.data }
		} catch (error) {
			return { success: false, error: error.response?.data?.error || 'Error al generar opciones de registro' }
		}
	},

	/**
	 * Verify and save a new passkey registration (requires auth)
	 */
	verifyPasskeyRegistration: async (attestation) => {
		try {
			const response = await apiClient.post('/auth/passkey/register-verify', attestation)
			return { success: true, data: response.data }
		} catch (error) {
			return { success: false, error: error.response?.data?.error || 'Error al verificar el registro' }
		}
	},

	/**
	 * Get authentication options for passkey login (no auth required)
	 */
	getPasskeyLoginOptions: async () => {
		try {
			const response = await apiClient.post('/auth/passkey/login-options')
			return { success: true, data: response.data }
		} catch (error) { return { success: false, error: error.response?.data?.error || 'Error al generar opciones de autenticación' } }
	},

	/**
	 * Verify passkey authentication and login (no auth required)
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
	 * Request password reset
	 * @param {Object} credentials - Reset password credentials
	 * @param {string} credentials.email - User email
	 * @returns {Promise<Object>} Reset password response
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

// Export the apiClient for other API calls
export { apiClient }

// Export default for convenience
export default authApi
