import type { KYCStatusPayload } from '../../../api/userApi'

/**
 * Fase de la pantalla de verificación de identidad.
 *
 * - `verified`      — identidad verificada.
 * - `review`        — documentos enviados y en manos del proveedor: solo esperar.
 * - `manual_review` — el equipo retiene el caso (compliance o demasiados intentos).
 * - `idle`          — puede abrir o continuar una sesión: la pantalla ofrece el botón.
 */
export type KycPhase = 'verified' | 'review' | 'manual_review' | 'idle'

/** Lo que la pantalla necesita saber para pintarse. */
export type KycView = {
	phase: KycPhase
	/** El intento anterior fue rechazado pero puede repetirse: cambia el copy del CTA. */
	retryable: boolean
	/** Estado en el proveedor, para la etiqueta secundaria de las pantallas de espera. */
	sessionStatus: string | null
}

/**
 * Traduce la respuesta de `GET /user/kyc?detail=1` a la fase de la pantalla.
 *
 * **`kyc_status` NO decide.** El backend lo escribe al CREAR la sesión y no lo revierte
 * nunca: quien abrió una verificación hace meses y la abandonó sigue en `'pending'` para
 * siempre. Leerlo como "en revisión" es lo que dejaba a esos usuarios mirando una lottie
 * sin un solo botón que pulsar. Quien decide es el servidor, vía `on_hold`/`can_retry`,
 * que sí miran el estado real de las sesiones en el proveedor.
 *
 * Con un backend anterior a esos campos se cae al mapeo viejo por `kyc_status`, que es
 * exactamente el comportamiento que había: nunca peor, y mejor en cuanto se despliega.
 */
export const deriveKycView = (data: KYCStatusPayload | undefined | null): KycView => {

	const sessionStatus = data?.session_status ?? null
	const retryable = data?.kyc_status === 'declined'

	if (data?.kyc) return { phase: 'verified', retryable: false, sessionStatus }

	// Camino nuevo: el servidor ya resolvió si hay algo que el usuario pueda hacer.
	if (typeof data?.on_hold === 'boolean' || typeof data?.can_retry === 'boolean') {
		if (data.on_hold) return { phase: 'manual_review', retryable: false, sessionStatus }
		if (data.can_retry === false) return { phase: 'review', retryable: false, sessionStatus }
		return { phase: 'idle', retryable, sessionStatus }
	}

	// Fallback: backend sin `?detail=1`.
	if (data?.kyc_status === 'pending') return { phase: 'review', retryable: false, sessionStatus }
	if (data?.kyc_status === 'declined') return { phase: 'manual_review', retryable: false, sessionStatus }
	return { phase: 'idle', retryable: false, sessionStatus }
}

/**
 * Fase que corresponde a un código de error del `POST /user/kyc`, o `null` si el código
 * no cambia de pantalla (429 lock, 502 proveedor caído: se avisa y se queda donde está).
 *
 * Un 403 solo cierra la puerta cuando trae `reason`: el backend lo usa para separar el
 * retén real (compliance / tope de intentos) de lo demás.
 */
export const phaseForRequestError = (status?: number, reason?: string): KycPhase | null => {
	if (status === 409) return 'review'
	if (status === 403) return reason ? 'manual_review' : 'idle'
	return null
}
