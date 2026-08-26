import { useState, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'

// Umbrales espejo de los gates server-side de qpweb — solo UX preventiva, el
// backend sigue siendo la autoridad. Ojo a la semántica distinta:
// transferencias se gatean desde $500 INCLUSIVE (CIP_KYC_GATE_AMOUNT, >=),
// retiros solo POR ENCIMA de $1000 (WITHDRAW_KYC_GATE_AMOUNT, >).
export const KYC_TRANSFER_THRESHOLD = 500
export const KYC_WITHDRAW_THRESHOLD = 1000

/** Contrato del gate: interceptor + estado del KycGateModal. */
export type KycGate = {
	requireKyc: (params: { gated?: boolean, message: string }) => boolean
	gateVisible: boolean
	gateMessage: string | null
	closeGate: () => void
}

/**
 * Gate de UX para acciones que el backend rechaza sin KYC: en vez de dejar que
 * el server devuelva el 403, intercepta la acción y muestra el KycGateModal
 * ("Verifícate primero") con salto directo a la pantalla de verificación.
 *
 * Uso: `if (!requireKyc({ gated, message })) return` al inicio del handler.
 * `gated` (default true) permite condicionar por monto — el caller calcula el
 * booleano con el operador correcto para su endpoint (>= transfer, > withdraw).
 *
 * @returns `{ requireKyc, gateVisible, gateMessage, closeGate }` —
 *   renderiza `<KycGateModal visible={gateVisible} message={gateMessage}
 *   onClose={closeGate} />` junto al resto de modales de la pantalla.
 */
const useKycGate = (): KycGate => {

	const { user } = useAuth()
	const [gateMessage, setGateMessage] = useState<string | null>(null)

	const requireKyc = useCallback(({ gated = true, message }: { gated?: boolean, message: string }) => {
		if (user?.kyc || !gated) return true
		setGateMessage(message)
		return false
	}, [user?.kyc])

	const closeGate = useCallback(() => setGateMessage(null), [])

	return { requireKyc, gateVisible: gateMessage != null, gateMessage, closeGate }
}

export default useKycGate
