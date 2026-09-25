/**
 * Intercambio cripto↔cripto de la wallet en React Query, raíz `['exchange', …]`.
 *
 * Aquí vive SOLO lo que se lee de qpweb: catálogo, cotización e historial. Abrir la
 * operación NO está aquí — como toda mutación de dinero de la app es una llamada directa al
 * módulo de `api/` con clave de idempotencia (ver `useExchangeOrder`).
 *
 * La cotización merece una nota: es la única query de la app cuyo resultado CADUCA por sí
 * solo (2 minutos de congelación server-side). Por eso no se persiste y por eso su
 * `staleTime` es corto — servir una cotización de caché sería enseñar un precio que ya no
 * se puede ejecutar.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

// API
import { exchangeApi } from '../../../api/exchangeApi'
import { shouldRetry, unwrap } from '../../../api/unwrap'
import type { ApiError } from '../../../api/unwrap'
import { trimToFirstPage } from '../../../api/queryUtils'

// Tipos
import type { ExchangeCatalogPayload, ExchangeOrder, ExchangeQuotePayload, ExchangeStatus } from '../../../types/domain'
import { isLive } from './exchangeModel'

export const EXCHANGE_CATALOG_KEY = ['exchange', 'catalog']
export const EXCHANGE_QUOTE_KEY = ['exchange', 'quote']
export const EXCHANGE_ORDERS_KEY = ['exchange', 'orders']
export const EXCHANGE_ORDER_KEY = ['exchange', 'order']

export { trimToFirstPage }

/** El catálogo solo cambia cuando desplegamos: una hora de frescura sobra. */
const CATALOG_STALE_MS = 60 * 60_000
/** La congelación del backend dura 2 min; se recotiza antes de llegar ahí. */
const QUOTE_STALE_MS = 45_000
/** Mientras la operación está viva, se pregunta seguido: es "¿dónde está mi dinero?". */
const LIVE_POLL_MS = 8_000

/**
 * Qué se puede intercambiar. Su 503 es también la señal de disponibilidad del producto: sin
 * catálogo no se pinta el intercambio (un botón deshabilitado es peor que ninguno).
 */
export const useExchangeCatalogQuery = () => useQuery<ExchangeCatalogPayload | null>({
	queryKey: EXCHANGE_CATALOG_KEY,
	queryFn: async () => unwrap(await exchangeApi.catalog()),
	staleTime: CATALOG_STALE_MS,
	retry: (count, error) => (error as ApiError)?.status !== 503 && shouldRetry(count, error),
	placeholderData: previous => previous,
})

/**
 * Cotización de un par e importe.
 *
 * `enabled` lo decide la pantalla: cotizar con el campo a medio teclear gasta el bucket del
 * backend (20/min) para nada. Los saldos van en el cuerpo pero NO en la clave — son un dato
 * auxiliar para el aviso de origen más barato, y meterlos en la clave recotizaría entera la
 * pantalla cada vez que un saldo on-chain se refresca.
 */
export const useExchangeQuoteQuery = ({ fromAssetId, toAssetId, amount, balances, enabled }: {
	fromAssetId: string | null
	toAssetId: string | null
	amount: number
	balances?: Record<string, string | number>
	enabled: boolean
}) => useQuery<ExchangeQuotePayload | null>({
	queryKey: [...EXCHANGE_QUOTE_KEY, fromAssetId ?? '', toAssetId ?? '', amount],
	queryFn: async () => unwrap(await exchangeApi.quote({ fromAssetId: fromAssetId!, toAssetId: toAssetId!, amount, balances })),
	enabled: enabled && !!fromAssetId && !!toAssetId && amount > 0,
	staleTime: QUOTE_STALE_MS,
	// Un precio caducado no se reintenta solo: lo pide la pantalla cuando toca
	refetchOnMount: false,
	// Recotizar sola cuando la congelación está por vencer, para que confirmar no falle
	refetchInterval: QUOTE_STALE_MS,
	// Un 400 (por debajo del mínimo, par no soportado) es información, no un fallo a reintentar
	retry: shouldRetry,
	// Cambiar de importe no debe vaciar la pantalla mientras llega la nueva
	placeholderData: previous => previous,
	// La congelación es efímera y con user_id dentro: persistirla sería guardar un precio muerto
	meta: { noPersist: true },
})

/**
 * Una operación concreta. Mientras está viva se sondea cada 8 s (el backend consulta al
 * proveedor por nosotros); en cuanto es terminal deja de preguntarse para siempre.
 */
export const useExchangeOrderQuery = (uuid: string | null | undefined) => useQuery<ExchangeOrder | null>({
	queryKey: [...EXCHANGE_ORDER_KEY, uuid ?? ''],
	queryFn: async () => unwrap(await exchangeApi.get(uuid!)),
	enabled: !!uuid,
	refetchInterval: query => {
		const order = query.state.data as ExchangeOrder | null | undefined
		// Sin datos todavía también se sondea: puede ser el primer intento tras abrirla
		return !order || isLive(order.status) ? LIVE_POLL_MS : false
	},
	placeholderData: previous => previous,
})

export const EXCHANGE_ORDERS_PAGE_SIZE = 20

/** Historial de intercambios. */
export const useExchangeOrdersQuery = (status?: ExchangeStatus) => useInfiniteQuery({
	queryKey: [...EXCHANGE_ORDERS_KEY, status ?? 'all'],
	queryFn: async ({ pageParam = 1 }) => unwrap(await exchangeApi.list({ page: pageParam as number, status })),
	initialPageParam: 1,
	getNextPageParam: (last) => {
		const meta = last?.meta
		return meta && meta.page < meta.last_page ? meta.page + 1 : undefined
	},
	placeholderData: previous => previous,
})

export const flattenExchangeOrders = (pages: Array<{ data: ExchangeOrder[] } | null> | undefined): ExchangeOrder[] =>
	(pages ?? []).flatMap(page => page?.data ?? [])
