import { useEffect, useEffectEvent, useCallback, useReducer } from 'react'

import { useSettings } from '../settings/SettingsContext'
import { useAppLock, APP_LOCK_BIO_SERVICE } from './AppLockContext'
import { hasBiometricMarker } from '../helpers/biometricMarker'
import { getSupportedBiometryType, hasBiometricCredentials } from '../api/client'

// Biometric type + availability are detected together in one effect
type BiometricsState = {
	type: string | null
	available: boolean
}

type BiometricsAction = { type: 'detected', biometryType: string | null, available: boolean }

const initialBiometrics: BiometricsState = { type: null, available: false }

function biometricsReducer(state: BiometricsState, action: BiometricsAction): BiometricsState {
	switch (action.type) {
		case 'detected':
			return { type: action.biometryType, available: action.available }
		default:
			return state
	}
}

const BIOMETRY_LABEL_KEYS: Record<string, string> = {
	FaceID: 'misc.lock.unlock.faceId',
	TouchID: 'misc.lock.unlock.touchId',
	Fingerprint: 'misc.lock.unlock.fingerprint',
}

/** Clave i18n del nombre del método biométrico (genérica si el tipo es desconocido). */
export const getBiometryLabelKey = (type: string | null) => (type && BIOMETRY_LABEL_KEYS[type]) || 'misc.lock.unlock.biometrics'

/**
 * Desbloqueo biométrico de la pantalla de bloqueo: detecta tipo y disponibilidad
 * cada vez que se arma el bloqueo y lanza el prompt solo ~500ms después.
 *
 * @param isLocked - Si el bloqueo está armado (fuera de él no se detecta ni se pide nada).
 * @param onBeforeUnlock - Se llama antes de cada intento (la pantalla limpia su error).
 * @returns `{ biometryType, available, unlock }`.
 */
export const useLockBiometrics = (isLocked: boolean, onBeforeUnlock: () => void) => {

	const { security } = useSettings()
	const { unlockWithBiometrics } = useAppLock()
	const [biometrics, dispatchBiometrics] = useReducer(biometricsReducer, initialBiometrics)

	// Check biometric availability when lock screen appears
	useEffect(() => {
		if (!isLocked) return
		let cancelled = false
		const checkBiometrics = async () => {
			const [type, hasCredentials, hasMarker] = await Promise.all([getSupportedBiometryType(), hasBiometricCredentials(), hasBiometricMarker(APP_LOCK_BIO_SERVICE)])
			if (cancelled) return
			// Marcador propio del bloqueo (cualquier login) o, como antes, credenciales del login + ajuste
			const viaMarker = hasMarker && security.appLockBiometrics !== false
			dispatchBiometrics({ type: 'detected', biometryType: type, available: !!type && (viaMarker || (hasCredentials && security.biometricsEnabled)) })
		}
		checkBiometrics()
		return () => { cancelled = true }
	}, [isLocked, security.biometricsEnabled, security.appLockBiometrics])

	const unlock = useCallback(async () => {
		onBeforeUnlock()
		await unlockWithBiometrics()
	}, [onBeforeUnlock, unlockWithBiometrics])

	// Effect Event: reads the latest unlock callback without re-arming the timer
	const onBiometricAutoPrompt = useEffectEvent(() => { unlock() })

	// Auto-prompt biometrics when lock screen appears
	useEffect(() => {
		if (!isLocked || !biometrics.available) return
		const timer = setTimeout(() => {
			onBiometricAutoPrompt()
		}, 500)
		return () => clearTimeout(timer)
	}, [isLocked, biometrics.available])

	return { biometryType: biometrics.type, available: biometrics.available, unlock }
}
