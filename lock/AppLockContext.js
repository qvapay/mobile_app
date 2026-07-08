import { createContext, use, useState, useEffect, useRef, useCallback } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import {
	getBiometricCredentials,
	getAppLockPin,
	setAppLockPin,
	hasAppLockPin,
	removeAppLockPin,
} from '../api/client'

const AppLockContext = createContext()

/**
 * PIN-based app lock that gates the UI behind `LockScreen` (rendered by
 * App.tsx whenever `isLocked` is true).
 *
 * - The PIN lives in the Keychain (service `com.qvapay.applock`), never in
 *   AsyncStorage; only `security.autoLockTimeout` (minutes) comes from settings.
 * - Cold start: locks immediately when authenticated and a PIN exists.
 * - Background/foreground: an AppState listener timestamps the moment the app
 *   leaves 'active' and re-locks on return only if the elapsed time reaches
 *   `autoLockTimeout` (default 5 min) — brief app switches don't lock.
 * - Unlock paths: `unlockWithPin` (compared against the Keychain value) or
 *   `unlockWithBiometrics`, which reads the login credentials from the
 *   `com.qvapay.biometrics` Keychain entry and thereby triggers the OS
 *   Face ID / Touch ID prompt.
 * - `isLocked` is exposed AND-ed with `isAuthenticated`, so logging out
 *   dismisses the lock screen automatically.
 *
 * @param {{ children: React.ReactNode }} props
 */
export const AppLockProvider = ({ children }) => {

	const { isAuthenticated, isLoading: authLoading } = useAuth()
	const { security, isLoading: settingsLoading, updateSetting } = useSettings()

	const [isLocked, setIsLocked] = useState(false)
	const [appLockEnabled, setAppLockEnabled] = useState(false)

	const isInitializedRef = useRef(false)
	const appStateRef = useRef(AppState.currentState)
	const backgroundTimestampRef = useRef(null)

	// Initialize: check if app lock PIN exists
	useEffect(() => {
		if (authLoading || settingsLoading) return
		const init = async () => {
			const hasPIN = await hasAppLockPin()
			setAppLockEnabled(hasPIN)

			// Cold start: lock immediately if authenticated and app lock is enabled
			if (isAuthenticated && hasPIN) { setIsLocked(true) }
			else if (!hasPIN) { setIsLocked(false) }
			isInitializedRef.current = true
		}
		init()
	}, [authLoading, settingsLoading, isAuthenticated])

	// AppState listener for background/foreground transitions
	useEffect(() => {
		const subscription = AppState.addEventListener('change', (nextAppState) => {
			const prevState = appStateRef.current
			appStateRef.current = nextAppState
			if (!isInitializedRef.current) return

			// Going to background: record timestamp
			if (prevState === 'active' && (nextAppState === 'background' || nextAppState === 'inactive')) {
				backgroundTimestampRef.current = Date.now()
			}

			// Coming to foreground: check if should lock
			if ((prevState === 'background' || prevState === 'inactive') && nextAppState === 'active') {
				if (backgroundTimestampRef.current && isAuthenticated && appLockEnabled) {
					const elapsed = Date.now() - backgroundTimestampRef.current
					const timeoutMs = (security.autoLockTimeout || 5) * 60 * 1000
					if (elapsed >= timeoutMs) {
						setIsLocked(true)
					}
				}
				backgroundTimestampRef.current = null
			}
		})

		return () => subscription.remove()
	}, [isAuthenticated, appLockEnabled, security.autoLockTimeout])

	/**
	 * Unlocks via Face ID / Touch ID. Success = the biometric-protected Keychain
	 * entry could be read (the OS prompt IS the authentication).
	 *
	 * @returns {Promise<{ success: boolean, error?: string }>}
	 */
	const unlockWithBiometrics = useCallback(async () => {
		try {
			const credentials = await getBiometricCredentials()
			if (credentials) {
				setIsLocked(false)
				return { success: true }
			}
			return { success: false, error: 'Autenticaci\u00f3n biom\u00e9trica cancelada' }
		} catch (error) {
			return { success: false, error: 'Error en autenticaci\u00f3n biom\u00e9trica' }
		}
	}, [])

	/**
	 * Unlocks by comparing the entered PIN with the one stored in the Keychain.
	 *
	 * @param {string} enteredPin
	 * @returns {Promise<{ success: boolean, error?: string }>}
	 */
	const unlockWithPin = useCallback(async (enteredPin) => {
		try {
			const storedPin = await getAppLockPin()
			if (storedPin && enteredPin === storedPin) {
				setIsLocked(false)
				return { success: true }
			}
			return { success: false, error: 'PIN incorrecto' }
		} catch (error) {
			return { success: false, error: 'Error verificando PIN' }
		}
	}, [])

	// Manual lock
	const lock = useCallback(() => {
		if (isAuthenticated && appLockEnabled) {
			setIsLocked(true)
		}
	}, [isAuthenticated, appLockEnabled])

	/**
	 * Enables app lock by storing a new PIN in the Keychain. Does not lock
	 * immediately — the lock arms on the next timeout/cold start (or via `lock`).
	 *
	 * @param {string} pin
	 * @returns {Promise<{ success: boolean, error?: string }>}
	 */
	const enableAppLock = useCallback(async (pin) => {
		const stored = await setAppLockPin(pin)
		if (stored) {
			setAppLockEnabled(true)
			return { success: true }
		}
		return { success: false, error: 'No se pudo guardar el PIN' }
	}, [])

	// Disable app lock
	const disableAppLock = useCallback(async () => {
		await removeAppLockPin()
		setAppLockEnabled(false)
		setIsLocked(false)
		return { success: true }
	}, [])

	/**
	 * Changes the app-lock PIN after verifying the current one.
	 *
	 * @param {string} oldPin - Current PIN (must match the stored value).
	 * @param {string} newPin - Replacement PIN.
	 * @returns {Promise<{ success: boolean, error?: string }>}
	 */
	const changeAppLockPin = useCallback(async (oldPin, newPin) => {
		const storedPin = await getAppLockPin()
		if (storedPin !== oldPin) {
			return { success: false, error: 'PIN actual incorrecto' }
		}
		const stored = await setAppLockPin(newPin)
		if (stored) {
			return { success: true }
		}
		return { success: false, error: 'No se pudo actualizar el PIN' }
	}, [])

	// Update auto lock timeout in settings
	const updateAutoLockTimeout = useCallback(async (minutes) => {
		await updateSetting('security', 'autoLockTimeout', minutes)
	}, [updateSetting])

	const value = {
		isLocked: isLocked && isAuthenticated, // derived: logging out clears the lock
		appLockEnabled,
		unlockWithBiometrics,
		unlockWithPin,
		lock,
		enableAppLock,
		disableAppLock,
		changeAppLockPin,
		updateAutoLockTimeout,
	}

	return (
		<AppLockContext.Provider value={value}>
			{children}
		</AppLockContext.Provider>
	)
}

/**
 * Consumes the app-lock context. Throws if used outside an `AppLockProvider`.
 *
 * @returns {{
 *   isLocked: boolean,
 *   appLockEnabled: boolean,
 *   unlockWithBiometrics: Function,
 *   unlockWithPin: Function,
 *   lock: () => void,
 *   enableAppLock: Function,
 *   disableAppLock: Function,
 *   changeAppLockPin: Function,
 *   updateAutoLockTimeout: (minutes: number) => Promise<void>,
 * }}
 */
export const useAppLock = () => {
	const context = use(AppLockContext)
	if (!context) { throw new Error('useAppLock must be used within an AppLockProvider') }
	return context
}
