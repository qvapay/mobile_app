import axios from 'axios'
import DeviceInfo from 'react-native-device-info'
import * as Keychain from 'react-native-keychain'
import config from '../config'

const version = DeviceInfo.getVersion()
const buildNumber = DeviceInfo.getBuildNumber()
const deviceName = DeviceInfo.getDeviceNameSync()

const API_BASE_URL = config.API_BASE_URL
const API_TIMEOUT = config.API_TIMEOUT

// Keychain services — secrets live here, never in AsyncStorage:
//   com.qvapay.auth       → bearer auth token
//   com.qvapay.biometrics → Face ID / Touch ID login credentials (email + password)
//   com.qvapay.applock    → app-lock PIN
const KEYCHAIN_SERVICE = 'com.qvapay.auth'
const BIOMETRIC_SERVICE = 'com.qvapay.biometrics'
const APP_LOCK_SERVICE = 'com.qvapay.applock'

// Loading callbacks for global loading bar
let _loadingStart = null
let _loadingStop = null

/**
 * Wires the global loading bar (LoadingContext) into this client.
 * Called by `LoadingBridge` in App.tsx; every non-silent request then
 * starts/stops the bar through these callbacks.
 *
 * @param {Function} start - Invoked when a request begins.
 * @param {Function} stop - Invoked when a request settles (success or error).
 */
export const registerLoadingCallbacks = (start, stop) => {
	_loadingStart = start
	_loadingStop = stop
}

/**
 * Detaches the global loading bar from the client (e.g. on unmount).
 */
export const unregisterLoadingCallbacks = () => {
	_loadingStart = null
	_loadingStop = null
}

/**
 * Shared axios instance for every QvaPay API module (except `blogApi`, which
 * uses native `fetch`). Base URL comes from `config.js`: a LAN IP in `__DEV__`,
 * `https://api.qvapay.com` in production. Timeout is 20s.
 * The `X-QvaPay-Client-*` headers report app version, device name and build
 * number so the backend can identify mobile clients.
 */
const apiClient = axios.create({
	baseURL: API_BASE_URL,
	timeout: API_TIMEOUT,
	headers: {
		'Content-Type': 'application/json',
		'Accept': 'application/json',
		"X-QvaPay-Client": "QvaPayAPP",
		"User-Agent": "QvaPayClient",
		"X-QvaPay-Client-Version": version,
		"X-QvaPay-Client-Platform": deviceName,
		"X-QvaPay-Client-Platform-Version": buildNumber,
	},
})

/**
 * Request interceptor.
 * Attaches the bearer token from the Keychain (service `com.qvapay.auth`)
 * when one exists — requests simply go out unauthenticated otherwise — and
 * starts the global loading bar unless the request sets `config.silent = true`.
 */
apiClient.interceptors.request.use(
	async (reqConfig) => {
		if (!reqConfig.silent && _loadingStart) { _loadingStart() }
		try {
			const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
			if (credentials) { reqConfig.headers.Authorization = `Bearer ${credentials.password}` }
		} catch (err) { /* token retrieval failed */ }
		return reqConfig
	},
	(error) => {
		if (!error.config?.silent && _loadingStop) { _loadingStop() }
		return Promise.reject(error)
	}
)

/**
 * Response interceptor.
 * Stops the global loading bar and normalizes errors:
 *   401 → clears the Keychain token (next cold start lands on Welcome)
 *   403/422 → passed through untouched for the screen to handle
 *   500 → rejects with a generic Spanish support message
 *   no response (network/timeout) → rejects with a Spanish connectivity message
 * Gotcha: for 500 and network errors the rejection is a plain `{ message }`
 * object, not an axios error — there is no `.response` on it.
 */
apiClient.interceptors.response.use(
	(response) => {
		if (!response.config?.silent && _loadingStop) { _loadingStop() }
		return response
	},
	async (error) => {
		if (!error.config?.silent && _loadingStop) { _loadingStop() }
		// Handle common errors
		if (error.response) {
			const { status } = error.response
			switch (status) {
				case 401:
					// Invalid/expired/revoked token (authentication). The backend uses 401 ONLY
					// for this. Clear the token: on the next launch initializeAuth sees a null
					// token and routes to Welcome (the same logout mechanism that already exists).
					try {
						await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
					} catch (clearError) { /* token clear failed */ }
					break
				case 403:
				case 422:
					// 403 = no permission over the resource (private offer / block), NOT an auth
					// failure. Do NOT touch the token: clearing it desyncs state (token gone,
					// isAuthenticated=true) and logs the user out on the next cold start.
					// The screen handles these.
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

/**
 * Stores the bearer auth token in the Keychain (service `com.qvapay.auth`).
 * Fails silently — on a storage error the previous token (if any) survives.
 *
 * @param {string} token - Personal access token returned by `/auth/login`.
 */
export const setAuthToken = async (token) => {
	try {
		await Keychain.setGenericPassword('token', token, { service: KEYCHAIN_SERVICE })
	} catch (error) { /* token store failed */ }
}

/**
 * Reads the bearer auth token from the Keychain.
 *
 * @returns {Promise<string|null>} The token, or null when logged out or on read failure.
 */
export const getAuthToken = async () => {
	try {
		const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
		return credentials ? credentials.password : null
	} catch (error) {
		// token retrieval failed
		return null
	}
}

/**
 * Deletes the bearer auth token from the Keychain (logout and 401 cleanup).
 */
export const removeAuthToken = async () => {
	try {
		await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
	} catch (error) {
		// token removal failed
	}
}

// Biometric authentication helpers

/**
 * Detects the device's biometry capability.
 *
 * @returns {Promise<string|null>} 'FaceID', 'TouchID', 'Fingerprint', or null when unavailable.
 */
export const getSupportedBiometryType = async () => {
	try {
		const type = await Keychain.getSupportedBiometryType()
		return type // 'FaceID', 'TouchID', 'Fingerprint', or null
	} catch (error) {
		return null
	}
}

/**
 * Saves login credentials behind biometrics (service `com.qvapay.biometrics`).
 * Reading them back later requires Face ID / Touch ID or the device passcode.
 * The entry is device-only (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) — it never syncs
 * to iCloud or device backups.
 *
 * @param {string} email - Account email, stored as the Keychain username.
 * @param {string} password - Account password, stored as the Keychain secret.
 * @returns {Promise<boolean>} True when stored successfully.
 */
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

/**
 * Prompts for biometrics and returns the stored login credentials.
 * Checks that biometry is still available before prompting; if the read
 * fails (e.g. access control mismatch after the user changed their
 * enrolled biometrics), the corrupted entry is wiped so the next login
 * can re-enroll cleanly.
 *
 * @returns {Promise<{ email: string, password: string }|null>} Credentials, or null when unavailable/denied.
 */
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
		try { await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE }) } catch (_) { }
		return null
	}
}

/**
 * Deletes the biometric login credentials (user disabled biometric login).
 *
 * @returns {Promise<boolean>} True when removed successfully.
 */
export const removeBiometricCredentials = async () => {
	try {
		await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE })
		return true
	} catch (error) {
		return false
	}
}

/**
 * Checks whether biometric credentials exist WITHOUT triggering a biometric prompt.
 *
 * @returns {Promise<boolean>}
 */
export const hasBiometricCredentials = async () => {
	try {
		const credentials = await Keychain.hasGenericPassword({ service: BIOMETRIC_SERVICE })
		return !!credentials
	} catch (error) {
		return false
	}
}

// App Lock PIN helpers

/**
 * Stores the app-lock PIN (service `com.qvapay.applock`), used by
 * AppLockContext to gate the UI behind LockScreen. Device-only entry,
 * never synced or backed up.
 *
 * @param {string} pin - The PIN chosen by the user.
 * @returns {Promise<boolean>} True when stored successfully.
 */
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

/**
 * Reads the stored app-lock PIN.
 *
 * @returns {Promise<string|null>} The PIN, or null when app lock is not set up.
 */
export const getAppLockPin = async () => {
	try {
		const credentials = await Keychain.getGenericPassword({ service: APP_LOCK_SERVICE })
		return credentials ? credentials.password : null
	} catch (error) {
		return null
	}
}

/**
 * Checks whether an app-lock PIN is configured (without reading it).
 *
 * @returns {Promise<boolean>}
 */
export const hasAppLockPin = async () => {
	try {
		const credentials = await Keychain.hasGenericPassword({ service: APP_LOCK_SERVICE })
		return !!credentials
	} catch (error) {
		return false
	}
}

/**
 * Deletes the app-lock PIN (user disabled app lock).
 *
 * @returns {Promise<boolean>} True when removed successfully.
 */
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
