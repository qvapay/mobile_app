import { createContext, use, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { AppState } from 'react-native'
import type { AppStateStatus } from 'react-native'
import i18n from '../i18n'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import {
	getBiometricCredentials,
	getAppLockPin,
	setAppLockPin,
	hasAppLockPin,
	removeAppLockPin,
} from '../api/client'

/** Result shape of every unlock/enable/disable/change operation. */
export type AppLockResult = { success: boolean, error?: string }

/** App-lock state + actions exposed by `useAppLock`. */
export type AppLockContextValue = {
	isLocked: boolean
	appLockEnabled: boolean
	unlockWithBiometrics: () => Promise<AppLockResult>
	unlockWithPin: (enteredPin: string) => Promise<AppLockResult>
	lock: () => void
	enableAppLock: (pin: string) => Promise<AppLockResult>
	disableAppLock: () => Promise<AppLockResult>
	changeAppLockPin: (oldPin: string, newPin: string) => Promise<AppLockResult>
	updateAutoLockTimeout: (minutes: number) => Promise<void>
}

const AppLockContext = createContext<AppLockContextValue | undefined>(undefined)

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
 */
export const AppLockProvider = ({ children }: { children: ReactNode }) => {

	const { isAuthenticated, isLoading: authLoading } = useAuth()
	const { security, isLoading: settingsLoading, updateSetting } = useSettings()

	const [isLocked, setIsLocked] = useState(false)
	const [appLockEnabled, setAppLockEnabled] = useState(false)

	const isInitializedRef = useRef(false)
	const appStateRef = useRef<AppStateStatus>(AppState.currentState)
	const backgroundTimestampRef = useRef<number | null>(null)

	// Initialize: check if app lock PIN exists
	useEffect(() => {
		if (authLoading || settingsLoading) return
		let cancelled = false
		const init = async () => {
			const hasPIN = await hasAppLockPin()
			if (cancelled) return
			setAppLockEnabled(hasPIN)

			// Cold start: lock immediately if authenticated and app lock is enabled
			if (isAuthenticated && hasPIN) { setIsLocked(true) }
			else if (!hasPIN) { setIsLocked(false) }
			isInitializedRef.current = true
		}
		init()
		return () => { cancelled = true }
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
	 */
	const unlockWithBiometrics = useCallback(async (): Promise<AppLockResult> => {
		try {
			const credentials = await getBiometricCredentials()
			if (credentials) {
				setIsLocked(false)
				return { success: true }
			}
			return { success: false, error: i18n.t('misc.lock.errors.biometricCanceled') }
		} catch (error) {
			return { success: false, error: i18n.t('misc.lock.errors.biometricError') }
		}
	}, [])

	/**
	 * Unlocks by comparing the entered PIN with the one stored in the Keychain.
	 */
	const unlockWithPin = useCallback(async (enteredPin: string): Promise<AppLockResult> => {
		try {
			const storedPin = await getAppLockPin()
			if (storedPin && enteredPin === storedPin) {
				setIsLocked(false)
				return { success: true }
			}
			return { success: false, error: i18n.t('misc.lock.errors.wrongPin') }
		} catch (error) {
			return { success: false, error: i18n.t('misc.lock.errors.verifyPin') }
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
	 */
	const enableAppLock = useCallback(async (pin: string): Promise<AppLockResult> => {
		const stored = await setAppLockPin(pin)
		if (stored) {
			setAppLockEnabled(true)
			return { success: true }
		}
		return { success: false, error: i18n.t('misc.lock.errors.savePin') }
	}, [])

	// Disable app lock
	const disableAppLock = useCallback(async (): Promise<AppLockResult> => {
		await removeAppLockPin()
		setAppLockEnabled(false)
		setIsLocked(false)
		return { success: true }
	}, [])

	/**
	 * Changes the app-lock PIN after verifying the current one.
	 *
	 * @param oldPin - Current PIN (must match the stored value).
	 * @param newPin - Replacement PIN.
	 */
	const changeAppLockPin = useCallback(async (oldPin: string, newPin: string): Promise<AppLockResult> => {
		const storedPin = await getAppLockPin()
		if (storedPin !== oldPin) {
			return { success: false, error: i18n.t('misc.lock.errors.currentPinWrong') }
		}
		const stored = await setAppLockPin(newPin)
		if (stored) {
			return { success: true }
		}
		return { success: false, error: i18n.t('misc.lock.errors.updatePin') }
	}, [])

	// Update auto lock timeout in settings
	const updateAutoLockTimeout = useCallback(async (minutes: number) => {
		await updateSetting('security', 'autoLockTimeout', minutes)
	}, [updateSetting])

	const value = useMemo<AppLockContextValue>(() => ({
		isLocked: isLocked && isAuthenticated, // derived: logging out clears the lock
		appLockEnabled,
		unlockWithBiometrics,
		unlockWithPin,
		lock,
		enableAppLock,
		disableAppLock,
		changeAppLockPin,
		updateAutoLockTimeout,
	}), [isLocked, isAuthenticated, appLockEnabled, unlockWithBiometrics, unlockWithPin, lock, enableAppLock, disableAppLock, changeAppLockPin, updateAutoLockTimeout])

	return (
		<AppLockContext.Provider value={value}>
			{children}
		</AppLockContext.Provider>
	)
}

/**
 * Consumes the app-lock context. Throws if used outside an `AppLockProvider`.
 *
 * @returns Lock state (`isLocked`, `appLockEnabled`) and actions
 *   (`unlockWithBiometrics`, `unlockWithPin`, `lock`, `enableAppLock`,
 *   `disableAppLock`, `changeAppLockPin`, `updateAutoLockTimeout`).
 */
export const useAppLock = (): AppLockContextValue => {
	const context = use(AppLockContext)
	if (!context) { throw new Error('useAppLock must be used within an AppLockProvider') }
	return context
}
