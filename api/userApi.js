import { apiClient } from './client'

export const userApi = {

    /**
     * Search for a user based on its uuid, username, email or verified phone number
     * @param {string} search - The uuid, username, email or verified phone number of the user to search for
     * @returns {Promise<Object>} The user data
     */
    searchUser: async (search) => {

        try {

            // Call API to search for the user
            const response = await apiClient.post(`/user/search`, { query: search })

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
                error: error.message,
                status: error.response?.status
            }
        }
    }
}