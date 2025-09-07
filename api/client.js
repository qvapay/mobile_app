import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import DeviceInfo from 'react-native-device-info'

const version = DeviceInfo.getVersion()
const buildNumber = DeviceInfo.getBuildNumber()
const deviceName = DeviceInfo.getDeviceName()

// API Configuration
// const API_BASE_URL = 'https://api.qvapay.com'
const API_BASE_URL = 'http://192.168.0.10:3000/api'
const API_TIMEOUT = 20000 // 10 seconds

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
            const { status, data } = error.response
            switch (status) {
                case 401:
                    // Unauthorized - token expired or invalid
                    // Note: logout should be handled by the component using this client
                    // We'll clear the token here but let the component handle the actual logout
                    try {
                        await AsyncStorage.removeItem('token')
                    } catch (clearError) { console.warn('Failed to clear token:', clearError) }
                    break
                case 403:
                    // Forbidden
                    try {
                        await AsyncStorage.removeItem('token')
                    } catch (clearError) { console.warn('Failed to clear token:', clearError) }
                    break
                case 422:
                    // Validation error
                    console.warn('Validation error:', data)
                    break
                case 500:
                    return Promise.reject({ message: "Ha ocurrido un error, contacte a soporte" })
                // break
                default:
                    console.warn(`HTTP ${status} error:`, data)
            }
        } else if (error.request) {
            return Promise.reject({ message: "No se ha podido conectar con el servidor" })
        } else { return Promise.reject({ message: "Ha ocurrido un error inesperado" }) }

        return Promise.reject(error)
    }
)

// Helper functions
export const setAuthToken = async (token) => {
    try {
        await AsyncStorage.setItem('token', token)
    } catch (error) { console.warn('Failed to store token:', error) }
}

export const getAuthToken = async () => {
    try {
        const tokenData = await AsyncStorage.getItem('token')
        return tokenData || null
    } catch (error) {
        console.warn('Failed to get token:', error)
        return null
    }
}

// Helper function to remove auth token
export const removeAuthToken = async () => {
    try {
        await AsyncStorage.removeItem('token')
    } catch (error) {
        console.warn('Failed to remove token:', error)
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
