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
            if (response.status === 202) { return { status: response.status, success: true, notified: response.data.notified } }

            // If Login is successful, we return the data, accessToken, tokenType and me
            return {
                success: true,
                data: response.data,
                accessToken: response.data.accessToken,
                tokenType: response.data.token_type,
                me: response.data.me,
            }

        } catch (error) {

            // Handle specific API errors
            if (error.response?.data) {
                const errorData = error.response.data
                return { success: false, error: errorData.message || 'No se pudo iniciar sesión', details: errorData }
            }

            return { success: false, error: error.message || 'Ha ocurrido un error de red' }
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

            return {
                success: true,
                data: response.data,
            }

        } catch (error) {

            if (error.response?.data) {
                const errorData = error.response.data
                return { success: false, error: errorData.message || 'No se pudo solicitar el PIN', details: errorData }
            }

            return { success: false, error: error.message || 'Ha ocurrido un error de red' }
        }
    },

    /**
     * Logout user (if API supports it)
     * @returns {Promise<Object>} Logout response
     */
    logout: async () => {
        try {
            const response = await apiClient.get('/auth/logout')
            return {
                success: true,
                data: response.data,
            }
        } catch (error) {
            // Logout might not be supported by the API, so we don't treat it as an error
            console.warn('Logout API call failed:', error.message)
            return {
                success: true, // Consider logout successful even if API call fails
                error: error.message,
            }
        }
    },

    /**
     * Get current user profile
     * @returns {Promise<Object>} User profile data
     */
    getProfile: async () => {

        try {

            // Get the extended User Profile, we autenticated with the token on the apiClient interceptor
            const response = await apiClient.get('/user/extended')
            return {
                success: true,
                data: response.data,
                me: response.data,
            }

        } catch (error) {

            if (error.response?.data) {
                const errorData = error.response.data
                return {
                    success: false,
                    error: errorData.message || 'No se pudo obtener el perfil',
                    details: errorData,
                }
            }

            return {
                success: false,
                error: error.message || 'Ha ocurrido un error de red',
            }
        }
    },

    /**
     * Update user profile
     * @param {Object} profileData - Profile data to update
     * @returns {Promise<Object>} Update response
     */
    updateProfile: async (profileData) => {

        try {

            const response = await apiClient.put('/user/update', profileData)

            return {
                success: true,
                data: response.data,
                me: response.data,
            }

        } catch (error) {

            if (error.response?.data) {
                const errorData = error.response.data
                return {
                    success: false,
                    error: errorData.message || 'No se pudo actualizar el perfil',
                    details: errorData,
                }
            }

            return {
                success: false,
                error: error.message || 'Ha ocurrido un error de red',
            }
        }
    },

    /**
     * Check if token is valid
     * @param {string} token - Token to check
     * @returns {Promise<Object>} Check token response
     */
    checkToken: async () => {

        try {

            // The production endpoint expects a POST to /auth/check with the Authorization header
            const response = await apiClient.post('/auth/check')

            // The production API returns { success: 'Acceso permitido' } on success
            if (response.data && response.data.success === 'Acceso permitido') {
                return {
                    success: true,
                    data: response.data,
                }
            } else {
                return {
                    success: false,
                    error: response.data?.error || 'No se pudo verificar su sesión',
                    data: response.data,
                }
            }

        } catch (error) {
            // If the API returns 401 or other error, try to extract the error message
            if (error.response && error.response.data) {
                return {
                    success: false,
                    error: error.response.data.error || 'No se pudo verificar su sesión',
                    data: error.response.data,
                }
            }
            return {
                success: false,
                error: error.message || 'Ha ocurrido un error de red',
            }
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
                terms: credentials.terms || true
            })

            return {
                success: true,
                data: response.data,
                message: response.data.message,
                user: response.data.user,
            }

        } catch (error) {

            // Handle specific API errors
            if (error.response?.data) {
                const errorData = error.response.data
                return {
                    success: false,
                    error: errorData.error || errorData.message || 'No se pudo registrar',
                    details: errorData,
                }
            }

            return {
                success: false,
                error: error.message || 'Ha ocurrido un error de red',
            }
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

            return {
                success: true,
                data: response.data,
                message: response.data.message,
            }

        } catch (error) { 
            // Handle specific API errors
            if (error.response?.data) {
                const errorData = error.response.data
                return { 
                    success: false, 
                    error: errorData.error || errorData.message || 'No se pudo confirmar el registro', 
                    details: errorData 
                }
            }
            
            return { 
                success: false, 
                error: error.message || 'Ha ocurrido un error de red' 
            } 
        }
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
            // Handle specific API errors
            if (error.response?.data) {
                const errorData = error.response.data
                return { 
                    success: false, 
                    error: errorData.error || errorData.message || 'No se pudo solicitar el restablecimiento de contraseña', 
                    details: errorData 
                }
            }
            
            return { 
                success: false, 
                error: error.message || 'Ha ocurrido un error de red' 
            } 
        }
    }
}

// Export the apiClient for other API calls
export { apiClient }

// Export default for convenience
export default authApi
