import { apiClient } from './client'

export const userApi = {

    /**
     * Search for a user based on its uuid, username, email or verified phone number
     * @param {string} search - The uuid, username, email or verified phone number of the user to search for
     * @returns {Promise<Object>} The user data
     */
    searchUser: async (search) => {
        try {
            const response = await apiClient.post(`/user/search`, { query: search })
            return {
                success: true,
                data: response.data,
                status: response.status
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                status: error.response?.status
            }
        }
    },

    /**
     * Get current user profile data
     * @returns {Promise<Object>} The user profile data
     */
    getUserProfile: async () => {
        try {
            const response = await apiClient.get(`/user/extended`)
            return {
                success: true,
                data: response.data,
                status: response.status
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                status: error.response?.status
            }
        }
    },

    /**
     * Update current user data
     * @param {Object} userData - The user data to update
     * @returns {Promise<Object>} The updated user data
     */
    updateUser: async (userData) => {
        try {
            const response = await apiClient.put(`/user/update`, userData)
            return {
                success: true,
                data: response.data,
                status: response.status
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                status: error.response?.status
            }
        }
    },

    /**
     * Verify phone number
     * @param {Object} phoneData - The phone verification data
     * @param {string} phoneData.phone - The phone number
     * @param {string} phoneData.country - The country code
     * @param {string} phoneData.code - The verification code (optional, for verification step)
     * @param {boolean} phoneData.verify - Whether this is a verification step
     * @returns {Promise<Object>} The verification result
     */
    verifyPhone: async (phoneData) => {
        try {
            const response = await apiClient.post(`/user/verify/phone`, phoneData)
            return {
                success: true,
                data: response.data,
                status: response.status
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                status: error.response?.status
            }
        }
    }
}