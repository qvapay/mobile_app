import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

// API
import { marketApi } from '../../../api/marketApi'
import { unwrap } from '../../../api/unwrap'

/** Raíz de las claves del marketplace (Seller Shops). */
export const MARKET_QUERY_KEY = ['market']

export const ORDERS_PAGE_SIZE = 20

/**
 * Índice de tiendas aprobadas (`GET /market/stores`). El backend pagina de a
 * 50 máximo y el índice completo hoy cabe en una página, así que la paginación
 * y los filtros siguen siendo de cliente (MarketStores.jsx); la búsqueda
 * federada más allá de la página cargada tampoco se cachea — es efímera.
 *
 * @param {number} take - Tamaño de la página del índice.
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export const useMarketStoresIndexQuery = (take) => useQuery({
	queryKey: ['market', 'stores', take],
	queryFn: async () => unwrap(await marketApi.getStores({ take }))?.stores || [],
	placeholderData: previous => previous,
})

/**
 * Escaparate de una tienda (`GET /market/stores/{slug}`): la tienda con sus
 * primeros productos embebidos. Clave por slug — reemplaza al caché manual
 * `market_shop:{slug}` de dataCache. Las páginas extra del catálogo son
 * estado local de MarketStore.jsx (se descartan en cada refresh, como antes).
 *
 * @param {string} slug - Slug público de la tienda.
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export const useMarketShopQuery = (slug) => useQuery({
	queryKey: ['market', 'shop', slug],
	queryFn: async () => {
		const data = unwrap(await marketApi.getStore(slug))
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
 * @param {{ orders: Array, total: number|null }} lastPage
 * @param {Array} allPages
 * @param {number} lastPageParam
 * @returns {number|undefined}
 */
export const getNextOrdersPage = (lastPage, allPages, lastPageParam) => {
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
 * @param {Array<{ orders: Array }>} [pages]
 * @returns {Array}
 */
export const flattenOrders = (pages) => {
	const seen = new Set()
	const flat = []
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
 * @returns {import('@tanstack/react-query').UseInfiniteQueryResult}
 */
export const useMarketOrdersInfiniteQuery = () => useInfiniteQuery({
	queryKey: ['market', 'orders'],
	queryFn: async ({ pageParam }) => {
		const data = unwrap(await marketApi.getOrders({ page: pageParam, take: ORDERS_PAGE_SIZE }))
		return { orders: data?.orders || [], total: data?.total ?? null }
	},
	initialPageParam: 1,
	getNextPageParam: getNextOrdersPage,
})
