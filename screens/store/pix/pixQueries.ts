import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { pixApi } from '../../../api/pixApi'
import { unwrap } from '../../../api/unwrap'
import type { PixEligibility } from '../../../types/domain'

export const PIX_ELIGIBILITY_KEY = ['pix', 'eligibility'] as const

/** El cobro abierto: su QR nunca se escribe a disco (`noPersist`). */
export const pixChargeKey = (uuid: string) => ['pix', 'charge', uuid] as const

/**
 * Si se puede pagar con PIX ahora (`GET /pix/eligibility`). Depende del país desde el que se
 * navega, así que no se persiste. Si falla, o con un qpweb sin la ruta (404), la opción
 * simplemente no aparece: la compra con saldo sigue igual.
 *
 * @param enabled - Solo se pide cuando la compra ya va a pagarse.
 */
export const usePixEligibilityQuery = (enabled: boolean): UseQueryResult<PixEligibility | null> => useQuery({
	queryKey: PIX_ELIGIBILITY_KEY,
	queryFn: async () => unwrap(await pixApi.getEligibility()),
	enabled,
	staleTime: 30_000,
	meta: { noPersist: true },
})
