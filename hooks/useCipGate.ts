import { useCallback } from 'react'
import { useNavigation } from '@react-navigation/native'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { USER_CIP_QUERY } from './useOfacQueries'
import { activeCipRequirement } from '../helpers/cipRequirement'
import { notifyCipRequired } from '../helpers/cipRejection'
import { ROUTES } from '../routes'

import type { CipGateAction } from '../helpers/cipRequirement'
import type { CipWithdrawRequirement } from '../types/domain'

export type CipGate = {
	/** Requisito vigente de la ficha (aviso o bloqueo), o null. */
	requirement: CipWithdrawRequirement | null
	/** El servidor ya rechaza esta salida: el botón de la pantalla se apaga. */
	blocking: boolean
	/** Abre Ajustes → Datos personales. */
	openCip: () => void
	/** Lee un rechazo: si es `CIP_REQUIRED` lo avisa, relee la ficha y devuelve true. */
	handleRejection: (details: unknown) => boolean
}

/**
 * Puerta de la ficha CIP en una salida de valor (retiro, saldo → wallet, venta P2P).
 * Lee `withdraw_requirement` de la MISMA query `['user','cip']` que Datos personales, así
 * que guardar la dirección allí apaga el aviso aquí sin más.
 *
 * @param action - La salida de esta pantalla.
 * @param options.enabled - false = ni se pide la ficha ni hay aviso (p. ej. una oferta de compra).
 */
export default function useCipGate(action: CipGateAction, { enabled = true }: { enabled?: boolean } = {}): CipGate {

	const navigation = useNavigation()
	const queryClient = useQueryClient()
	const { data: cip } = useQuery({ ...USER_CIP_QUERY, enabled })

	const requirement = enabled ? activeCipRequirement(cip) : null

	const openCip = useCallback(() => {
		navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.USERDATA, initial: false })
	}, [navigation])

	const handleRejection = useCallback((details: unknown) => {
		if (!notifyCipRequired(details, action, openCip)) { return false }
		// La ficha en caché decía otra cosa (o no había llegado): que el aviso fijo aparezca
		queryClient.invalidateQueries({ queryKey: USER_CIP_QUERY.queryKey })
		return true
	}, [action, openCip, queryClient])

	return { requirement, blocking: requirement?.blocking === true, openCip, handleRejection }
}
