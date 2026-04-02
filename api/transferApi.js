import { apiClient } from './client'

export const transferApi = {

    /**
     * 
     * @param {*} filters 
     * @param {string} filters.user_id
     * @param {string} filters.type
     * @param {string} filters.status
     * @param {string} filters.start_date
     * @param {string} filters.end_date
     * @param {string} filters.page
     * @param {string} filters.take
     * @returns {Promise<Object>} Latest transactions data
     */
    getLatestTransactions: async (filters) => {

        try {

            // Build query string
            const queryString = filters
                ? '?' + Object.entries(filters)
                    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
                    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
                    .join('&')
                : ''

            // Get latest transactions
            const response = await apiClient.get(`/transaction${queryString}`)

            // Return success response with data
            return {
                success: true,
                data: response.data,
                status: response.status
            }

        } catch (error) {

            // Return error response
            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.message || error.message,
                status: error.response?.status
            }
        }
    },

    /**
     * 
     * @param {*} filters 
     * @returns 
     */
    getLatestSentTransfers: async (take = 10) => {
        try {
            const response = await apiClient.get(`/transaction/latestusers?take=${take}`)
            return {
                success: true,
                data: response.data,
                status: response.status
            }
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.message || error.message,
                status: error.response?.status
            }
        }
        
    },

    /**
    /**
     * Transfer money to another user
     * @param {Object} data
     * @param {string|number} data.amount - Amount to transfer (e.g., "0.2")
     * @param {string} data.description - Description of the transfer
     * @param {string} data.to - Recipient's email or user identifier
     * @param {string|number} data.pin - User's PIN for authorization
     * @returns {Promise<Object>} Transfer response data
     *
     * Example request body:
     * {
     *   "amount": "0.2",
     *   "description": "July salary",
     *   "to": "ceo@qvapay.com",
     *   "pin": "1111"
     * }
     */
    transferMoney: async ({ amount, description, to, pin }) => {

        try {
            const response = await apiClient.post('/transaction/transfer', {
                amount: amount.toString(),
                description,
                to,
                pin: pin.toString()
            })

            return {
                success: true,
                data: response.data,
                status: response.status
            }

        } catch (error) {

            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.message || error.message,
                status: error.response?.status
            }
        }
    },


    /**
     * Get transaction details by uuid
     * @param {string} uuid
     * @returns {Promise<Object>} Transaction details
     */
    getTransactionDetails: async (uuid) => {
        try {

            const response = await apiClient.get(`/transaction/${uuid}`)

            return {
                success: true,
                data: response.data,
                status: response.status
            }

        } catch (error) {

            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.message || error.message,
                status: error.response?.status
            }
        }
    },


    /**
     * Get a transaction data as PDF
     * @param {string} uuid
     * @returns {Promise<Object>} Transaction PDF data
     */
    getTransactionPDF: async (uuid) => {
        try {
            const response = await apiClient.get(`/transaction/${uuid}/pdf`)
            return {
                success: true,
                data: response.data,
                status: response.status
            }
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.message || error.message,
                status: error.response?.status
            }
        }
    },

}