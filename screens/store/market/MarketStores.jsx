import { useState, useEffect, useMemo, useCallback, useReducer, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native'
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
import { ROUTES } from '../../../routes'
import { MARKET_CATEGORIES, MARKET_CATEGORY_EMOJIS } from './marketConstants'

// Stale-while-revalidate cache (instant cold-start / offline rendering)
import { CACHE_KEYS, readCache, writeCache } from '../../../helpers/dataCache'

import { toast } from 'sonner-native'

const PAGE_SIZE = 24
// El backend pagina de a 50 máximo; el índice completo hoy cabe en una página
// (mismo criterio que la web, que trae 100 y filtra en cliente).
const FETCH_TAKE = 50

function storesReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		case 'hydrate':
			// Cached data never clobbers a resolved fetch
			return state.stores.length === 0 && action.value?.length ? { ...state, stores: action.value } : state
		default:
			return state
	}
}

/**
 * Marketplace store index: grid of approved (active) stores with category
 * pills and name search. Accepts `route.params.category` to preselect a pill.
 * Data comes from `GET /market/stores` (SWR-cached); search past the loaded
 * page hits the federated `GET /shop/search` (debounced) and merges by slug.
 * Client-side pagination, 24 per page.
 */
const MarketStores = ({ navigation, route }) => {

	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding(24)
	const { width } = useWindowDimensions()
	const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2

	const [data, dispatchData] = useReducer(storesReducer, { stores: [], extraShops: [] })
	const { stores, extraShops } = data
	const [filters, dispatchFilters] = useReducer(storesReducer, { activeCategory: route?.params?.category || 'ALL', search: '', page: 1 })
	const { activeCategory, search, page } = filters
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const hasFreshStores = useRef(false)

	// Cold-start hydration: paint the cached index immediately, revalidate below
	useEffect(() => {
		readCache(CACHE_KEYS.MARKET_STORES).then(cached => {
			if (!cached?.length || hasFreshStores.current) return
			dispatchData({ type: 'hydrate', value: cached })
			setLoading(false)
		})
	}, [])

	const fetchStores = useCallback(async () => {
		const res = await marketApi.getStores({ take: FETCH_TAKE })
		if (res.success) {
			const list = res.data?.stores || []
			hasFreshStores.current = true
			dispatchData({ type: 'set', field: 'stores', value: list })
			writeCache(CACHE_KEYS.MARKET_STORES, list)
		} else if (!stores.length) {
			toast.error('Tiendas', { description: res.error })
		}
		setLoading(false)
	}, [stores.length])

	useEffect(() => { fetchStores() }, []) // eslint-disable-line react-hooks/exhaustive-deps

	// Búsqueda federada (debounced): tiendas que no están en la página cargada
	useEffect(() => {
		const q = search.trim()
		if (q.length < 2) {
			dispatchData({ type: 'set', field: 'extraShops', value: [] })
			return
		}
		const timer = setTimeout(async () => {
			const res = await marketApi.search(q)
			if (res.success) dispatchData({ type: 'set', field: 'extraShops', value: res.data?.shops || [] })
		}, 400)
		return () => clearTimeout(timer)
	}, [search])

	// Chips solo de categorías realmente presentes (como la web)
	const presentCategories = useMemo(
		() => [...new Set(stores.map(s => s.category).filter(c => c && MARKET_CATEGORIES[c]))],
		[stores],
	)

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

	useEffect(() => { dispatchFilters({ type: 'set', field: 'page', value: 1 }) }, [search, activeCategory])

	const totalPages = Math.max(1, Math.ceil(filteredStores.length / PAGE_SIZE))
	const safePage = Math.min(page, totalPages)
	const pagedStores = useMemo(
		() => filteredStores.slice(0, safePage * PAGE_SIZE),
		[filteredStores, safePage],
	)

	const goToStore = useCallback((store) => {
		navigation.navigate(ROUTES.MARKET_STORE, { slug: store.slug })
	}, [navigation])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchStores()
		setRefreshing(false)
	}, [fetchStores])

	if (loading) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	const renderStore = ({ item }) => (
		<View style={{ flex: 1 / numColumns, padding: 5 }}>
			<StoreTile store={item} onPress={() => goToStore(item)} />
		</View>
	)

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={contentPadding}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>
				{/* Búsqueda */}
				<View style={styles.controls}>
					<View style={{ flex: 1 }}>
						<QPInput
							value={search}
							onChangeText={(v) => dispatchFilters({ type: 'set', field: 'search', value: v })}
							placeholder="Buscar tiendas…"
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
							label="Todas"
							count={stores.length}
						/>
						{presentCategories.map(c => (
							<CategoryPill
								key={c}
								active={activeCategory === c}
								onPress={() => dispatchFilters({ type: 'set', field: 'activeCategory', value: activeCategory === c ? 'ALL' : c })}
								emoji={MARKET_CATEGORY_EMOJIS[c]}
								label={MARKET_CATEGORIES[c]}
							/>
						))}
					</ScrollView>
				)}

				{/* Grid */}
				<View style={styles.gridHeader}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
						Tiendas verificadas
					</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
						{filteredStores.length} {filteredStores.length === 1 ? 'tienda' : 'tiendas'}
					</Text>
				</View>

				{filteredStores.length === 0 ? (
					<View style={[styles.empty, { backgroundColor: theme.colors.surface }]}>
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
							{search ? `Sin resultados para "${search}"` : 'Todavía no hay tiendas en esta categoría'}
						</Text>
					</View>
				) : (
					<View style={{ marginHorizontal: -5 }}>
						<FlashList
							data={pagedStores}
							keyExtractor={(item) => item.slug}
							renderItem={renderStore}
							numColumns={numColumns}
							key={numColumns}
							scrollEnabled={false}
						/>
						{safePage < totalPages && (
							<View style={{ alignItems: 'center', marginTop: 14 }}>
								<Text
									onPress={() => dispatchFilters({ type: 'set', field: 'page', value: safePage + 1 })}
									style={[textStyles.h6, { color: theme.colors.primary, fontWeight: '600', paddingVertical: 10, paddingHorizontal: 24 }]}
								>
									Cargar más
								</Text>
							</View>
						)}
					</View>
				)}
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
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
		paddingHorizontal: 5,
	},
	empty: {
		padding: 40,
		borderRadius: 14,
		alignItems: 'center',
	},
})

export default MarketStores
