import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../auth/AuthContext'

const STORAGE_KEYS = {
	BANNER_DISMISS_COUNT: 'kyc_banner_dismiss_count',
	BANNER_LAST_DISMISS: 'kyc_banner_last_dismiss',
	SESSION_STARTED_AT: 'kyc_session_started_at',
}

// Empuje sutil pero persistente: más intentos y menos cooldown que el banner
// de push, porque el KYC desbloquea features (P2P, ahorro, límites) y la web
// ya lo trata como parte del onboarding.
const MAX_BANNER_DISMISSALS = 5
const BANNER_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000 // 5 días
// Tras abrir una sesión de Didit, el webhook puede tardar — no nagear mientras
// tanto (el banner reaparece si 48h después sigue sin kyc)
const SESSION_GRACE_MS = 48 * 60 * 60 * 1000

/**
 * Marca que el usuario abrió una sesión de verificación Didit (desde la
 * pantalla KYC o el paso del registro). Módulo-level para que cualquier
 * pantalla pueda marcarla sin montar el hook.
 */
export const markKycSessionStarted = async () => {
	try {
		await AsyncStorage.setItem(STORAGE_KEYS.SESSION_STARTED_AT, String(Date.now()))
	} catch { /* storage write failed */ }
}

/**
 * Decide cuándo empujar al usuario sin KYC hacia la verificación de identidad
 * (espejo móvil del SecuritySetupBanner de la web).
 *
 * El banner se muestra solo si: el usuario NO tiene kyc, su verificación no
 * fue rechazada (`kyc_status !== 'declined'` — eso es un caso de soporte, no
 * de nag), no agotó los descartes (5, con cooldown de 5 días entre muestras)
 * y no abrió una sesión de Didit en las últimas 48h (gracia para el webhook).
 * Todos los flags arrancan en "no mostrar" hasta que AsyncStorage carga
 * (`ready`), para que nada parpadee en el primer render.
 *
 * @returns {object} `{ shouldShowBanner, isPending, dismissBanner }` —
 *   `isPending` = kyc_status 'pending' (Didit en revisión, sin nada accionable).
 */
const useKycPrompt = () => {

	const { user } = useAuth()

	const [dismissCount, setDismissCount] = useState(MAX_BANNER_DISMISSALS)
	const [lastDismiss, setLastDismiss] = useState(0)
	const [sessionStartedAt, setSessionStartedAt] = useState(0)
	const [ready, setReady] = useState(false)

	useEffect(() => {
		const load = async () => {
			try {
				const values = await AsyncStorage.getMany([
					STORAGE_KEYS.BANNER_DISMISS_COUNT,
					STORAGE_KEYS.BANNER_LAST_DISMISS,
					STORAGE_KEYS.SESSION_STARTED_AT,
				])
				setDismissCount(parseInt(values[STORAGE_KEYS.BANNER_DISMISS_COUNT] || '0', 10))
				setLastDismiss(parseInt(values[STORAGE_KEYS.BANNER_LAST_DISMISS] || '0', 10))
				setSessionStartedAt(parseInt(values[STORAGE_KEYS.SESSION_STARTED_AT] || '0', 10))
			} catch { /* storage read failed */ }
			finally { setReady(true) }
		}
		load()
	}, [])

	const isPending = user?.kyc_status === 'pending'

	const shouldShowBanner = ready
		&& !!user
		&& !user.kyc
		&& user.kyc_status !== 'declined'
		&& dismissCount < MAX_BANNER_DISMISSALS
		&& (Date.now() - lastDismiss > BANNER_COOLDOWN_MS)
		&& (Date.now() - sessionStartedAt > SESSION_GRACE_MS)

	const dismissBanner = useCallback(async () => {
		const newCount = dismissCount + 1
		const now = Date.now()
		setDismissCount(newCount)
		setLastDismiss(now)
		try {
			await AsyncStorage.setMany({
				[STORAGE_KEYS.BANNER_DISMISS_COUNT]: String(newCount),
				[STORAGE_KEYS.BANNER_LAST_DISMISS]: String(now),
			})
		} catch { /* storage write failed */ }
	}, [dismissCount])

	return { shouldShowBanner, isPending, dismissBanner }
}

export default useKycPrompt
