import { useState, useEffect, useMemo, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native'
import useContentPadding from '../../hooks/useContentPadding'
import { FlashList } from '@shopify/flash-list'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPInput from '../../ui/particles/QPInput'
import QPLoader from '../../ui/particles/QPLoader'
import CountryPicker from '../../ui/store/CountryPicker'
import CategoryPill from '../../ui/store/CategoryPill'
import BrandTile from '../../ui/store/BrandTile'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

import { useVoucherCountriesQuery, useVoucherBrandsQuery, useVoucherCategoriesQuery } from './storeQueries'
import { ROUTES } from '../../routes'

import { toast } from 'sonner-native'

const DEFAULT_COUNTRY = 'US'
const PAGE_SIZE = 24

function filtersReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/**
 * Gift-card catalog browser with country, category and search filters.
 * Accepts `route.params.category` to preselect a category pill.
 * Brands/categories come from `GET /store/voucher-catalog` (countries, country and
 * categories modes); the FlashList grid paginates client-side (24 per page) and each
 * tile navigates to GiftCardBrand with the country + brand slug.
 */
const GiftCards = ({ navigation, route }) => {

	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding(24)
	const { width } = useWindowDimensions()
	const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2

	const initialCategory = (route?.params?.category || 'ALL').toUpperCase()

	const [filters, dispatchFilters] = useReducer(filtersReducer, { selectedCountry: null, activeCategory: initialCategory, search: '', page: 1 })
	const { selectedCountry, activeCategory, search, page } = filters
	const [refreshing, setRefreshing] = useState(false)

	// Catálogo en React Query: países + marcas/categorías con clave por país.
	// Volver a un país ya visitado pinta al instante desde caché
	const countriesQuery = useVoucherCountriesQuery()
	const brandsQuery = useVoucherBrandsQuery(selectedCountry?.code)
	const categoriesQuery = useVoucherCategoriesQuery(selectedCountry?.code)

	const countries = countriesQuery.data || []
	const brands = useMemo(() => brandsQuery.data || [], [brandsQuery.data])
	const categories = categoriesQuery.data || []
	const loadingShell = countriesQuery.isPending
	const loadingBrands = brandsQuery.isPending

	// Los toasts solo cuando no hay NADA que pintar
	useEffect(() => {
		if (countriesQuery.isError && !countriesQuery.data) { toast.error('Países', { description: countriesQuery.error?.message }) }
	}, [countriesQuery.isError, countriesQuery.data, countriesQuery.error])
	useEffect(() => {
		if (brandsQuery.isError && !brandsQuery.data) { toast.error('Marcas', { description: brandsQuery.error?.message }) }
	}, [brandsQuery.isError, brandsQuery.data, brandsQuery.error])

	// Default: US (o el primero) cuando llegan los países y no hay selección
	useEffect(() => {
		const list = countriesQuery.data
		if (!list?.length || selectedCountry) return
		const pick = list.find(c => c.code === DEFAULT_COUNTRY) || list[0]
		if (pick) dispatchFilters({ type: 'set', field: 'selectedCountry', value: pick })
	}, [countriesQuery.data, selectedCountry])

	// Cambiar de país resetea búsqueda y paginación de cliente
	useEffect(() => {
		if (!selectedCountry?.code) return
		dispatchFilters({ type: 'set', field: 'search', value: '' })
		dispatchFilters({ type: 'set', field: 'page', value: 1 })
	}, [selectedCountry?.code])

	const filteredBrands = useMemo(() => {
		const q = search.trim().toLowerCase()
		return brands.filter(b =>
			(activeCategory === 'ALL' || b.category === activeCategory) &&
			(!q || (b.brand || '').toLowerCase().includes(q))
		)
	}, [brands, search, activeCategory])

	useEffect(() => { dispatchFilters({ type: 'set', field: 'page', value: 1 }) }, [search, activeCategory])

	const totalPages = Math.max(1, Math.ceil(filteredBrands.length / PAGE_SIZE))
	const safePage = Math.min(page, totalPages)
	const pagedBrands = useMemo(
		() => filteredBrands.slice(0, safePage * PAGE_SIZE),
		[filteredBrands, safePage],
	)

	const goToBrand = useCallback((brand) => {
		navigation.navigate(ROUTES.GIFT_CARD_BRAND, {
			country: selectedCountry,
			countryCode: selectedCountry?.code,
			brandSlug: brand.slug || brand.brand,
		})
	}, [navigation, selectedCountry])

	const { refetch: refetchCountries } = countriesQuery
	const { refetch: refetchBrands } = brandsQuery
	const { refetch: refetchCategories } = categoriesQuery
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await Promise.all([refetchCountries(), refetchBrands(), refetchCategories()]) }
		catch { /* lo anterior sigue en pantalla */ }
		finally { setRefreshing(false) }
	}, [refetchCountries, refetchBrands, refetchCategories])

	if (loadingShell) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	const renderBrand = ({ item }) => (
		<View style={{ flex: 1 / numColumns, padding: 5 }}>
			<BrandTile brand={item} country={selectedCountry} onPress={() => goToBrand(item)} />
		</View>
	)

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={contentPadding}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>
				{/* Search + Country */}
				<View style={styles.controls}>
					<View style={{ flex: 1 }}>
						<QPInput
							value={search}
							onChangeText={(v) => dispatchFilters({ type: 'set', field: 'search', value: v })}
							placeholder="Buscar marca: Amazon, Steam…"
							prefixIconName="magnifying-glass"
							style={{ fontSize: theme.typography.fontSize.md }}
						/>
					</View>
				</View>

				<View style={{ marginBottom: 14 }}>
					<CountryPicker
						countries={countries}
						value={selectedCountry}
						onChange={(c) => dispatchFilters({ type: 'set', field: 'selectedCountry', value: c })}
					/>
				</View>

				{/* Category pills */}
				{categories.length > 0 && (
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4, marginBottom: 12 }}>
						<CategoryPill
							active={activeCategory === 'ALL'}
							onPress={() => dispatchFilters({ type: 'set', field: 'activeCategory', value: 'ALL' })}
							emoji="✨"
							label="Todas"
							count={brands.length}
						/>
						{categories.map(c => (
							<CategoryPill
								key={c.key}
								active={activeCategory === c.key}
								onPress={() => dispatchFilters({ type: 'set', field: 'activeCategory', value: activeCategory === c.key ? 'ALL' : c.key })}
								emoji={c.emoji}
								label={c.label}
								count={c.count}
							/>
						))}
					</ScrollView>
				)}

				{/* Brands grid */}
				<View style={styles.gridHeader}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
						{selectedCountry?.flag} Marcas en {selectedCountry?.name}
					</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
						{filteredBrands.length} {filteredBrands.length === 1 ? 'marca' : 'marcas'}
					</Text>
				</View>

				{loadingBrands ? (
					<View style={{ paddingVertical: 30, alignItems: 'center' }}>
						<QPLoader />
					</View>
				) : filteredBrands.length === 0 ? (
					<View style={[styles.empty, { backgroundColor: theme.colors.surface }]}>
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
							{search ? `Sin resultados para "${search}"` : 'No hay marcas en esta categoría'}
						</Text>
					</View>
				) : (
					<View style={{ marginHorizontal: -5 }}>
						<FlashList
							data={pagedBrands}
							keyExtractor={(item) => `${selectedCountry?.code}-${item.brand}`}
							renderItem={renderBrand}
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
		marginBottom: 10,
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

export default GiftCards
