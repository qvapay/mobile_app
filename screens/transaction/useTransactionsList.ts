import { useState, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
	transactionsListKey,
	trimToFirstPage,
	useTransactionsInfiniteQuery,
	type TransactionsFilters,
} from './transactionsQueries'

import type { Transaction } from '../../types/domain'

/**
 * Owns the paginated transaction history for `Transactions.jsx`: una query
 * infinita por juego de filtros (los filtros viven en la clave), páginas
 * aplanadas para la FlashList, scroll infinito y pull-to-refresh.
 *
 * Reemplaza al reducer de lista + cuatro refs de cursores (`pageRef`,
 * `hasMoreRef`, `inFlightRef`, `hasFreshDataRef`) de la versión anterior:
 * paginación, dedup de peticiones en vuelo y la regla "la caché nunca pisa un
 * fetch resuelto" vienen de serie con `useInfiniteQuery` + el persister.
 *
 * `refreshing` es estado propio (no `isRefetching`): solo debe activarse en un
 * tirón del usuario, no en la revalidación de fondo de cada montaje.
 *
 * @param filters - Filtros aplicados (search, date_from, status…).
 * @returns `{ transactions, isPending, isFetchingNextPage, refreshing, onRefresh, loadMore }`
 */
export default function useTransactionsList(filters: TransactionsFilters): {
	transactions: Transaction[]
	isPending: boolean
	isFetchingNextPage: boolean
	refreshing: boolean
	onRefresh: () => Promise<void>
	loadMore: () => void
} {

	const queryClient = useQueryClient()
	const [refreshing, setRefreshing] = useState(false)

	const query = useTransactionsInfiniteQuery(filters)
	const { hasNextPage, isFetching, fetchNextPage, refetch } = query

	// Páginas aplanadas en una sola lista para la FlashList
	const transactions = useMemo(() => (query.data?.pages ?? []).flat(), [query.data])

	/**
	 * Pull-to-refresh: recorta la caché a la página 1 y revalida. Sin el recorte,
	 * `refetch()` repetiría en cadena todas las páginas ya cargadas.
	 */
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try {
			queryClient.setQueryData(transactionsListKey(filters), trimToFirstPage)
			await refetch()
		} catch { /* los datos anteriores siguen en pantalla */ }
		finally { setRefreshing(false) }
	}, [queryClient, filters, refetch])

	// Scroll infinito: `hasNextPage` ya codifica el criterio "última página llena"
	const loadMore = useCallback(() => {
		if (hasNextPage && !isFetching) fetchNextPage()
	}, [hasNextPage, isFetching, fetchNextPage])

	return {
		transactions,
		isPending: query.isPending,
		isFetchingNextPage: query.isFetchingNextPage,
		refreshing,
		onRefresh,
		loadMore,
	}
}
