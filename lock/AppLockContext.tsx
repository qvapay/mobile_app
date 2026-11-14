import { createContext, use, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { AppState } from 'react-native'
import i18n from '../i18n'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import { useWallet } from '../wallet/WalletContext'
import {
	getAppLockPin,
	setAppLockPin,
	hasAppLockPin,
	removeAppLockPin,
	getSupportedBiometryType,
} from '../api/client'
import { authenticateBiometricMarker, disableBiometricMarker, enableBiometricMarker, hasBiometricMarker } from '../helpers/biometricMarker'
import { confirmDeviceOwner, ownerProofPasses } from '../helpers/deviceOwnerProof'
import { hasWalletMnemonic } from '../wallet/keystore'

/** Marcador biométrico PROPIO del bloqueo: Face ID aunque se entrara con passkey. */
export const APP_LOCK_BIO_SERVICE = 'com.qvapay.applock.bio'

/** Result shape of every unlock/enable/disable/change operation. */
export type AppLockResult = { success: boolean, error?: string }

/** App-lock state + actions exposed by `useAppLock`. */
export type AppLockContextValue = {
	isLocked: boolean
	/**
	 * El arranque en frío ya decidió si toca bloquear (el PIN se lee del Keychain,
	 * asíncrono). Hasta entonces `isLocked: false` todavía no significa nada: quien
	 * presente algo encima de la app al arrancar (Novedades) espera a esto.
	 */
	isReady: boolean
	/**
	 * Cortina opaca mientras la app está en segundo plano con el bloqueo activo:
	 * al volver, nada de la app se ve ni recibe toques (ni el botón atrás) hasta
	 * decidir si toca bloquear. La pinta LockScreen, sin teclado ni biometría.
	 */
	isCovered: boolean
	appLockEnabled: boolean
	unlockWithBiometrics: () => Promise<AppLockResult>
	unlockWithPin: (enteredPin: string) => Promise<AppLockResult>
	lock: () => void
	/**
	 * Crea el PIN. Con una wallet ya en el teléfono pide antes la prueba de dueño del
	 * dispositivo (huella/cara o su código): ese PIN pasa a proteger la frase. Si ya hay
	 * un PIN no lo pisa: para eso está `changeAppLockPin`.
	 */
	enableAppLock: (pin: string) => Promise<AppLockResult>
	/** Quita el PIN. Exige el actual, y se niega mientras haya una wallet en el teléfono. */
	disableAppLock: (currentPin: string) => Promise<AppLockResult>
	/**
	 * Retira un PIN que ya no protege nada (ni sesión ni wallet). Solo para «Eliminar wallet»
	 * en modo sin cuenta; con algo que proteger no hace nada y devuelve false.
	 */
	releaseUnusedAppLock: () => Promise<boolean>
	changeAppLockPin: (oldPin: string, newPin: string) => Promise<AppLockResult>
	updateAutoLockTimeout: (minutes: number) => Promise<void>
	/** Face ID/Touch ID del bloqueo con marcador propio: encender lo arma, apagar lo borra. */
	setAppLockBiometrics: (enabled: boolean) => Promise<void>
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
 * - Al pasar a 'background' se corre la cortina (`isCovered`) y al volver se
 *   retira en el MISMO render que decide el bloqueo: sin ella, la app quedaba a
 *   la vista y respondía unos instantes antes de que saliera el bloqueo.
 * - Unlock paths: `unlockWithPin` (compared against the Keychain value) or
 *   `unlockWithBiometrics`, que solo acepta el marcador biométrico propio
 *   (helpers/biometricMarker: un diálogo nuestro en cada uso).
 * - Lo que se protege es la sesión O la wallet self-custody: sin cuenta pero
 *   con seed en el teléfono (modo wallet) el bloqueo arma igual.
 * - Con una wallet, este PIN es además lo ÚNICO que separa a quien tenga el
 *   teléfono desbloqueado de su frase (`WalletAuthModal`). Por eso el PIN no se
 *   puede quitar mientras exista (solo cambiar, con el actual), quitarlo sin
 *   wallet también pide el actual, y crear el primero con una wallet ya puesta
 *   exige la prueba de dueño del dispositivo. Sin esas tres reglas bastaba con
 *   desactivar el bloqueo y crear un PIN nuevo para ver la frase.
 * - `isLocked` is exposed AND-ed with that subject, so logging out without a
 *   wallet dismisses the lock screen automatically.
 */
export const AppLockProvider = ({ children }: { children: ReactNode }) => {

	const { isAuthenticated, isLoading: authLoading } = useAuth()
	const { hasWallet, isReady: walletReady } = useWallet()
	// Hay algo que proteger: la sesión QvaPay o la seed de la wallet
	const lockable = isAuthenticated || hasWallet
	// La wallet cuenta en el arranque en frío, NO al crearla: el alta sin cuenta
	// crea el PIN justo antes de la seed y bloquear ahí cortaría el backup
	const hasWalletRef = useRef(hasWallet)
	useEffect(() => { hasWalletRef.current = hasWallet }, [hasWallet])
	const isAuthenticatedRef = useRef(isAuthenticated)
	useEffect(() => { isAuthenticatedRef.current = isAuthenticated }, [isAuthenticated])
	const { security, isLoading: settingsLoading, updateSetting } = useSettings()

	const [isLocked, setIsLocked] = useState(false)
	const [isCovered, setIsCovered] = useState(false)
	const [isReady, setIsReady] = useState(false)
	const [appLockEnabled, setAppLockEnabled] = useState(false)

	const isInitializedRef = useRef(false)
	const appStateRef = useRef(AppState.currentState)
	const backgroundTimestampRef = useRef<number | null>(null)

	// Initialize: check if app lock PIN exists
	useEffect(() => {
		if (authLoading || settingsLoading || !walletReady) return
		let cancelled = false
		const init = async () => {
			const hasPIN = await hasAppLockPin()
			if (cancelled) return
			setAppLockEnabled(hasPIN)

			// SOLO en arranque en frío: bloquear si hay algo que proteger y PIN.
			// Un login a mitad de sesión (p. ej. desde el modo wallet, que ya pasó
			// el bloqueo) acaba de autenticarse con contraseña: re-bloquear ahí
			// pedía el PIN dos veces seguidas. Igual con la wallet recién creada
			const coldStart = !isInitializedRef.current
			if (coldStart && (isAuthenticated || hasWalletRef.current) && hasPIN) { setIsLocked(true) }
			// Sin PIN, o sin nada que proteger (la sesión cayó y no hay wallet): el
			// bloqueo interno se limpia. Si no, quedaba dormido tras `lockable` y
			// reaparecía al crear después una wallet de invitado, en pleno backup
			else if (!hasPIN || (!isAuthenticated && !hasWalletRef.current)) { setIsLocked(false) }
			isInitializedRef.current = true
			// Mismo lote que el `setIsLocked` de arriba: nadie ve «listo» sin el bloqueo ya puesto
			setIsReady(true)
		}
		init()
		return () => { cancelled = true }
	}, [authLoading, settingsLoading, walletReady, isAuthenticated])

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
			// Solo 'background': 'inactive' (iOS) también salta con el propio Face ID
			if (nextAppState === 'background' && lockable && appLockEnabled) setIsCovered(true)

			// Coming to foreground: check if should lock
			if ((prevState === 'background' || prevState === 'inactive') && nextAppState === 'active') {
				if (backgroundTimestampRef.current && lockable && appLockEnabled) {
					const elapsed = Date.now() - backgroundTimestampRef.current
					const timeoutMs = (security.autoLockTimeout || 5) * 60 * 1000
					if (elapsed >= timeoutMs) {
						setIsLocked(true)
					}
				}
				backgroundTimestampRef.current = null
				// Mismo render que el bloqueo: LockScreen pasa de cortina a bloqueo sin hueco
				setIsCovered(false)
			}
		})

		return () => subscription.remove()
	}, [lockable, appLockEnabled, security.autoLockTimeout])

	/**
	 * Unlocks via Face ID / Touch ID / huella. Success = the user authenticated
	 * in our own prompt just now (see helpers/biometricMarker).
	 */
	const unlockWithBiometrics = useCallback(async (): Promise<AppLockResult> => {
		try {
			// SOLO el marcador propio. Las credenciales biométricas del login ya no
			// desbloquean: aceptan el código del teléfono y, en Android, se leen sin
			// diálogo en los 5 s siguientes a desbloquear el móvil. Sin marcador, el
			// siguiente PIN correcto lo arma (`armBiometrics`)
			if (await hasBiometricMarker(APP_LOCK_BIO_SERVICE) && await authenticateBiometricMarker(APP_LOCK_BIO_SERVICE, i18n.t('misc.lock.bioPrompt'))) {
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
	// PIN correcto con biometría soportada y deseada: arma el marcador propio (best-effort)
	const armBiometrics = useCallback(async () => {
		if (security.appLockBiometrics === false) return
		if (!(await getSupportedBiometryType())) return
		if (!(await hasBiometricMarker(APP_LOCK_BIO_SERVICE))) enableBiometricMarker(APP_LOCK_BIO_SERVICE).catch(() => {})
	}, [security.appLockBiometrics])

	const unlockWithPin = useCallback(async (enteredPin: string): Promise<AppLockResult> => {
		try {
			const storedPin = await getAppLockPin()
			if (storedPin && enteredPin === storedPin) {
				setIsLocked(false)
				armBiometrics()
				return { success: true }
			}
			return { success: false, error: i18n.t('misc.lock.errors.wrongPin') }
		} catch (error) {
			return { success: false, error: i18n.t('misc.lock.errors.verifyPin') }
		}
	}, [armBiometrics])

	// Manual lock
	const lock = useCallback(() => {
		if (lockable && appLockEnabled) {
			setIsLocked(true)
		}
	}, [lockable, appLockEnabled])

	/**
	 * ¿Hay una wallet en el teléfono? Manda el Keychain, además del contexto: una seed que
	 * el contexto no llegó a cargar (metadata perdida, lectura fallida) sigue necesitando
	 * su PIN, y ante la duda se protege.
	 */
	const walletPresent = useCallback(async (): Promise<boolean> => hasWalletRef.current || await hasWalletMnemonic(), [])

	const clearPin = useCallback(async () => {
		await removeAppLockPin()
		await disableBiometricMarker(APP_LOCK_BIO_SERVICE)
		setAppLockEnabled(false)
		setIsLocked(false)
	}, [])

	/**
	 * Enables app lock by storing a new PIN in the Keychain. Does not lock
	 * immediately — the lock arms on the next timeout/cold start (or via `lock`).
	 */
	const enableAppLock = useCallback(async (pin: string): Promise<AppLockResult> => {
		// Un PIN ya puesto no se pisa: cambiarlo exige conocer el actual
		if (await hasAppLockPin()) return { success: false, error: i18n.t('misc.lock.errors.pinExists') }
		// Wallet sin PIN: quien lo cree se queda con la llave de la frase, así que antes
		// tiene que probar que el teléfono es suyo (huella/cara o su código)
		if (await walletPresent()) {
			const proof = await confirmDeviceOwner(i18n.t('misc.lock.ownerProof.title'), i18n.t('misc.lock.ownerProof.subtitle'))
			if (!ownerProofPasses(proof)) {
				return { success: false, error: i18n.t(proof === 'cancelled' ? 'misc.lock.errors.ownerProofCancelled' : 'misc.lock.errors.ownerProofFailed') }
			}
		}
		const stored = await setAppLockPin(pin)
		if (stored) {
			setAppLockEnabled(true)
			armBiometrics()
			return { success: true }
		}
		return { success: false, error: i18n.t('misc.lock.errors.savePin') }
	}, [armBiometrics, walletPresent])

	const disableAppLock = useCallback(async (currentPin: string): Promise<AppLockResult> => {
		// Con una wallet el PIN protege su frase: no se quita, se cambia
		if (await walletPresent()) return { success: false, error: i18n.t('misc.lock.errors.walletNeedsPin') }
		const storedPin = await getAppLockPin()
		if (!storedPin || currentPin !== storedPin) return { success: false, error: i18n.t('misc.lock.errors.wrongPin') }
		await clearPin()
		return { success: true }
	}, [walletPresent, clearPin])

	const releaseUnusedAppLock = useCallback(async (): Promise<boolean> => {
		// Aquí manda SOLO el Keychain: se llama justo después de borrar la wallet, cuando el
		// contexto aún puede no haberse enterado. Si el borrado falló, la seed sigue ahí y el PIN también
		if (isAuthenticatedRef.current || await hasWalletMnemonic()) return false
		await clearPin()
		return true
	}, [clearPin])

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

	const setAppLockBiometrics = useCallback(async (enabled: boolean) => {
		await updateSetting('security', 'appLockBiometrics', enabled)
		if (enabled) await enableBiometricMarker(APP_LOCK_BIO_SERVICE)
		else await disableBiometricMarker(APP_LOCK_BIO_SERVICE)
	}, [updateSetting])

	// Update auto lock timeout in settings
	const updateAutoLockTimeout = useCallback(async (minutes: number) => {
		await updateSetting('security', 'autoLockTimeout', minutes)
	}, [updateSetting])

	const value = useMemo<AppLockContextValue>(() => ({
		isLocked: isLocked && lockable, // derived: logging out (sin wallet) clears the lock
		isCovered: isCovered && lockable,
		isReady,
		appLockEnabled,
		unlockWithBiometrics,
		unlockWithPin,
		lock,
		enableAppLock,
		disableAppLock,
		releaseUnusedAppLock,
		changeAppLockPin,
		updateAutoLockTimeout,
		setAppLockBiometrics,
	}), [isLocked, isCovered, isReady, lockable, appLockEnabled, unlockWithBiometrics, unlockWithPin, lock, enableAppLock, disableAppLock, releaseUnusedAppLock, changeAppLockPin, updateAutoLockTimeout, setAppLockBiometrics])

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
 *   `disableAppLock`, `releaseUnusedAppLock`, `changeAppLockPin`,
 *   `updateAutoLockTimeout`).
 */
export const useAppLock = (): AppLockContextValue => {
	const context = use(AppLockContext)
	if (!context) { throw new Error('useAppLock must be used within an AppLockProvider') }
	return context
}
