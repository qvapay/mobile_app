/**
 * La orden de energía que quedó COBRADA y sin entregar al cerrarse la app (la nota `order`
 * de `energyPending`). Se consulta una vez al entrar: si ya cerró, la nota se borra; si
 * sigue viva, quien ofrece el alquiler lo sabe y no deja que el usuario compre otro
 * creyendo que el primero se perdió.
 */
import { useEffect, useState } from 'react'

import { energyApi } from '../../../api/energyApi'
import { clearPendingOrder, readPendingEnergy } from './energyPending'
import { isTerminalOrder } from './energyRentMachine'
import type { EnergyOrder } from '../../../types/domain'

/** @param userKey uuid de la cuenta que paga; sin él (sin sesión) no hay nada que mirar. */
export const usePendingEnergyOrder = (userKey: string | null | undefined): EnergyOrder | null => {

	const [order, setOrder] = useState<EnergyOrder | null>(null)

	useEffect(() => {
		let cancelled = false
		setOrder(null)
		if (!userKey) { return }
		readPendingEnergy(userKey).then(async ({ order: pending }) => {
			if (!pending || cancelled) { return }
			const result = await energyApi.order(pending.uuid)
			if (cancelled) { return }
			// Esa orden no es de esta cuenta (una nota heredada de otra) o ya no existe
			if (!result.success && result.status === 404) { clearPendingOrder(userKey); return }
			const fresh = result.success ? result.data?.data ?? null : null
			if (!fresh) { return }
			if (isTerminalOrder(fresh)) { clearPendingOrder(userKey); return }
			setOrder(fresh)
		})
		return () => { cancelled = true }
	}, [userKey])

	return order
}

export default usePendingEnergyOrder
