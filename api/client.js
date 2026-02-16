import axios from 'axios'
import DeviceInfo from 'react-native-device-info'
import * as Keychain from 'react-native-keychain'
import config from '../config'

const version = DeviceInfo.getVersion()
const buildNumber = DeviceInfo.getBuildNumber()
const deviceName = DeviceInfo.getDeviceName()

const API_BASE_URL = config.API_BASE_URL
const API_TIMEOUT = config.API_TIMEOUT

const KEYCHAIN_SERVICE = 'com.qvapay.auth'

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
			const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
			if (credentials) { config.headers.Authorization = `Bearer ${credentials.password}` }
		} catch (error) { console.warn('Failed to get token from keychain:', error) }
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
				case 403:
					try {
						await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
					} catch (clearError) { console.warn('Failed to clear token:', clearError) }
					break
				case 422:
					console.warn('Validation error:', data)
					break
				case 500:
					return Promise.reject({ message: "Ha ocurrido un error, contacte a soporte" })
				default:
					console.warn(`HTTP ${status} error:`, data)
			}
		} else if (error.request) {
			return Promise.reject({ message: "No se ha podido conectar con el servidor" })
		} else { return Promise.reject({ message: "Ha ocurrido un error inesperado" }) }

		return Promise.reject(error)
	}
)

// Helper functions - use Keychain for secure token storage
export const setAuthToken = async (token) => {
	try {
		await Keychain.setGenericPassword('token', token, { service: KEYCHAIN_SERVICE })
	} catch (error) { console.warn('Failed to store token:', error) }
}

export const getAuthToken = async () => {
	try {
		const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
		return credentials ? credentials.password : null
	} catch (error) {
		console.warn('Failed to get token:', error)
		return null
	}
}

// Helper function to remove auth token
export const removeAuthToken = async () => {
	try {
		await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
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
