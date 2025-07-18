import { apiClient } from '../../api/client'

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
            const response = await apiClient.get('/transaction', { params: filters })
            return response.data
        } catch (error) {
            console.error('Error getting latest transactions:', error)
            throw error
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
                amount,
                description,
                to,
                pin
            })
            return response.data
        } catch (error) {
            console.error('Error transferring money:', error)
            throw error
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
            return response.data
        } catch (error) {
            console.error('Error getting transaction details:', error)
            throw error
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
            return response.data
        } catch (error) {
            console.error('Error getting transaction PDF:', error)
            throw error
        }
    },

    // Pay a specific transaction Bill
    // TODO

}