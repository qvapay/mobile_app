import { useInfiniteQuery } from '@tanstack/react-query'

// API
import { transferApi } from '../../api/transferApi'
import { unwrap } from '../../api/unwrap'

// Tipos
import type { Transaction } from '../../types/domain'

/**
 * Filtros aplicados del histórico tal y como viajan a `GET /transaction`
 * (query params planos, siempre string: fechas ISO, montos saneados, status…).
 */
export type TransactionsFilters = Record<string, string>

export const PAGE_SIZE = 20

/**
 * Clave del histórico paginado para un juego de filtros dado.
 *
 * Los filtros van DENTRO de la clave: cambiar un filtro o buscar es cambiar de
 * query, con su propia caché y su propio ciclo de carga. Eso reemplaza al
 * antiguo trío `clear` + reset de cursores + refetch manual — React Query
 * arranca la query nueva sola. El hash de claves es estable ante el orden de
 * las propiedades, así que `{a,b}` y `{b,a}` son la misma query.
 *
 * @param filters - Filtros aplicados (search, date_from, status…).
 * @returns Query key jerárquica bajo la raíz `['transactions']`.
 */
export const transactionsListKey = (filters: TransactionsFilters = {}): (string | TransactionsFilters)[] => ['transactions', 'list', filters]

/**
 * Política de paginación: hay página siguiente solo si la última vino llena.
 * Es el mismo criterio del `hasMoreRef` anterior (`length >= PAGE_SIZE`).
 *
 * @param lastPage - Ítems de la última página recibida.
 * @param _allPages - Todas las páginas (no se usa).
 * @param lastPageParam - Número de la última página pedida.
 * @returns Página siguiente, o `undefined` si no hay más.
 */
export const getNextPage = (lastPage: Transaction[], _allPages: Transaction[][], lastPageParam: number): number | undefined =>
	lastPage.length >= PAGE_SIZE ? lastPageParam + 1 : undefined

// Recorte a primera página para el pull-to-refresh — compartido con los
// pedidos del marketplace, vive en api/queryUtils
export { trimToFirstPage } from '../../api/queryUtils'

/**
 * Histórico de transacciones paginado (`GET /transaction`, 20 por página).
 *
 * Solo la variante SIN filtros se persiste en disco (`meta.noPersist` excluye
 * al resto): es la paridad con dataCache, que cacheaba únicamente la primera
 * página sin filtrar. El recorte a una página al persistir lo hace el
 * `serialize` de `api/queryClient.js` para cualquier query infinita.
 *
 * @param filters - Filtros aplicados; viajan como query params.
 * @returns UseInfiniteQueryResult con páginas de transacciones.
 */
export const useTransactionsInfiniteQuery = (filters: TransactionsFilters = {}) => useInfiniteQuery({
	queryKey: transactionsListKey(filters),
	queryFn: async ({ pageParam }) => {
		const data = unwrap(await transferApi.getLatestTransactions({
			page: pageParam,
			take: PAGE_SIZE,
			...filters,
		}))
		// Una página es siempre un array: un cuerpo vacío cuenta como página vacía
		return data || []
	},
	initialPageParam: 1,
	getNextPageParam: getNextPage,
	// Reentrar con N páginas en caché revalidaría TODAS en cadena (una petición
	// por página) y vaciaría el token bucket del backend. Con una ventana corta
	// de frescura ese refetch por montaje desaparece; la frescura real la dan el
	// SSE de transacciones y el pull-to-refresh, que fuerza con `refetch()`.
	staleTime: 30 * 1000,
	...(Object.keys(filters).length > 0 && { meta: { noPersist: true } }),
})
