import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { UseInfiniteQueryResult, UseQueryResult, InfiniteData } from '@tanstack/react-query'

// API
import { marketApi } from '../../../api/marketApi'
import { unwrap } from '../../../api/unwrap'

import type { MarketStore as MarketStoreTile } from '../../../ui/store/StoreTile'
import type { MarketProduct as MarketProductTile } from '../../../ui/store/ProductTile'
import type { ShipTo } from './cartCore'

/**
 * Tienda pública del marketplace: lo que pinta `StoreTile` más los campos
 * extra que lee el escaparate (`MarketStore.tsx`) y el índice filtrado.
 * Derivado del uso, no del schema del backend.
 */
export type MarketShop = MarketStoreTile & {
	category?: string | null
	description?: string | null
	returns_policy?: string | null
	accept_reviews?: boolean | null
	rating_count?: number | null
	socials?: Record<string, unknown> | null
}

/** Variante de un producto en la ficha pública (`GET /market/products/{uuid}`). */
export type MarketVariant = {
	uuid?: string
	price?: number | string | null
	stock?: number | null
	image?: string | null
	options?: Record<string, string> | null
}

/** Ficha pública de un producto: lo que pinta `ProductTile` más el detalle. */
export type MarketProductDetail = MarketProductTile & {
	description?: string | null
	kind?: string | null
	images?: string[] | null
	option_axes?: string[] | null
	variants?: MarketVariant[] | null
	ship_to?: ShipTo | null
}

/** Pedido del marketplace como comprador (solo lo que leen lista y detalle). */
export type MarketOrder = {
	uuid?: string
	status?: string
	total?: number | string | null
	quantity?: number
	unit_price?: number | string | null
	gift_card_amount?: number | string | null
	tracking_code?: string | null
	note?: string | null
	created_at?: string
	delivered_at?: string | null
	product?: { title?: string | null, main_image?: string | null, kind?: string | null } | null
	variant?: { options?: Record<string, string> | null } | null
	shop?: { slug?: string | null, name?: string | null, logo?: string | null } | null
}

/** Página de `GET /market/orders` tal y como la normaliza la query infinita. */
export type OrdersPage = { orders: MarketOrder[], total: number | null }

export const ORDERS_PAGE_SIZE = 20

/**
 * Índice de tiendas aprobadas (`GET /market/stores`). El backend pagina de a
 * 50 máximo y el índice completo hoy cabe en una página, así que la paginación
 * y los filtros siguen siendo de cliente (MarketStores.tsx); la búsqueda
 * federada más allá de la página cargada tampoco se cachea — es efímera.
 *
 * @param take - Tamaño de la página del índice.
 * @returns La query de React Query con la lista de tiendas.
 */
export const useMarketStoresIndexQuery = (take: number): UseQueryResult<MarketShop[]> => useQuery({
	queryKey: ['market', 'stores', take],
	queryFn: async () => (unwrap(await marketApi.getStores({ take })) as { stores?: MarketShop[] } | null)?.stores || [],
	placeholderData: previous => previous,
})

/**
 * Escaparate de una tienda (`GET /market/stores/{slug}`): la tienda con sus
 * primeros productos embebidos. Clave por slug — reemplaza al caché manual
 * `market_shop:{slug}` de dataCache. Las páginas extra del catálogo son
 * estado local de MarketStore.tsx (se descartan en cada refresh, como antes).
 *
 * @param slug - Slug público de la tienda.
 * @returns La query con `{ store, products }`.
 */
export const useMarketShopQuery = (slug: string | undefined): UseQueryResult<{ store: MarketShop | null, products: MarketProductDetail[] }> => useQuery({
	queryKey: ['market', 'shop', slug],
	queryFn: async () => {
		const data = unwrap(await marketApi.getStore(slug as string)) as { store?: MarketShop | null, products?: MarketProductDetail[] } | null
		return { store: data?.store || null, products: data?.products || [] }
	},
	enabled: !!slug,
	placeholderData: previous => previous,
})

/**
 * Política de paginación de pedidos: el backend devuelve `total`, así que hay
 * página siguiente mientras lo acumulado no lo alcance. Un `total` ausente
 * corta el scroll (mismo guard `total == null` de la versión manual).
 *
 * @param lastPage - Última página recibida.
 * @param allPages - Todas las páginas acumuladas.
 * @param lastPageParam - Número de la última página pedida.
 * @returns La página siguiente, o undefined cuando no hay más.
 */
export const getNextOrdersPage = (lastPage: OrdersPage, allPages: OrdersPage[], lastPageParam: number): number | undefined => {
	const total = lastPage?.total
	if (total == null) return undefined
	const loaded = allPages.reduce((sum, page) => sum + (page.orders?.length || 0), 0)
	return loaded < total ? lastPageParam + 1 : undefined
}

/**
 * Aplana las páginas de pedidos deduplicando por uuid: si un pedido nuevo
 * entra entre dos fetches, el corrimiento de offsets puede repetir uno en la
 * página siguiente (la versión manual tenía el mismo filtro).
 *
 * @param pages - Páginas acumuladas por la query infinita.
 * @returns Pedidos aplanados y sin duplicados.
 */
export const flattenOrders = (pages?: OrdersPage[]): MarketOrder[] => {
	const seen = new Set<string>()
	const flat: MarketOrder[] = []
	for (const page of pages || []) {
		for (const order of page.orders || []) {
			if (order?.uuid && seen.has(order.uuid)) continue
			if (order?.uuid) seen.add(order.uuid)
			flat.push(order)
		}
	}
	return flat
}

/**
 * Pedidos del usuario como comprador (`GET /market/orders`), paginado.
 * Persistido solo con su primera página (el `serialize` global recorta toda
 * query infinita), igual que hacía dataCache con `market_orders`.
 *
 * @returns La query infinita de pedidos.
 */
export const useMarketOrdersInfiniteQuery = (): UseInfiniteQueryResult<InfiniteData<OrdersPage, number>> => useInfiniteQuery({
	queryKey: ['market', 'orders'],
	queryFn: async ({ pageParam }): Promise<OrdersPage> => {
		const data = unwrap(await marketApi.getOrders({ page: pageParam, take: ORDERS_PAGE_SIZE })) as { orders?: MarketOrder[], total?: number | null } | null
		return { orders: data?.orders || [], total: data?.total ?? null }
	},
	initialPageParam: 1,
	getNextPageParam: getNextOrdersPage,
})
