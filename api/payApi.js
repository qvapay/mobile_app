import { apiClient } from './client'

export const payApi = {

    /**
     * Pay a pending invoice/transaction created by another user (merchant app)
     * @param {string} uuid - Transaction uuid
     * @param {string} [comment] - Optional reaction/mood ('loved' | 'happy' | 'sad' | 'thumbsy' | '')
     * @returns {Promise<Object>} { success, data?, error?, status? }
     *
     * Example request body: { "comment": "loved" }
     */
    payTransaction: async (uuid, comment = '') => {
        try {
            const response = await apiClient.post(`/transaction/${uuid}/pay`, { comment })
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

export default payApi
