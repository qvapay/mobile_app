import { formatWait } from './pinAttempts'
import type { PinGate } from './pinAttempts'

/** `t` de i18next: el reactivo de `useTranslation` en un componente, `i18n.t` fuera de render. */
type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Lo que se le dice al usuario cuando el límite de intentos no deja teclear el PIN.
 * Una sola redacción para el bloqueo, el gate de la wallet y los avisos de Ajustes.
 *
 * @returns El aviso, o '' si la puerta está abierta (no hay nada que avisar).
 */
export const pinGateMessage = (gate: PinGate, t: Translate): string => {
	if (gate.kind === 'wait') return t('misc.lock.tooMany.wait', { time: formatWait(gate.remainingMs) })
	if (gate.kind === 'ownerProof') return t('misc.lock.tooMany.ownerProof')
	return ''
}
