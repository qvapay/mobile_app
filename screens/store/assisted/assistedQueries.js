import { useQuery } from '@tanstack/react-query'

// API
import { shopApi } from '../../../api/shopApi'
import { unwrap } from '../../../api/unwrap'

/**
 * Queries de compras asistidas (Personal Shopper). El carrito lleva
 * `meta.noPersist`: es estado vivo de una sesión de compra, no un snapshot que
 * tenga sentido rehidratar días después.
 */

/** Pedidos asistidos del usuario. */
export const useAssistedOrdersQuery = () => useQuery({
	queryKey: ['assisted', 'orders'],
	queryFn: async () => unwrap(await shopApi.getOrders())?.orders || [],
	placeholderData: previous => previous,
})

/** Detalle de un pedido asistido. */
export const useAssistedOrderQuery = (id) => useQuery({
	queryKey: ['assisted', 'order', id],
	queryFn: async () => unwrap(await shopApi.getOrder(id))?.order || null,
	enabled: !!id,
	placeholderData: previous => previous,
})

/** Estantería de productos recientes (la portada del Personal Shopper). */
export const useAssistedRecentQuery = () => useQuery({
	queryKey: ['assisted', 'recent'],
	queryFn: async () => unwrap(await shopApi.getRecentProducts())?.products || [],
	placeholderData: previous => previous,
})

/** Carrito asistido (item_count para el badge, products para la pantalla). */
export const useAssistedCartQuery = () => useQuery({
	queryKey: ['assisted', 'cart'],
	queryFn: async () => unwrap(await shopApi.getCart())?.cart || null,
	meta: { noPersist: true },
})
