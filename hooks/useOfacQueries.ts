import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// API
import { userApi } from '../api/userApi'
import { transferApi } from '../api/transferApi'
import { unwrap } from '../api/unwrap'

/**
 * Comprobaciones de compliance OFAC que deciden si una operación lleva
 * atestación. Se resuelven EN EL MOMENTO del toque (`fetchQuery`: sirve la caché
 * si está fresca, si no pide) — un estado reactivo aún cargando dejaría pasar
 * sin atestación a quien tocó rápido.
 *
 * FAIL-CLOSED: si la petición falla, se devuelve `true` y se pide la
 * atestación igualmente — pedir de más es fricción, no pedir es una operación
 * sin certificado. Sin persistir (derivan de datos KYC/CIP).
 */

/**
 * ¿El titular se autodeclaró US person? (`GET /user/cip` → `us_person`, la
 * ÚNICA fuente del backend). Decide la atestación de fondeo del depósito y el
 * nombre del destinatario en recargas a Cuba.
 */
export const US_PERSON_QUERY = {
	queryKey: ['user', 'cip'] as const,
	queryFn: async () => unwrap(await userApi.getCip()),
	staleTime: 10 * 60 * 1000,
	meta: { noPersist: true },
}

/** ¿La transferencia a `to` exige la certificación CACR? (destinatario nacional cubano). */
export const transferOfacQuery = (to: string) => ({
	queryKey: ['transfer', 'ofac-check', to] as const,
	queryFn: async () => unwrap(await transferApi.ofacCheck(to)),
	staleTime: 5 * 60 * 1000,
	meta: { noPersist: true },
})

/** Resolutores async (fail-closed) para los handlers de las pantallas. */
export const useOfacChecks = () => {
	const queryClient = useQueryClient()

	const resolveUsPerson = useCallback(async (): Promise<boolean> => {
		try {
			const cip = await queryClient.fetchQuery(US_PERSON_QUERY)
			return cip ? cip.us_person === true : true
		} catch { return true }
	}, [queryClient])

	const resolveTransferRequired = useCallback(async (to: string): Promise<boolean> => {
		try {
			const check = await queryClient.fetchQuery(transferOfacQuery(to))
			return check ? check.required === true : true
		} catch { return true }
	}, [queryClient])

	/** Precarga (p. ej. al montar la pantalla) para que el toque no espere red. */
	const prefetchUsPerson = useCallback(() => { queryClient.prefetchQuery(US_PERSON_QUERY) }, [queryClient])
	const prefetchTransfer = useCallback((to: string) => { queryClient.prefetchQuery(transferOfacQuery(to)) }, [queryClient])

	return { resolveUsPerson, resolveTransferRequired, prefetchUsPerson, prefetchTransfer }
}
