import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import DeviceInfo from 'react-native-device-info'

const version = DeviceInfo.getVersion()
const buildNumber = DeviceInfo.getBuildNumber()
const deviceName = DeviceInfo.getDeviceName()

// API Configuration
const API_BASE_URL = 'https://api.qvapay.com'
const API_TIMEOUT = 20000 // 10 seconds

// Import the logout function from AuthContext
import { logout } from '../auth/AuthContext'

// Create axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: API_TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        "X-QvaPay-Client": "QvaPayAPP",
        "User-Agent": "QvaPayClient",
        "X-QvaPay-Client-Version": { version },
        "X-QvaPay-Client-Platform": { deviceName },
        "X-QvaPay-Client-Platform-Version": { buildNumber },
    },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
    async (config) => {
        try {
            const token = await AsyncStorage.getItem('token')
            console.log("token", token)
            if (token) { config.headers.Authorization = `Bearer ${token}` }
        } catch (error) { console.warn('Failed to get token from storage:', error) }
        return config
    },
    (error) => { return Promise.reject(error) }
)


// Response interceptor for error handling
apiClient.interceptors.response.use(
    (response) => { return response },
    async (error) => {
        // Handle common errors
        if (error.response) {
            // Server responded with error status
            const { status, data } = error.response

            switch (status) {
                case 401:
                    // Unauthorized - token expired or invalid
                    console.error('Authentication failed:', data)
                    await logout()
                    break
                case 403:
                    // Forbidden
                    console.error('Access forbidden:', data)
                    break
                case 422:
                    // Validation error
                    console.error('Validation error:', data)
                    break
                case 500:
                    // Server error
                    console.error('Server error:', data)
                    break
                default:
                    console.error(`HTTP ${status} error:`, data)
            }
        } else if (error.request) {
            // Network error
            console.error('Network error:', error.request)
        } else {
            // Other error
            console.error('Request error:', error.message)
        }

        return Promise.reject(error)
    }
)

// Helper functions
export const setAuthToken = async (token) => {
    try {
        await AsyncStorage.setItem('token', token)
    } catch (error) { console.error('Failed to store token:', error) }
}

export const getAuthToken = async () => {
    try {
        const tokenData = await AsyncStorage.getItem('token')
        return tokenData || null
    } catch (error) {
        console.error('Failed to get token:', error)
        return null
    }
}

export const removeAuthToken = async () => {
    try {
        await AsyncStorage.removeItem('token')
    } catch (error) {
        console.error('Failed to remove token:', error)
    }
}

// Helper function to create auth header
export const createAuthHeader = (token) => ({
    'Authorization': `Bearer ${token}`,
})

// Export the apiClient for other API calls
export { apiClient }

// Export default for convenience
export default apiClient
