import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import {
	getBiometricCredentials,
	hasBiometricCredentials,
	getSupportedBiometryType,
	getAppLockPin,
	setAppLockPin,
	hasAppLockPin,
	removeAppLockPin,
} from '../api/client'

const AppLockContext = createContext()

export const AppLockProvider = ({ children }) => {

	const { isAuthenticated, isLoading: authLoading } = useAuth()
	const { security, isLoading: settingsLoading, updateSetting } = useSettings()

	const [isLocked, setIsLocked] = useState(false)
	const [appLockEnabled, setAppLockEnabled] = useState(false)
	const [isInitialized, setIsInitialized] = useState(false)

	const appStateRef = useRef(AppState.currentState)
	const backgroundTimestampRef = useRef(null)

	// Initialize: check if app lock PIN exists
	useEffect(() => {
		if (authLoading || settingsLoading) return
		const init = async () => {
			const hasPIN = await hasAppLockPin()
			setAppLockEnabled(hasPIN)

			// Cold start: lock immediately if authenticated and app lock is enabled
			if (isAuthenticated && hasPIN) {
				setIsLocked(true)
			}
			setIsInitialized(true)
		}
		init()
	}, [authLoading, settingsLoading, isAuthenticated])

	// Unlock when user logs out
	useEffect(() => {
		if (!isAuthenticated && isInitialized) {
			setIsLocked(false)
		}
	}, [isAuthenticated, isInitialized])

	// AppState listener for background/foreground transitions
	useEffect(() => {
		if (!isInitialized) return

		const subscription = AppState.addEventListener('change', (nextAppState) => {
			const prevState = appStateRef.current

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

			appStateRef.current = nextAppState
		})

		return () => subscription.remove()
	}, [isInitialized, isAuthenticated, appLockEnabled, security.autoLockTimeout])

	// Unlock with biometrics
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

	// Unlock with PIN
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

	// Enable app lock with a new PIN
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

	// Change app lock PIN
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
		isLocked,
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

export const useAppLock = () => {
	const context = useContext(AppLockContext)
	if (!context) { throw new Error('useAppLock must be used within an AppLockProvider') }
	return context
}
