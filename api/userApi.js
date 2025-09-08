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
    },

    /**
     * Remove phone number from user account
     * @returns {Promise<Object>} The removal result
     */
    removePhone: async () => {
        try {
            const response = await apiClient.put(`/user/verify/phone`)
            return { success: true, data: response.data, status: response.status }
        } catch (error) { return { success: false, error: error.message, status: error.response?.status } }
    },

    /**
     * Get Telegram verification link
     * @returns {Promise<Object>} The verification link
     */
    getTelegramVerificationLink: async () => {
        try {
            const response = await apiClient.get(`/user/verify/telegram`)
            return { success: true, data: response.data, status: response.status }
        } catch (error) { return { success: false, error: error.message, status: error.response?.status } }
    },

    /**
     * Remove Telegram account from user account
     * @returns {Promise<Object>} The removal result
     */
    removeTelegram: async () => {
        try {
            const response = await apiClient.put(`/user/verify/telegram`)
            return { success: true, data: response.data, status: response.status }
        } catch (error) { return { success: false, error: error.message, status: error.response?.status } }
    },

    /**
     * Change password
     * @param {Object} passwordData - The password data
     * @param {string} passwordData.current_password - The current password
     * @param {string} passwordData.new_password - The new password
     * @returns {Promise<Object>} The password change result
     */
    changePassword: async (passwordData) => {
        try {
            const response = await apiClient.put(`/user/update/password`, passwordData)
            return { success: true, data: response.data, status: response.status }
        } catch (error) { return { success: false, error: error.message, status: error.response?.status } }
    },

    /**
     * Get referral data including referrals list and earnings
     * @returns {Promise<Object>} The referral data
     */
    getReferrals: async () => {
        try {
            const response = await apiClient.get(`/user/referrals`)
            return { success: true, data: response.data, status: response.status }
        } catch (error) { return { success: false, error: error.message, status: error.response?.status } }
    },

    /**
     * Get referral link for sharing
     * @returns {Promise<Object>} The referral link
     */
    getReferralLink: async () => {
        try {
            const response = await apiClient.get(`/user/referral/link`)
            return { success: true, data: response.data, status: response.status }
        } catch (error) { return { success: false, error: error.message, status: error.response?.status } }
    }
}