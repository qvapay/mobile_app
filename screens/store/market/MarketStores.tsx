import { useState, useEffect, useMemo, useCallback, useReducer, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { ReactElement } from 'react'
import type { RefreshControlProps } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import useContentPadding from '../../../hooks/useContentPadding'
import { FlashList } from '@shopify/flash-list'

import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

import QPInput from '../../../ui/particles/QPInput'
import QPLoader from '../../../ui/particles/QPLoader'
import CategoryPill from '../../../ui/store/CategoryPill'
import StoreTile from '../../../ui/store/StoreTile'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

import { marketApi } from '../../../api/marketApi'
import { trimToFirstPage } from '../../../api/queryUtils'
import { ROUTES } from '../../../routes'
import { MARKET_CATEGORIES, MARKET_CATEGORY_EMOJIS } from './marketConstants'

// Índice de tiendas en React Query: query infinita, persistida con su primera página
import { useMarketStoresInfiniteQuery, flattenStores, marketStoresIndexKey } from './marketQueries'

import { toast } from 'sonner-native'

import type { RootStackParamList } from '../../../types/navigation'
import type { MarketShop } from './marketQueries'

/** Estado de datos del índice: tiendas extra traídas por la búsqueda federada. */
type StoresData = { extraShops: MarketShop[] }
/** Estado de filtros: categoría activa (servidor) y texto de búsqueda (cliente). */
type StoresFilters = { activeCategory: string, search: string }
/** Única acción del reducer: fijar un campo (el mismo para ambos estados). */
type StoresAction = { type: 'set', field: string, value: unknown }

function storesReducer<S extends object>(state: S, action: StoresAction): S {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/**
 * Marketplace store index: grid of approved (active) stores with category
 * pills and name search. Accepts `route.params.category` to preselect a pill.
 * Data comes from `GET /market/stores` as an infinite query (24 per page,
 * next page on reaching the end); the category pill filters server-side.
 * Name search filters what's loaded and, past that, hits the federated
 * `GET /shop/search` (debounced) and merges by slug — while searching the
 * list doesn't auto-paginate, the federated search already covers the rest.
 */
const MarketStores = ({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'MarketStores'>) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding(24)
	const { width } = useWindowDimensions()
	const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2

	const [data, dispatchData] = useReducer(storesReducer<StoresData>, { extraShops: [] })
	const { extraShops } = data
	const [filters, dispatchFilters] = useReducer(storesReducer<StoresFilters>, { activeCategory: route?.params?.category || 'ALL', search: '' })
	const { activeCategory, search } = filters
	const [refreshing, setRefreshing] = useState(false)
	const queryClient = useQueryClient()

	// Índice de la categoría activa (scroll infinito) y, aparte, el de 'ALL'
	// para los chips y el contador total. Con 'ALL' activo es la MISMA clave:
	// una sola petición y una caché.
	const storesQuery = useMarketStoresInfiniteQuery(activeCategory)
	const allQuery = useMarketStoresInfiniteQuery('ALL')
	const stores = useMemo(() => flattenStores(storesQuery.data?.pages), [storesQuery.data])
	const allStores = useMemo(() => flattenStores(allQuery.data?.pages), [allQuery.data])
	const allTotal = allQuery.data?.pages[0]?.total ?? allStores.length
	const loading = storesQuery.isPending
	const { hasNextPage, isFetching, isFetchingNextPage, fetchNextPage, refetch: refetchStores } = storesQuery

	// El toast solo cuando no hay NADA que pintar
	useEffect(() => {
		if (storesQuery.isError && !storesQuery.data) {
			toast.error(t('market.stores.toasts.loadErrorTitle'), { description: storesQuery.error?.message })
		}
	}, [storesQuery.isError, storesQuery.data, storesQuery.error, t])

	// Búsqueda federada (debounced): tiendas que no están en la página cargada
	useEffect(() => {
		const q = search.trim()
		if (q.length < 2) {
			dispatchData({ type: 'set', field: 'extraShops', value: [] })
			return
		}
		const timer = setTimeout(async () => {
			const res = await marketApi.search(q)
			// `marketApi.search` devuelve `unknown`: la portada solo lee `shops`
			if (res.success) dispatchData({ type: 'set', field: 'extraShops', value: (res.data as { shops?: MarketShop[] } | undefined)?.shops || [] })
		}, 400)
		return () => clearTimeout(timer)
	}, [search])

	// Chips solo de categorías realmente presentes (como la web) mientras el
	// índice completo esté cargado entero; si quedan páginas no se puede saber qué
	// falta, así que se ofrecen todas (una vacía dice "sin tiendas"). La activa
	// siempre está, aunque aún no haya aparecido (p. ej. por route.params)
	const allComplete = !!allQuery.data && !allQuery.hasNextPage
	const presentCategories = useMemo(() => {
		if (!allComplete) return Object.keys(MARKET_CATEGORIES)
		// Una pasada sobre las tiendas alimentando el Set directamente: el
		// estrechamiento dentro del if da `string[]` sin cast
		const present = new Set<string>()
		if (activeCategory !== 'ALL' && MARKET_CATEGORIES[activeCategory]) present.add(activeCategory)
		for (const s of allStores) {
			if (s.category && MARKET_CATEGORIES[s.category]) { present.add(s.category) }
		}
		return [...present]
	}, [allStores, activeCategory, allComplete])

	const filteredStores = useMemo(() => {
		const q = search.trim().toLowerCase()
		const merged = [...stores]
		for (const s of extraShops) {
			if (!merged.some(m => m.slug === s.slug)) merged.push(s)
		}
		return merged.filter(s =>
			(activeCategory === 'ALL' || s.category === activeCategory) &&
			(!q || (s.name || '').toLowerCase().includes(q))
		)
	}, [stores, extraShops, search, activeCategory])

	// Mientras se busca no se pagina solo: con pocos aciertos el final de la
	// lista llegaría enseguida y encadenaría todas las páginas
	const searching = search.trim().length > 0
	// Llegar al final mientras hay un fetch en curso (el refetch de la página 1 al
	// abrir, uno de fondo) no puede perderse: se apunta y se pide al terminar
	const endReachedRef = useRef(false)
	const loadMore = useCallback(() => {
		if (searching || !hasNextPage) return
		if (isFetching) { endReachedRef.current = true; return }
		fetchNextPage()
	}, [searching, hasNextPage, isFetching, fetchNextPage])
	// Otra categoría: el "final" apuntado era de la lista anterior
	useEffect(() => { endReachedRef.current = false }, [activeCategory])
	useEffect(() => {
		if (!endReachedRef.current || isFetching) return
		endReachedRef.current = false
		if (hasNextPage && !searching) fetchNextPage()
	}, [isFetching, hasNextPage, searching, fetchNextPage])

	// Total de la categoría según el backend; buscando, los aciertos visibles
	const shownCount = searching ? filteredStores.length : (storesQuery.data?.pages[0]?.total ?? filteredStores.length)

	const goToStore = useCallback((store: MarketShop) => {
		navigation.navigate(ROUTES.MARKET_STORE, { slug: store.slug as string })
	}, [navigation])

	// Recortar a la página 1 antes de refetch: un refresh = UNA petición
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try {
			queryClient.setQueryData(marketStoresIndexKey(activeCategory), trimToFirstPage)
			await refetchStores()
		} catch { /* la lista anterior sigue en pantalla */ }
		finally { setRefreshing(false) }
	}, [queryClient, activeCategory, refetchStores])

	if (loading) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	const renderStore = ({ item }: { item: MarketShop }) => (
		<View style={{ flex: 1 / numColumns, padding: 5 }}>
			<StoreTile store={item} onPress={() => goToStore(item)} />
		</View>
	)

	const header = (
		<View style={styles.header}>
			{/* Búsqueda */}
			<View style={styles.controls}>
				<View style={{ flex: 1 }}>
					<QPInput
						value={search}
						onChangeText={(v) => dispatchFilters({ type: 'set', field: 'search', value: v })}
						placeholder={t('market.stores.searchPlaceholder')}
						prefixIconName="magnifying-glass"
						style={{ fontSize: theme.typography.fontSize.md }}
					/>
				</View>
			</View>

			{/* Category pills — solo si hay variedad real */}
			{presentCategories.length > 1 && (
				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4, marginBottom: 12 }}>
					<CategoryPill
						active={activeCategory === 'ALL'}
						onPress={() => dispatchFilters({ type: 'set', field: 'activeCategory', value: 'ALL' })}
						emoji="✨"
						label={t('market.stores.all')}
						count={allTotal}
					/>
					{presentCategories.map(c => (
						<CategoryPill
							key={c}
							active={activeCategory === c}
							onPress={() => dispatchFilters({ type: 'set', field: 'activeCategory', value: activeCategory === c ? 'ALL' : c })}
							emoji={MARKET_CATEGORY_EMOJIS[c]}
							label={t(MARKET_CATEGORIES[c])}
						/>
					))}
				</ScrollView>
			)}

			{/* Cabecera del grid */}
			<View style={styles.gridHeader}>
				<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
					{t('market.stores.verifiedStores')}
				</Text>
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
					{t('market.stores.count', { count: shownCount })}
				</Text>
			</View>
		</View>
	)

	return (
		<View style={containerStyles.subContainer}>
			<View style={styles.listWrap}>
				<FlashList
					data={filteredStores}
					keyExtractor={(item) => item.slug as string}
					renderItem={renderStore}
					numColumns={numColumns}
					key={numColumns}
					contentContainerStyle={contentPadding}
					showsVerticalScrollIndicator={false}
					keyboardShouldPersistTaps="handled"
					refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
					onEndReached={loadMore}
					onEndReachedThreshold={0.4}
					ListHeaderComponent={header}
					ListEmptyComponent={storesQuery.isPlaceholderData ? (
						// Cambiando de categoría: lo que hay en pantalla es la anterior filtrada
						// por la nueva (casi siempre vacía). Carga, no "sin tiendas"
						<View style={styles.footer}><QPLoader /></View>
					) : (
						<View style={[styles.empty, { backgroundColor: theme.colors.surface }]}>
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
								{search ? t('market.stores.noResults', { search }) : t('market.stores.emptyCategory')}
							</Text>
						</View>
					)}
					ListFooterComponent={isFetchingNextPage ? <View style={styles.footer}><QPLoader /></View> : null}
				/>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	listWrap: {
		flex: 1,
		marginHorizontal: -5,
	},
	header: {
		paddingHorizontal: 5,
	},
	footer: {
		paddingVertical: 16,
		alignItems: 'center',
	},
	controls: {
		flexDirection: 'row',
		gap: 10,
		marginBottom: 12,
	},
	gridHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 10,
	},
	empty: {
		marginHorizontal: 5,
		padding: 40,
		borderRadius: 14,
		alignItems: 'center',
	},
})

export default MarketStores
