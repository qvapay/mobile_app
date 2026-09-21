/**
 * Alquiler de energía TRON en React Query, raíz `['energy', …]`.
 *
 * Aquí vive SOLO lo que habla con qpweb (precios, órdenes). Los recursos de la
 * cuenta —energía y ancho de banda disponibles— son dato on-chain y viven en
 * `walletQueries.ts` con el resto de la wallet, bajo sus reglas.
 *
 * La compra NO está aquí: como toda mutación de dinero de la app, es una
 * llamada directa al módulo de `api/` con clave de idempotencia, más las
 * invalidaciones que toquen (ver `useEnergyRent`).
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

// API
import { energyApi } from '../../../api/energyApi'
import { shouldRetry, unwrap } from '../../../api/unwrap'
import type { ApiError } from '../../../api/unwrap'
import { trimToFirstPage } from '../../../api/queryUtils'

// Tipos
import type { EnergyDuration, EnergyOrder, EnergyOrderStatus, EnergyPriceRow, EnergyPricesPayload } from '../../../types/domain'

export const ENERGY_PRICES_KEY = ['energy', 'prices']
export const ENERGY_ORDERS_KEY = ['energy', 'orders']
export const ENERGY_ORDER_KEY = ['energy', 'order']

/**
 * Frescura de la tabla de precios. El backend limita a 3 peticiones cada 10s
 * por cuenta y la tabla la miran dos superficies a la vez (la pantalla de
 * recursos y el aviso del envío), así que la clave va SIN parámetros: una
 * sola query compartida y deduplicada.
 */
const PRICES_STALE_MS = 60_000

export { trimToFirstPage }

/**
 * Tabla de precios del momento. Su error 503 es también la señal de
 * disponibilidad del producto entero: sin precios no se pinta ningún botón de
 * comprar (uno deshabilitado es peor que ninguno).
 */
export const useEnergyPricesQuery = () => useQuery<EnergyPricesPayload | null>({
	queryKey: ENERGY_PRICES_KEY,
	queryFn: async () => unwrap(await energyApi.prices()),
	staleTime: PRICES_STALE_MS,
	// El 503 no es un 4xx, así que la política general lo reintentaría dos
	// veces contra un bucket de 3/10s. Cuando el proveedor no está, no está.
	retry: (count, error) => (error as ApiError)?.status !== 503 && shouldRetry(count, error),
	placeholderData: previous => previous,
})

/** Precio publicado de un monto y una duración concretos, si están en la tabla. */
export const priceFor = (rows: EnergyPriceRow[] | undefined, volume: number, duration: EnergyDuration): number | null =>
	rows?.find(row => row.volume === volume && row.duration === duration)?.price_usd ?? null

/**
 * Estimación para un volumen fuera de la tabla, a partir del precio por
 * unidad de esa duración. Es orientativa a propósito: el precio que se cobra
 * lo fija `/quote`, y la energía se mueve con la demanda de la red.
 */
export const estimatePrice = (rows: EnergyPriceRow[] | undefined, volume: number, duration: EnergyDuration): number | null => {
	const exact = priceFor(rows, volume, duration)
	if (exact !== null) { return exact }
	const unit = rows?.find(row => row.duration === duration)?.unit_price_usd
	if (!unit || !Number.isFinite(unit)) { return null }
	return Math.ceil(unit * volume * 100) / 100
}

export const ENERGY_ORDERS_PAGE_SIZE = 20

/** Historial de compras de energía, 20 por página. */
export const useEnergyOrdersQuery = (status?: EnergyOrderStatus) => useInfiniteQuery({
	queryKey: [...ENERGY_ORDERS_KEY, status ?? 'all'],
	queryFn: async ({ pageParam }) => {
		const payload = await energyApi.orders({ page: pageParam, status })
		return unwrap(payload)
	},
	initialPageParam: 1,
	getNextPageParam: (lastPage) => {
		const meta = lastPage?.meta
		return meta && meta.page < meta.last_page ? meta.page + 1 : undefined
	},
	staleTime: 30_000,
})

/** Todas las órdenes ya cargadas, aplanadas. */
export const flattenOrders = (pages: Array<{ data: EnergyOrder[] } | null> | undefined): EnergyOrder[] =>
	(pages ?? []).flatMap(page => page?.data ?? [])
