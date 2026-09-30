import { useState, useCallback, useRef } from 'react'

import type { OfacCompliancePayload, OfacContext, OfacScope } from '../helpers/ofacCompliance'
import type { OfacAttestationModalProps } from '../ui/OfacAttestationModal'

type GateRequest = { scope: OfacScope, context: OfacContext, tick?: string | null }

/** Contrato del gate: interceptor + props del OfacAttestationModal. */
export type OfacGate = {
	/**
	 * `true` ⇒ no hace falta atestar, el caller sigue. `false` ⇒ se abrió el
	 * modal; al certificar se invoca `onAttested(payload)` (la continuación).
	 */
	requireAttestation: (params: GateRequest & { required: boolean }, onAttested: (payload: OfacCompliancePayload) => void) => boolean
	modalProps: OfacAttestationModalProps
}

/**
 * Gate de compliance OFAC para operaciones de dinero (retiros a Cuba / cripto,
 * transferencias a nacionales cubanos, depósitos de US persons). Mismo patrón
 * que `useKycGate`: el handler de la acción hace
 *
 *   if (!requireAttestation({ required, scope, context, tick }, payload => { ref.current = payload; seguir() })) return
 *
 * y la pantalla monta `<OfacAttestationModal {...modalProps} />`. El payload lo
 * guarda la PANTALLA (ref junto a su clave de idempotencia): vale para un
 * intento, se reutiliza en sus reintentos y se descarta tras el éxito.
 */
const useOfacGate = (): OfacGate => {

	const [request, setRequest] = useState<GateRequest | null>(null)
	const continuationRef = useRef<((payload: OfacCompliancePayload) => void) | null>(null)

	const requireAttestation = useCallback<OfacGate['requireAttestation']>(({ required, scope, context, tick }, onAttested) => {
		if (!required) return true
		continuationRef.current = onAttested
		setRequest({ scope, context, tick })
		return false
	}, [])

	const onClose = useCallback(() => {
		continuationRef.current = null
		setRequest(null)
	}, [])

	const onConfirm = useCallback((payload: OfacCompliancePayload) => {
		const next = continuationRef.current
		continuationRef.current = null
		setRequest(null)
		next?.(payload)
	}, [])

	return {
		requireAttestation,
		modalProps: {
			visible: request != null,
			scope: request?.scope ?? 'cuba_value',
			context: request?.context ?? 'withdraw',
			tick: request?.tick ?? null,
			onConfirm,
			onClose,
		},
	}
}

export default useOfacGate
