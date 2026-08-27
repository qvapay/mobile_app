import { useCallback, useState } from 'react'
import { Linking } from 'react-native'
import { startVerification, VerificationStatus, type VerificationErrorType } from '@didit-protocol/sdk-react-native'

// API
import { userApi } from '../api/userApi'
import type { KYCHoldReason } from '../api/userApi'

// Auth
import { useAuth } from '../auth/AuthContext'

// Nudge de KYC (gracia post-sesión para el banner del Home)
import { markKycSessionStarted } from './useKycPrompt'

// i18n en call-time: el hook mantiene identidad estable y el idioma del SDK
// se resuelve al lanzar, no al montar
import i18n from '../i18n'

// El SDK usa códigos ISO 639-1 con variantes regionales; nuestro 'pt' es Brasil
const SDK_LANGUAGE: Record<string, string> = { pt: 'pt-BR' }

/** Resultado de `launchKyc`, discriminado por `kind` (ver doc del hook). */
export type KycLaunchResult =
	| { kind: 'native', outcome: 'approved' | 'pending' | 'declined' | 'cancelled' | 'unknown' }
	| { kind: 'browser' }
	| { kind: 'request-error', status?: number, reason?: KYCHoldReason, message?: string }
	| { kind: 'sdk-error', errorType?: VerificationErrorType, message?: string }

/**
 * Lanza la verificación de identidad NATIVA (SDK del proveedor embebido en la
 * app). Pide la sesión al backend (`POST /user/kyc`), lanza el flujo nativo con
 * el `session_token` y mapea el resultado a un objeto discriminado por `kind`
 * que cada superficie (pantalla de Ajustes, wizard de Registro) traduce a su
 * propia UI:
 *
 * - `{ kind: 'native', outcome: 'approved'|'pending'|'declined'|'cancelled'|'unknown' }`
 *   — el flujo nativo terminó; en approved/pending/declined el user local ya
 *   quedó sincronizado vía `updateUser` (el webhook del backend es la fuente
 *   de verdad final, esto solo adelanta la UI). `unknown` es el flujo que
 *   terminó SIN estado reconocible: no se toca nada y quien llama vuelve a
 *   preguntarle al servidor, que es el único que sabe.
 * - `{ kind: 'browser' }` — fallback a la URL hospedada en el navegador: el
 *   backend no manda `session_token` (que es lo NORMAL en una sesión
 *   reutilizada — solo la creación lo devuelve) o el SDK falló de forma
 *   recuperable. El caller debe activar su re-check por AppState.
 * - `{ kind: 'request-error', status, reason, message }` — el POST falló;
 *   `status` codifica el estado (409 en revisión, 403 retenido, 400 ya
 *   verificada, 429 lock, 502 proveedor caído) y `reason` distingue los dos
 *   403 ('compliance' / 'limit').
 * - `{ kind: 'sdk-error', errorType, message }` — el SDK falló sin rescate
 *   (p. ej. `cameraAccessDenied`: abrir el navegador no arregla un permiso
 *   negado, mejor un mensaje accionable).
 */
const useKycVerification = (): { launchKyc: (options?: { refresh?: boolean }) => Promise<KycLaunchResult>, launching: boolean } => {

	const { updateUser } = useAuth()

	// true mientras se pide la sesión o el flujo nativo está en pantalla
	const [launching, setLaunching] = useState(false)

	const launchKyc = useCallback(async ({ refresh = false }: { refresh?: boolean } = {}): Promise<KycLaunchResult> => {
		setLaunching(true)
		try {
			const resp = await userApi.requestKYCSession({ refresh })
			if (!resp.success || !resp.data) {
				return { kind: 'request-error', status: resp.status, reason: resp.success ? undefined : resp.reason, message: resp.success ? undefined : resp.error }
			}

			// Sesión reutilizada: el backend no puede darnos token (solo lo devuelve la
			// creación), así que el flujo sale al navegador. No es un caso degradado.
			if (!resp.sessionToken) {
				await Linking.openURL(resp.data)
				// La gracia de 48h del banner arranca solo si algo se abrió de verdad:
				// marcarla antes silenciaba el nudge de quien ni llegó a ver la cámara.
				markKycSessionStarted()
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
				// Hay documentos enviados: arranca la gracia de 48h del banner del Home.
				// Antes se marcaba justo tras el POST, así que un usuario que cancelaba al
				// instante se quedaba dos días sin el nudge y sin verificación.
				markKycSessionStarted()
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
				if (status === VerificationStatus.Pending) {
					updateUser({ kyc_status: 'pending' })
					return { kind: 'native', outcome: 'pending' }
				}
				// Terminó sin un estado que sepamos leer (sesión ausente, o un estado que
				// el SDK añada más adelante). NO se escribe 'pending' local: ese atajo era
				// justo lo que dejaba a un usuario mirando "en revisión" sin nada en revisión.
				return { kind: 'native', outcome: 'unknown' }
			}

			if (result.type === 'cancelled') return { kind: 'native', outcome: 'cancelled' }

			// SDK falló: rescate por navegador salvo permiso de cámara negado
			if (result.error?.type !== 'cameraAccessDenied') {
				try {
					await Linking.openURL(resp.data)
					markKycSessionStarted()
					return { kind: 'browser' }
				} catch { /* sin navegador tampoco: cae al sdk-error */ }
			}
			return { kind: 'sdk-error', errorType: result.error?.type, message: result.error?.message }

		} catch (e) {
			return { kind: 'sdk-error', message: (e as Error | null)?.message }
		} finally { setLaunching(false) }
	}, [updateUser])

	return { launchKyc, launching }
}

export default useKycVerification
