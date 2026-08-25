import { useCallback, useState } from 'react'
import { Linking } from 'react-native'
import { startVerification, VerificationStatus } from '@didit-protocol/sdk-react-native'

// API
import { userApi } from '../api/userApi'

// Auth
import { useAuth } from '../auth/AuthContext'

// Nudge de KYC (gracia post-sesión para el banner del Home)
import { markKycSessionStarted } from './useKycPrompt'

// i18n en call-time: el hook mantiene identidad estable y el idioma del SDK
// se resuelve al lanzar, no al montar
import i18n from '../i18n'

// El SDK usa códigos ISO 639-1 con variantes regionales; nuestro 'pt' es Brasil
const SDK_LANGUAGE = { pt: 'pt-BR' }

/**
 * Lanza la verificación de identidad NATIVA (SDK del proveedor embebido en la
 * app). Pide la sesión al backend (`POST /user/kyc`), lanza el flujo nativo con
 * el `session_token` y mapea el resultado a un objeto discriminado por `kind`
 * que cada superficie (pantalla de Ajustes, wizard de Registro) traduce a su
 * propia UI:
 *
 * - `{ kind: 'native', outcome: 'approved'|'pending'|'declined'|'cancelled' }`
 *   — el flujo nativo terminó; en approved/pending/declined el user local ya
 *   quedó sincronizado vía `updateUser` (el webhook del backend es la fuente
 *   de verdad final, esto solo adelanta la UI).
 * - `{ kind: 'browser' }` — fallback a la URL hospedada en el navegador:
 *   backend sin `session_token` (despliegue anterior) o fallo recuperable del
 *   SDK. El caller debe activar su re-check por AppState.
 * - `{ kind: 'request-error', status, message }` — el POST falló; `status`
 *   codifica el estado (409 en revisión, 403 rechazada, 400 ya verificada).
 * - `{ kind: 'sdk-error', errorType, message }` — el SDK falló sin rescate
 *   (p. ej. `cameraAccessDenied`: abrir el navegador no arregla un permiso
 *   negado, mejor un mensaje accionable).
 */
const useKycVerification = () => {

	const { updateUser } = useAuth()

	// true mientras se pide la sesión o el flujo nativo está en pantalla
	const [launching, setLaunching] = useState(false)

	const launchKyc = useCallback(async () => {
		setLaunching(true)
		try {
			const resp = await userApi.requestKYCSession()
			if (!resp.success || !resp.data) {
				return { kind: 'request-error', status: resp.status, message: resp.error }
			}

			// Con o sin SDK, arranca la gracia de 48h del banner del Home
			markKycSessionStarted()

			if (!resp.sessionToken) {
				await Linking.openURL(resp.data)
				return { kind: 'browser' }
			}

			const result = await startVerification(resp.sessionToken, {
				languageCode: SDK_LANGUAGE[i18n.language] || i18n.language,
				showCloseButton: true,
				showExitConfirmation: true,
				// El SDK se cierra solo al terminar: los estados de éxito/revisión
				// los pinta la app con sus propias pantallas (lotties del theme)
				closeOnComplete: true,
			})

			if (result.type === 'completed') {
				const status = result.session?.status
				if (status === VerificationStatus.Approved) {
					// Adelanta badges/gates sin esperar al próximo /user/extended
					updateUser({ kyc: true, kyc_status: 'approved' })
					return { kind: 'native', outcome: 'approved' }
				}
				if (status === VerificationStatus.Declined) {
					updateUser({ kyc_status: 'declined' })
					return { kind: 'native', outcome: 'declined' }
				}
				updateUser({ kyc_status: 'pending' })
				return { kind: 'native', outcome: 'pending' }
			}

			if (result.type === 'cancelled') return { kind: 'native', outcome: 'cancelled' }

			// SDK falló: rescate por navegador salvo permiso de cámara negado
			if (result.error?.type !== 'cameraAccessDenied') {
				try {
					await Linking.openURL(resp.data)
					return { kind: 'browser' }
				} catch { /* sin navegador tampoco: cae al sdk-error */ }
			}
			return { kind: 'sdk-error', errorType: result.error?.type, message: result.error?.message }

		} catch (e) {
			return { kind: 'sdk-error', message: e?.message }
		} finally { setLaunching(false) }
	}, [updateUser])

	return { launchKyc, launching }
}

export default useKycVerification
