/**
 * Lecturas del retiro en React Query, raíz `['withdraw', …]`.
 *
 * Zonas de entrega de efectivo (`GET /withdraw/cash-zones?coin=`): el tarifario por
 * municipio con el que la app cotiza EXACTAMENTE el fee que cobra el servidor (ver
 * `cashZones.ts`). Solo se piden para monedas cuyo formulario tiene provincia (select) +
 * municipio. Público y cacheado 60 s en el servidor: misma frescura aquí.
 */
import { useQuery } from '@tanstack/react-query'

import { withdrawApi } from '../../api/withdrawApi'
import { unwrap } from '../../api/unwrap'
import { DEFAULT_MARGIN_PCT } from './cashZones'
import type { CashZonesPayload } from '../../types/domain'

export const CASH_ZONES_KEY = ['withdraw', 'cash-zones']

const noZones = (coin: string): CashZonesPayload => ({ coin, margin_pct: DEFAULT_MARGIN_PCT, zones: [] })

/** Estado de la tarifa de zonas: `off` = la moneda no la necesita. */
export type CashZonesStatus = 'off' | 'loading' | 'ready' | 'error'

/**
 * @param tick - Ticker de la moneda elegida (null si no hay).
 * @param enabled - Si el formulario de la moneda tiene campos de provincia y municipio.
 */
export const useCashZonesQuery = (tick: string | null | undefined, enabled: boolean) => {
	const active = !!tick && enabled
	const query = useQuery<CashZonesPayload>({
		queryKey: [...CASH_ZONES_KEY, tick ?? ''],
		queryFn: async () => {
			const result = await withdrawApi.cashZones(tick!)
			// Un qpweb anterior a las zonas no tiene la ruta: allí el retiro cobra el fee de siempre
			if (!result.success && result.status === 404) return noZones(tick!)
			const data = unwrap(result)
			return data && Array.isArray(data.zones) ? data : noZones(tick!)
		},
		enabled: active,
		staleTime: 60_000,
	})

	// Un fallo NO se lee como "sin zonas": el servidor cobraría por zona igualmente y la
	// pantalla habría cotizado otro fee. Sin tarifa no se cotiza (la pantalla ofrece reintentar)
	const status: CashZonesStatus = !active ? 'off'
		: query.data ? 'ready'
			: query.isError ? 'error'
				: 'loading'

	return { payload: active ? query.data ?? null : null, status, refetch: query.refetch }
}
