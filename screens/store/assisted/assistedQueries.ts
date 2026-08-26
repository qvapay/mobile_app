import { useQuery } from '@tanstack/react-query'

// API
import { shopApi } from '../../../api/shopApi'
import { unwrap } from '../../../api/unwrap'

// Types
import type { AssistedCartData, AssistedOrder, AssistedProductData } from './assistedConstants'

/**
 * Queries de compras asistidas (Personal Shopper). El carrito lleva
 * `meta.noPersist`: es estado vivo de una sesión de compra, no un snapshot que
 * tenga sentido rehidratar días después.
 *
 * Los endpoints de `shopApi` devuelven `ApiResult<unknown>` (el módulo no
 * modela los cuerpos), así que cada `queryFn` estrecha el `unwrap` con un cast
 * al sobre que documenta shopApi: `{ orders }`, `{ order }`, `{ products }`,
 * `{ cart }`.
 */

/** Pedidos asistidos del usuario. */
export const useAssistedOrdersQuery = () => useQuery({
	queryKey: ['assisted', 'orders'],
	queryFn: async () => (unwrap(await shopApi.getOrders()) as { orders?: AssistedOrder[] } | null)?.orders || [],
	placeholderData: previous => previous,
})

/** Detalle de un pedido asistido. */
export const useAssistedOrderQuery = (id?: number | string) => useQuery({
	queryKey: ['assisted', 'order', id],
	queryFn: async () => (unwrap(await shopApi.getOrder(id as number | string)) as { order?: AssistedOrder } | null)?.order || null,
	enabled: !!id,
	placeholderData: previous => previous,
})

/** Estantería de productos recientes (la portada del Personal Shopper). */
export const useAssistedRecentQuery = () => useQuery({
	queryKey: ['assisted', 'recent'],
	queryFn: async () => (unwrap(await shopApi.getRecentProducts()) as { products?: AssistedProductData[] } | null)?.products || [],
	placeholderData: previous => previous,
})

/** Carrito asistido (item_count para el badge, products para la pantalla). */
export const useAssistedCartQuery = () => useQuery({
	queryKey: ['assisted', 'cart'],
	queryFn: async () => (unwrap(await shopApi.getCart()) as { cart?: AssistedCartData } | null)?.cart || null,
	meta: { noPersist: true },
})
