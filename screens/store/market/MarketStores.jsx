import { useState, useEffect, useMemo, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
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

// Índice de tiendas en React Query (persistido para el arranque en frío)
import { useMarketStoresIndexQuery } from './marketQueries'

import { toast } from 'sonner-native'

const PAGE_SIZE = 24
// El backend pagina de a 50 máximo; el índice completo hoy cabe en una página
// (mismo criterio que la web, que trae 100 y filtra en cliente).
const FETCH_TAKE = 50

function storesReducer(state, action) {
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
 * Data comes from `GET /market/stores` (SWR-cached); search past the loaded
 * page hits the federated `GET /shop/search` (debounced) and merges by slug.
 * Client-side pagination, 24 per page.
 */
const MarketStores = ({ navigation, route }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding(24)
	const { width } = useWindowDimensions()
	const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2

	const [data, dispatchData] = useReducer(storesReducer, { extraShops: [] })
	const { extraShops } = data
	const [filters, dispatchFilters] = useReducer(storesReducer, { activeCategory: route?.params?.category || 'ALL', search: '', page: 1 })
	const { activeCategory, search, page } = filters
	const [refreshing, setRefreshing] = useState(false)

	// Índice de tiendas: React Query hace el fetch, la persistencia en frío y
	// conserva la última lista buena si la red falla
	const storesQuery = useMarketStoresIndexQuery(FETCH_TAKE)
	const stores = useMemo(() => storesQuery.data || [], [storesQuery.data])
	const loading = storesQuery.isPending

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

	const { refetch: refetchStores } = storesQuery
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await refetchStores() }
		catch { /* la lista anterior sigue en pantalla */ }
		finally { setRefreshing(false) }
	}, [refetchStores])

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
							count={stores.length}
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

				{/* Grid */}
				<View style={styles.gridHeader}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
						{t('market.stores.verifiedStores')}
					</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
						{t('market.stores.count', { count: filteredStores.length })}
					</Text>
				</View>

				{filteredStores.length === 0 ? (
					<View style={[styles.empty, { backgroundColor: theme.colors.surface }]}>
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
							{search ? t('market.stores.noResults', { search }) : t('market.stores.emptyCategory')}
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
									{t('market.common.loadMore')}
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
