import { useQuery } from '@tanstack/react-query'

import { userApi } from '../api/userApi'
import { unwrap } from '../api/unwrap'
import { unwrapMethodsPayload } from '../screens/withdraw/paymentMethodDetails'
import type { SavedPaymentMethod } from '../screens/withdraw/paymentMethodDetails'

/**
 * Métodos de pago guardados del usuario (`GET /user/payment-methods`), compartidos
 * por el librito del retiro y del P2P. Ajustes → Métodos de pago invalida la clave
 * tras crear, editar o borrar para que las dos superficies se enteren sin reiniciar.
 *
 * Sin persistir: son tarjetas y wallets, nunca a disco (`meta.noPersist`).
 */
export const PAYMENT_METHODS_KEY = ['user', 'payment-methods'] as const

export const PAYMENT_METHODS_QUERY = {
	queryKey: PAYMENT_METHODS_KEY,
	queryFn: async (): Promise<SavedPaymentMethod[]> => unwrapMethodsPayload(unwrap(await userApi.getPaymentMethods())),
	staleTime: 60 * 1000,
	meta: { noPersist: true },
}

/** Lista de métodos guardados; `enabled` evita pedirla hasta que haga falta (moneda elegida). */
export const usePaymentMethodsQuery = (enabled = true) => useQuery({ ...PAYMENT_METHODS_QUERY, enabled })
