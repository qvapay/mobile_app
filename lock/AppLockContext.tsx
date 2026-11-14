import { createContext, use, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { AppState } from 'react-native'
import i18n from '../i18n'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import { useWallet } from '../wallet/WalletContext'
import {
	readAppLockPin,
	setAppLockPin,
	hasAppLockPin,
	appLockPinStatus,
	removeAppLockPin,
	getSupportedBiometryType,
	getPinAttemptsRecord,
	setPinAttemptsRecord,
	clearPinAttemptsRecord,
} from '../api/client'
import { authenticateBiometricMarker, disableBiometricMarker, enableBiometricMarker, hasBiometricMarker } from '../helpers/biometricMarker'
import { confirmDeviceOwner, ownerProofPasses } from '../helpers/deviceOwnerProof'
import type { DeviceOwnerOutcome } from '../helpers/deviceOwnerProof'
import { walletSeedEntry } from '../wallet/keystore'
import { clampToNow, NO_ATTEMPTS, parsePinAttempts, pinGate, registerAttempt, serializePinAttempts } from './pinAttempts'
import type { PinAttempts, PinGate } from './pinAttempts'
import { pinGateMessage } from './pinGateMessage'

/** Marcador biométrico PROPIO del bloqueo: Face ID aunque se entrara con passkey. */
export const APP_LOCK_BIO_SERVICE = 'com.qvapay.applock.bio'

/**
 * Result shape of every unlock/enable/disable/change operation. `locked`: el PIN no se
 * aceptó y el límite de intentos ya no deja probar otro (hay que esperar o pasar la prueba
 * de dueño); la pantalla pinta ese aviso en vez de «PIN incorrecto». `unreadable`: el PIN
 * guardado no se deja leer, así que nadie puede acertarlo (ver `resetUnreadablePin`).
 */
export type AppLockResult = { success: boolean, error?: string, locked?: boolean, unreadable?: boolean }

/**
 * Resultado de comparar un PIN con el guardado.
 * - `wrong`: se comparó y no era. Cuenta como intento.
 * - `locked`: el límite de intentos no dejó comparar (lo que falta lo dice `gate`).
 * - `error`: no se llegó a comparar (no se pudo anotar el intento). No cuenta.
 * - `unreadable`: no se llegó a comparar porque el PIN guardado no se deja leer. No cuenta.
 *
 * `gate` es la puerta DESPUÉS de este intento.
 */
export type PinCheck = { ok: true } | { ok: false, reason: 'wrong' | 'locked' | 'error' | 'unreadable', gate: PinGate }

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
	/** Fallos seguidos del PIN (lock/pinAttempts). Para pintar: se lee con `usePinGate`. */
	pinAttempts: PinAttempts
	/** false cuando el teléfono no tiene bloqueo de pantalla: no hay prueba de dueño que pedir. */
	ownerProofAvailable: boolean
	/**
	 * Compara un PIN con el guardado pasando por el límite de intentos. Es la ÚNICA puerta
	 * para comprobar el PIN: nadie lee el Keychain por su cuenta para compararlo.
	 */
	verifyAppLockPin: (pin: string) => Promise<PinCheck>
	/**
	 * Tras demasiados fallos: diálogo del sistema (huella/cara o el código del teléfono).
	 * Si pasa, devuelve los intentos; no desbloquea nada por sí sola.
	 */
	proveDeviceOwner: () => Promise<DeviceOwnerOutcome>
	/**
	 * Devuelve los intentos. Llamar SOLO justo después de una biometría del sistema
	 * superada (la de la wallet): es la prueba de que quien tiene el teléfono es su dueño.
	 */
	forgivePinAttempts: () => Promise<void>
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
	 * El PIN guardado no se deja leer: tras la prueba de dueño del dispositivo, lo retira
	 * (y con él el bloqueo). No hace nada si el PIN se puede leer.
	 */
	resetUnreadablePin: () => Promise<AppLockResult>
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
 * Un PIN que no pasó, como resultado de pantalla. Si el límite de intentos quedó cerrado
 * manda su aviso («espera 0:30», «confirma que eres tú») sobre el de «PIN incorrecto».
 *
 * @param wrongKey - Clave del aviso de PIN incorrecto de este flujo.
 */
const pinFailure = (check: Extract<PinCheck, { ok: false }>, wrongKey: string): AppLockResult => {
	if (check.gate.kind !== 'open') return { success: false, error: pinGateMessage(check.gate, (key, options) => i18n.t(key, options)), locked: true }
	if (check.reason === 'unreadable') return { success: false, error: i18n.t('misc.lock.errors.verifyPin'), unreadable: true }
	return { success: false, error: i18n.t(check.reason === 'wrong' ? wrongKey : 'misc.lock.errors.verifyPin') }
}

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
 * - Son 4 dígitos, así que TODA comparación pasa por `checkPin` y su límite de
 *   intentos (lock/pinAttempts): espera creciente desde el quinto fallo y, al
 *   décimo, la prueba de dueño del dispositivo. El contador vive en el Keychain
 *   (dura lo que el PIN) y se anota ANTES de comparar.
 * - `isLocked` is exposed AND-ed with that subject, so logging out without a
 *   wallet dismisses the lock screen automatically.
 */
export const AppLockProvider = ({ children }: { children: ReactNode }) => {

	const { isAuthenticated, isLoading: authLoading } = useAuth()
	const { hasWallet: usableWallet, recovery, isReady: walletReady } = useWallet()
	// Una wallet en `recovery` (su seed está en el teléfono pero ahora no se deja leer)
	// también cuenta: si solo contara la usable, un fallo de lectura al arrancar se saltaría
	// el bloqueo y, al volver las llaves, la wallet quedaría a la vista sin haber pedido el PIN
	const hasWallet = usableWallet || recovery != null
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

	// ── Límite de intentos del PIN (lock/pinAttempts) ──
	// Dentro de la sesión manda `attemptsRef` (el estado es solo para pintar); entre sesiones, el Keychain
	const attemptsRef = useRef<PinAttempts>(NO_ATTEMPTS)
	const [pinAttempts, setPinAttempts] = useState<PinAttempts>(NO_ATTEMPTS)
	const ownerProofAvailableRef = useRef(true)
	const [ownerProofAvailable, setOwnerProofAvailable] = useState(true)
	const attemptsLoadRef = useRef<Promise<void> | null>(null)
	// Cola: dos comprobaciones a la vez leerían el mismo contador y una pisaría a la otra
	const pinQueueRef = useRef<Promise<unknown>>(Promise.resolve())
	// La escritura que devuelve los intentos tras un PIN correcto: no retrasa la entrada,
	// pero la cola la espera antes de la tarea siguiente
	const resetWriteRef = useRef<Promise<void>>(Promise.resolve())

	const commitAttempts = useCallback((next: PinAttempts) => {
		attemptsRef.current = next
		setPinAttempts(next)
	}, [])

	const loadAttempts = useCallback((): Promise<void> => {
		attemptsLoadRef.current ??= getPinAttemptsRecord().then(raw => { commitAttempts(parsePinAttempts(raw)) })
		return attemptsLoadRef.current
	}, [commitAttempts])

	/**
	 * Carga el contador y, si su último fallo quedó «en el futuro» (el reloj se atrasó), lo
	 * fija a ahora Y LO GUARDA: sin guardarlo, la espera se recalcularía desde cada «ahora»
	 * y no terminaría nunca (ver `clampToNow`).
	 */
	const settleAttempts = useCallback(async () => {
		await loadAttempts()
		const clamped = clampToNow(attemptsRef.current, Date.now())
		if (clamped === attemptsRef.current) return
		commitAttempts(clamped)
		await setPinAttemptsRecord(serializePinAttempts(clamped))
	}, [loadAttempts, commitAttempts])

	const enqueuePin = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
		const start = () => resetWriteRef.current.then(task)
		const run = pinQueueRef.current.then(start, start)
		pinQueueRef.current = run.catch(() => {})
		return run
	}, [])

	// Al arrancar y cada vez que la app vuelve al frente (por la cola: no se cruza con una comprobación)
	const resettleAttempts = useCallback(() => { enqueuePin(settleAttempts).catch(() => {}) }, [enqueuePin, settleAttempts])
	useEffect(() => { resettleAttempts() }, [resettleAttempts])

	const currentGate = useCallback((): PinGate => pinGate(attemptsRef.current, Date.now(), { ownerProofAvailable: ownerProofAvailableRef.current }), [])

	const clearAttempts = useCallback(async () => {
		if (attemptsRef.current.failures === 0) return
		commitAttempts(NO_ATTEMPTS)
		await setPinAttemptsRecord(serializePinAttempts(NO_ATTEMPTS))
	}, [commitAttempts])

	const forgivePinAttempts = useCallback((): Promise<void> => enqueuePin(async () => {
		await loadAttempts()
		await clearAttempts()
	}), [enqueuePin, loadAttempts, clearAttempts])

	// La prueba de dueño que devuelve los intentos (sin cola: la usa `checkPin` desde dentro)
	const runOwnerProof = useCallback(async (): Promise<DeviceOwnerOutcome> => {
		const outcome = await confirmDeviceOwner(i18n.t('misc.lock.ownerProof.title'), i18n.t('misc.lock.tooMany.proofSubtitle'))
		if (outcome === 'success') await clearAttempts()
		// Teléfono sin bloqueo de pantalla: no hay prueba que pedir y solo queda la espera.
		// NO devuelve los intentos (ahí cualquiera «pasaría»)
		else if (outcome === 'unavailable') { ownerProofAvailableRef.current = false; setOwnerProofAvailable(false) }
		return outcome
	}, [clearAttempts])

	const proveDeviceOwner = useCallback((): Promise<DeviceOwnerOutcome> => enqueuePin(async () => {
		await loadAttempts()
		return runOwnerProof()
	}), [enqueuePin, loadAttempts, runOwnerProof])

	/**
	 * ÚNICO sitio donde un PIN se compara con el guardado.
	 *
	 * @param inlineProof - Si toca la prueba de dueño, pedirla aquí mismo (los formularios de
	 *   Ajustes no tienen botón para ella: su botón de enviar hace de reintento).
	 */
	const checkPin = useCallback((entered: string, inlineProof = false): Promise<PinCheck> => enqueuePin(async (): Promise<PinCheck> => {
		await settleAttempts()
		if (inlineProof && currentGate().kind === 'ownerProof') await runOwnerProof()
		const gate = currentGate()
		if (gate.kind !== 'open') return { ok: false, reason: 'locked', gate }

		// El intento se anota ANTES de comparar. Anotado después, bastaría con matar la app
		// tras cada fallo para que ninguno contase. Si no se puede anotar, no se compara.
		// El PIN se pide al Keychain a la vez que se anota (un viaje en vez de dos: al
		// arrancar en frío cada viaje espera a un hilo de JS ocupado), pero no se compara
		// ni se dice nada hasta que consta que el intento quedó escrito
		const before = attemptsRef.current
		const attempted = registerAttempt(before, Date.now())
		const [recorded, read] = await Promise.all([
			setPinAttemptsRecord(serializePinAttempts(attempted)),
			readAppLockPin().then((pin): { pin: string | null } | null => ({ pin }), () => null),
		])
		if (!recorded) return { ok: false, reason: 'error', gate }
		// Solo el ref: el estado (lo que se pinta) espera al desenlace, o un quinto PIN
		// CORRECTO enseñaría «demasiados intentos» un instante
		attemptsRef.current = attempted

		if (!read) {
			// No se comparó nada: el intento no cuenta, y tampoco le dijo nada a quien prueba
			attemptsRef.current = before
			await setPinAttemptsRecord(serializePinAttempts(before))
			return { ok: false, reason: 'unreadable', gate }
		}
		if (read.pin && entered === read.pin) {
			commitAttempts(NO_ATTEMPTS)
			// Devolver los intentos no hace esperar a quien acaba de acertar: se escribe
			// después, y la cola no arranca otra tarea hasta que esa escritura termina
			resetWriteRef.current = setPinAttemptsRecord(serializePinAttempts(NO_ATTEMPTS)).then(() => {}, () => {})
			return { ok: true }
		}
		commitAttempts(attempted)
		return { ok: false, reason: 'wrong', gate: currentGate() }
	}), [enqueuePin, settleAttempts, currentGate, runOwnerProof, commitAttempts])

	const verifyAppLockPin = useCallback((pin: string): Promise<PinCheck> => checkPin(pin), [checkPin])

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
			if (nextAppState === 'active') {
				// Fuera de la app pudo cambiar la hora (se re-asienta el contador) o ponerse un
				// bloqueo de pantalla (la prueba de dueño vuelve a ser posible)
				resettleAttempts()
				if (!ownerProofAvailableRef.current) { ownerProofAvailableRef.current = true; setOwnerProofAvailable(true) }
			}
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
	}, [lockable, appLockEnabled, security.autoLockTimeout, resettleAttempts])

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
				// La huella o la cara de siempre: es el dueño, y recupera sus intentos de PIN
				forgivePinAttempts().catch(() => {})
				return { success: true }
			}
			return { success: false, error: i18n.t('misc.lock.errors.biometricCanceled') }
		} catch (error) {
			return { success: false, error: i18n.t('misc.lock.errors.biometricError') }
		}
	}, [forgivePinAttempts])

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
		const check = await checkPin(enteredPin)
		if (check.ok) {
			setIsLocked(false)
			armBiometrics()
			return { success: true }
		}
		return pinFailure(check, 'misc.lock.errors.wrongPin')
	}, [armBiometrics, checkPin])

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
	const walletPresent = useCallback(async (): Promise<boolean> => hasWalletRef.current || (await walletSeedEntry()) !== 'absent', [])

	const clearPin = useCallback(async () => {
		await removeAppLockPin()
		await disableBiometricMarker(APP_LOCK_BIO_SERVICE)
		// Sin PIN no hay intentos que contar (y uno nuevo empieza de cero)
		await clearPinAttemptsRecord()
		commitAttempts(NO_ATTEMPTS)
		setAppLockEnabled(false)
		setIsLocked(false)
	}, [commitAttempts])

	/**
	 * Enables app lock by storing a new PIN in the Keychain. Does not lock
	 * immediately — the lock arms on the next timeout/cold start (or via `lock`).
	 */
	const enableAppLock = useCallback(async (pin: string): Promise<AppLockResult> => {
		// Un PIN ya puesto no se pisa: cambiarlo exige conocer el actual. Uno que no se deja
		// leer no cuenta: nadie puede acertarlo ni protege nada, y se sustituye (con una
		// wallet en el teléfono, tras la prueba de dueño de abajo)
		if ((await appLockPinStatus()) === 'set') return { success: false, error: i18n.t('misc.lock.errors.pinExists') }
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
			// PIN nuevo: los fallos de uno anterior no le tocan
			await clearPinAttemptsRecord()
			commitAttempts(NO_ATTEMPTS)
			setAppLockEnabled(true)
			armBiometrics()
			return { success: true }
		}
		return { success: false, error: i18n.t('misc.lock.errors.savePin') }
	}, [armBiometrics, walletPresent, commitAttempts])

	const disableAppLock = useCallback(async (currentPin: string): Promise<AppLockResult> => {
		// Con una wallet el PIN protege su frase: no se quita, se cambia
		if (await walletPresent()) return { success: false, error: i18n.t('misc.lock.errors.walletNeedsPin') }
		const check = await checkPin(currentPin, true)
		if (!check.ok) return pinFailure(check, 'misc.lock.errors.wrongPin')
		await clearPin()
		return { success: true }
	}, [walletPresent, clearPin, checkPin])

	/**
	 * Salida cuando el PIN guardado no se deja leer (en Android, tras pasar de un teléfono a
	 * otro, viaja cifrado y sin su clave): nadie puede acertarlo y la app se quedaría
	 * bloqueada para siempre. Tras la prueba de dueño del dispositivo, lo retira. Un PIN
	 * que SÍ se lee no se quita por aquí jamás.
	 */
	const resetUnreadablePin = useCallback(async (): Promise<AppLockResult> => {
		try {
			await readAppLockPin()
			return { success: false, error: i18n.t('misc.lock.errors.verifyPin') }
		} catch { /* ilegible de verdad: sigue */ }
		const proof = await confirmDeviceOwner(i18n.t('misc.lock.ownerProof.title'), i18n.t('misc.lock.unreadable.proofSubtitle'))
		if (!ownerProofPasses(proof)) return proof === 'cancelled' ? { success: false } : { success: false, error: i18n.t('misc.lock.errors.ownerProofFailed') }
		await clearPin()
		return { success: true }
	}, [clearPin])

	const releaseUnusedAppLock = useCallback(async (): Promise<boolean> => {
		// Aquí manda SOLO el Keychain: se llama justo después de borrar la wallet, cuando el
		// contexto aún puede no haberse enterado. Si el borrado falló, la seed sigue ahí y el PIN también
		if (isAuthenticatedRef.current || (await walletSeedEntry()) !== 'absent') return false
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
		const check = await checkPin(oldPin, true)
		if (!check.ok) return pinFailure(check, 'misc.lock.errors.currentPinWrong')
		const stored = await setAppLockPin(newPin)
		if (stored) {
			return { success: true }
		}
		return { success: false, error: i18n.t('misc.lock.errors.updatePin') }
	}, [checkPin])

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
		pinAttempts,
		ownerProofAvailable,
		verifyAppLockPin,
		proveDeviceOwner,
		forgivePinAttempts,
		unlockWithBiometrics,
		unlockWithPin,
		lock,
		enableAppLock,
		disableAppLock,
		resetUnreadablePin,
		releaseUnusedAppLock,
		changeAppLockPin,
		updateAutoLockTimeout,
		setAppLockBiometrics,
	}), [isLocked, isCovered, isReady, lockable, appLockEnabled, pinAttempts, ownerProofAvailable, verifyAppLockPin, proveDeviceOwner, forgivePinAttempts, unlockWithBiometrics, unlockWithPin, lock, enableAppLock, disableAppLock, resetUnreadablePin, releaseUnusedAppLock, changeAppLockPin, updateAutoLockTimeout, setAppLockBiometrics])

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
