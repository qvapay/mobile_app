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
const BIOMETRIC_SERVICE = 'com.qvapay.biometrics'
const APP_LOCK_SERVICE = 'com.qvapay.applock'

// Loading callbacks for global loading bar
let _loadingStart = null
let _loadingStop = null

export const registerLoadingCallbacks = (start, stop) => {
	_loadingStart = start
	_loadingStop = stop
}

export const unregisterLoadingCallbacks = () => {
	_loadingStart = null
	_loadingStop = null
}

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
		if (!config.silent && _loadingStart) { _loadingStart() }
		try {
			const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
			if (credentials) { config.headers.Authorization = `Bearer ${credentials.password}` }
		} catch (error) { /* token retrieval failed */ }
		return config
	},
	(error) => {
		if (!error.config?.silent && _loadingStop) { _loadingStop() }
		return Promise.reject(error)
	}
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
	(response) => {
		if (!response.config?.silent && _loadingStop) { _loadingStop() }
		return response
	},
	async (error) => {
		if (!error.config?.silent && _loadingStop) { _loadingStop() }
		// Handle common errors
		if (error.response) {
			const { status, data } = error.response
			switch (status) {
				case 403:
					try {
						await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
					} catch (clearError) { /* token clear failed */ }
					break
				case 401:
				case 422:
					break
				case 500:
					return Promise.reject({ message: "Ha ocurrido un error, contacte a soporte" })
				default:
					break
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
	} catch (error) { /* token store failed */ }
}

export const getAuthToken = async () => {
	try {
		const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
		return credentials ? credentials.password : null
	} catch (error) {
		// token retrieval failed
		return null
	}
}

// Helper function to remove auth token
export const removeAuthToken = async () => {
	try {
		await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
	} catch (error) {
		// token removal failed
	}
}

// Helper function to create auth header
export const createAuthHeader = (token) => ({
	'Authorization': `Bearer ${token}`,
})

// Biometric authentication helpers
export const getSupportedBiometryType = async () => {
	try {
		const type = await Keychain.getSupportedBiometryType()
		return type // 'FaceID', 'TouchID', 'Fingerprint', or null
	} catch (error) {
		return null
	}
}

export const setBiometricCredentials = async (email, password) => {
	try {
		await Keychain.setGenericPassword(email, password, {
			service: BIOMETRIC_SERVICE,
			accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
			accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
		})
		return true
	} catch (error) {
		return false
	}
}

export const getBiometricCredentials = async () => {
	try {
		// Verify biometry is still available before prompting
		const biometryType = await Keychain.getSupportedBiometryType()
		if (!biometryType) return null

		const credentials = await Keychain.getGenericPassword({
			service: BIOMETRIC_SERVICE,
			authenticationPrompt: { title: 'Accede a tu cuenta QvaPay' },
		})
		if (credentials) {
			return { email: credentials.username, password: credentials.password }
		}
		return null
	} catch (error) {
		// If reading fails (e.g. access control mismatch), clean up corrupted entry
		try { await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE }) } catch (_) {}
		return null
	}
}

export const removeBiometricCredentials = async () => {
	try {
		await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE })
		return true
	} catch (error) {
		return false
	}
}

export const hasBiometricCredentials = async () => {
	try {
		const credentials = await Keychain.hasGenericPassword({ service: BIOMETRIC_SERVICE })
		return !!credentials
	} catch (error) {
		return false
	}
}

// App Lock PIN helpers
export const setAppLockPin = async (pin) => {
	try {
		await Keychain.setGenericPassword('applock', pin, {
			service: APP_LOCK_SERVICE,
			accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
		})
		return true
	} catch (error) {
		return false
	}
}

export const getAppLockPin = async () => {
	try {
		const credentials = await Keychain.getGenericPassword({ service: APP_LOCK_SERVICE })
		return credentials ? credentials.password : null
	} catch (error) {
		return null
	}
}

export const hasAppLockPin = async () => {
	try {
		const credentials = await Keychain.hasGenericPassword({ service: APP_LOCK_SERVICE })
		return !!credentials
	} catch (error) {
		return false
	}
}

export const removeAppLockPin = async () => {
	try {
		await Keychain.resetGenericPassword({ service: APP_LOCK_SERVICE })
		return true
	} catch (error) {
		return false
	}
}

// Export the apiClient for other API calls
export { apiClient }

// Export default for convenience
export default apiClient
