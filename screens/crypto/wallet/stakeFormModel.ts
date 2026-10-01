/**
 * Validación del formulario de staking. PURO (testeable en node).
 *
 * Mismo criterio que Enviar: todo en unidades mínimas (bigint), sin coma
 * flotante, y el MÁX deja lo que la red exige para pagar la propia tx.
 */
import { parseUnits } from '../../../wallet/chains/units'
import { actionNeedsAmount, actionNeedsTarget } from '../../../wallet/staking/capabilities'
import type { StakeAction, StakingKind } from '../../../wallet/staking/types'

export type StakeFormError =
	| { key: 'amountZero' }
	| { key: 'amountInvalid', decimals: number }
	| { key: 'insufficient' }
	| { key: 'belowMin', min: bigint }
	| { key: 'noTarget' }

export type StakeFormInput = {
	action: StakeAction
	/** La red decide si salir lleva importe (TRON) o es la posición entera (Solana). */
	kind?: StakingKind
	amountText: string
	decimals: number
	/** De dónde sale el importe: gastable para entrar, en staking para salir. */
	sourceUnits: bigint
	/** Mínimo del destino (pools Stacks), en unidades mínimas. */
	minUnits?: bigint | null
	hasTarget: boolean
}

export type StakeFormState = {
	/** null = sin importe válido (o acción sin importe). */
	amountUnits: bigint | null
	error: StakeFormError | null
	canContinue: boolean
}

export const validateStakeForm = ({ action, kind, amountText, decimals, sourceUnits, minUnits = null, hasTarget }: StakeFormInput): StakeFormState => {
	const needsTarget = actionNeedsTarget(action)
	if (!actionNeedsAmount(action, kind)) {
		const error = needsTarget && !hasTarget ? { key: 'noTarget' as const } : null
		return { amountUnits: null, error, canContinue: !error }
	}

	let amountUnits: bigint | null = null
	let error: StakeFormError | null = null
	if (amountText.trim()) {
		try {
			amountUnits = parseUnits(amountText, decimals)
			if (amountUnits <= 0n) error = { key: 'amountZero' }
			else if (amountUnits > sourceUnits) error = { key: 'insufficient' }
			else if (minUnits !== null && amountUnits < minUnits) error = { key: 'belowMin', min: minUnits }
		} catch {
			error = { key: 'amountInvalid', decimals }
		}
	}
	// El destino que falta no se grita mientras el usuario aún no escribió nada
	if (!error && amountUnits !== null && needsTarget && !hasTarget) error = { key: 'noTarget' }
	return { amountUnits: error ? null : amountUnits, error, canContinue: !error && amountUnits !== null }
}

/** MÁX: todo lo que hay en la fuente menos la reserva para la comisión (nunca negativo). */
export const maxStakeUnits = (sourceUnits: bigint, reserve: bigint): bigint =>
	sourceUnits > reserve ? sourceUnits - reserve : 0n
