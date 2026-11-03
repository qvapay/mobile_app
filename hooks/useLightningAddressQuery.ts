import { useCallback } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'

import { userApi } from '../api/userApi'
import { unwrap } from '../api/unwrap'
import { trimToFirstPage } from '../api/queryUtils'
import { LIGHTNING_ADDRESS_KEY, LN_PAYMENTS_PAGE_SIZE, LN_STATE_CHANGED_CODES } from '../helpers/lightningAddress'
import type { ApiResult } from '../types/api'
import type { LightningAddressAction, LightningAddressState, LightningPayment } from '../types/domain'

/**
 * Lightning Address del usuario (`GET /user/lightning-address`), compartida por
 * Recibir (pestaña Lightning), el subpanel de Ajustes y la píldora de sats.
 *
 * Es UNA query infinita en la que cada página es el State completo: la primera
 * trae el estado + los 20 cobros más recientes y las siguientes solo aportan
 * más cobros. Se persiste (el persister la recorta a la primera página), así
 * que Recibir pinta la dirección al instante incluso sin red.
 */
export { LIGHTNING_ADDRESS_KEY }

export type LightningAddressData = InfiniteData<LightningAddressState, unknown>

export const useLightningAddressQuery = (enabled = true) => useInfiniteQuery({
	queryKey: LIGHTNING_ADDRESS_KEY,
	queryFn: async ({ pageParam }): Promise<LightningAddressState> => {
		const state = unwrap(await userApi.getLightningAddress(pageParam))
		if (!state) throw new Error('empty')
		return state
	},
	initialPageParam: 1,
	getNextPageParam: (last, _all, lastParam) => (last.payments.length >= LN_PAYMENTS_PAGE_SIZE ? lastParam + 1 : undefined),
	staleTime: 30 * 1000,
	enabled,
})

/** Estado (de la primera página) y todos los cobros cargados, aplanados. */
export const selectLightningAddress = (data: LightningAddressData | undefined): { state: LightningAddressState | null, payments: LightningPayment[] } => ({
	state: data?.pages[0] ?? null,
	payments: data?.pages.flatMap(p => p.payments) ?? [],
})

/**
 * Acción sobre la dirección (activar, renombrar, pausar, reanudar, unidad).
 * Todo POST responde el State entero: con éxito se vuelca a la caché como única
 * página (sin refetch); si el servidor dice que la caché estaba vieja
 * (`LN_ADDRESS_EXISTS`, `…_STATE_CHANGED`, `…_NOT_FOUND`, `LN_SATS_DISABLED`)
 * se recorta y se vuelve a pedir.
 */
export const useLightningAddressAction = () => {
	const queryClient = useQueryClient()
	return useCallback(async (body: LightningAddressAction): Promise<ApiResult<LightningAddressState>> => {
		const result = await userApi.postLightningAddress(body)
		if (result.success && result.data) {
			queryClient.setQueryData<LightningAddressData>(LIGHTNING_ADDRESS_KEY, { pages: [result.data], pageParams: [1] })
		} else if (!result.success) {
			const code = (result.details as { code?: string } | undefined)?.code
			if (code && LN_STATE_CHANGED_CODES.has(code)) {
				queryClient.setQueryData<LightningAddressData>(LIGHTNING_ADDRESS_KEY, trimToFirstPage)
				queryClient.invalidateQueries({ queryKey: LIGHTNING_ADDRESS_KEY })
			}
		}
		return result
	}, [queryClient])
}
