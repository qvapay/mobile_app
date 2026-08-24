import { useState, useEffect, useMemo, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import useContentPadding from '../../hooks/useContentPadding'
import { FlashList } from '@shopify/flash-list'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPInput from '../../ui/particles/QPInput'
import QPLoader from '../../ui/particles/QPLoader'
import CountryPicker from '../../ui/store/CountryPicker'
import OperatorAvatar from '../../ui/store/OperatorAvatar'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

import { useTopupCountriesQuery, useTopupFeaturedQuery, useTopupBrandsQuery } from './storeQueries'
import { ROUTES } from '../../routes'

import { toast } from 'sonner-native'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'

const DEFAULT_COUNTRY = 'CU'

// i18n.t en call time: se re-resuelve en cada render (el componente re-renderiza
// con useTranslation al cambiar de idioma)
const formatPriceRange = (min, max) => {
	if (min == null && max == null) return null
	if (min == null) return i18n.t('store.common.upTo', { amount: `$${Number(max).toFixed(2)}` })
	if (max == null || max === min) return `$${Number(min).toFixed(2)}`
	return `$${Number(min).toFixed(2)} – $${Number(max).toFixed(2)}`
}

function filtersReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/**
 * Phone top-up catalog: pick a destination country, then an operator.
 * Accepts `route.params.country` (ISO code) to preselect a country; defaults to Cuba.
 * Countries, featured operators and per-country brands all come from
 * `GET /store/topup-catalog` mode params; operator tiles navigate to PhoneTopupBrand.
 */
const PhoneTopupIndex = ({ navigation, route }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding(24)
	const { width } = useWindowDimensions()
	const numColumns = width >= 768 ? 3 : 2

	const initialCountry = (route?.params?.country || '').toUpperCase()

	const [filters, dispatchFilters] = useReducer(filtersReducer, { selectedCountry: null, search: '' })
	const { selectedCountry, search } = filters
	const [refreshing, setRefreshing] = useState(false)

	// Catálogos en React Query: países y destacados compartidos con la portada
	// de la tienda (misma clave), operadores con clave por país
	const countriesQuery = useTopupCountriesQuery()
	const featuredQuery = useTopupFeaturedQuery()
	const brandsQuery = useTopupBrandsQuery(selectedCountry?.code)

	const countries = countriesQuery.data || []
	const featured = featuredQuery.data || []
	const brands = useMemo(() => brandsQuery.data || [], [brandsQuery.data])
	const loadingCountries = countriesQuery.isPending
	const loadingBrands = brandsQuery.isPending

	// Los toasts solo cuando no hay NADA que pintar
	useEffect(() => {
		if (countriesQuery.isError && !countriesQuery.data) { toast.error(i18n.t('store.toasts.countries'), { description: countriesQuery.error?.message }) }
	}, [countriesQuery.isError, countriesQuery.data, countriesQuery.error])
	useEffect(() => {
		if (brandsQuery.isError && !brandsQuery.data) { toast.error(i18n.t('store.toasts.operators'), { description: brandsQuery.error?.message }) }
	}, [brandsQuery.isError, brandsQuery.data, brandsQuery.error])

	// Default: el país de la ruta, o Cuba, cuando llegan los países
	useEffect(() => {
		const list = countriesQuery.data
		if (!list?.length || selectedCountry) return
		const pick = list.find(c => c.code === (initialCountry || DEFAULT_COUNTRY)) || list[0]
		if (pick) dispatchFilters({ type: 'set', field: 'selectedCountry', value: pick })
	}, [countriesQuery.data, selectedCountry, initialCountry])

	// Cambiar de país resetea la búsqueda
	useEffect(() => {
		dispatchFilters({ type: 'set', field: 'search', value: '' })
	}, [selectedCountry?.code])

	const filteredBrands = useMemo(() => {
		const q = search.trim().toLowerCase()
		if (!q) return brands
		return brands.filter(b => (b.brand || '').toLowerCase().includes(q))
	}, [brands, search])

	const goToBrand = useCallback((brand) => {
		navigation.navigate(ROUTES.PHONE_TOPUP_BRAND, {
			country: selectedCountry,
			countryCode: selectedCountry?.code,
			brandSlug: brand.slug || brand.brand,
		})
	}, [navigation, selectedCountry])

	const renderBrand = ({ item }) => {
		const price = formatPriceRange(item.price_min, item.price_max)
		return (
			<Pressable
				onPress={() => goToBrand(item)}
				style={[
					styles.brandCard,
					{ backgroundColor: theme.colors.surface },
					theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
				]}
			>
				<OperatorAvatar brand={item.brand} logoUrl={item.logo_url} size="md" />
				<View style={{ flex: 1, marginLeft: 12 }}>
					<Text numberOfLines={1} style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
						{item.brand}
					</Text>
					<Text numberOfLines={1} style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
						{price || t('store.common.plans', { count: item.offer_count || 0 })}
					</Text>
				</View>
				<FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
			</Pressable>
		)
	}

	const { refetch: refetchCountries } = countriesQuery
	const { refetch: refetchFeatured } = featuredQuery
	const { refetch: refetchBrands } = brandsQuery
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await Promise.all([refetchCountries(), refetchFeatured(), refetchBrands()]) }
		catch { /* lo anterior sigue en pantalla */ }
		finally { setRefreshing(false) }
	}, [refetchCountries, refetchFeatured, refetchBrands])

	if (loadingCountries) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				style={styles.scrollView}
				contentContainerStyle={contentPadding}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>
				{/* Hero card: country picker */}
				<View style={[styles.heroCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
						{t('store.topupIndex.recipientCountry')}
					</Text>
					<CountryPicker
						countries={countries}
						value={selectedCountry}
						onChange={(c) => dispatchFilters({ type: 'set', field: 'selectedCountry', value: c })}
						placeholder={t('store.common.selectCountry')}
					/>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 8 }]}>
						{selectedCountry?.code === 'CU'
							? t('store.topupIndex.cubaHint')
							: t('store.common.latamHint')}
					</Text>
				</View>

				{/* Featured */}
				{featured.length > 0 && !search && (
					<View style={styles.section}>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 10 }]}>
							{t('store.topupIndex.featuredTitle')}
						</Text>
						<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 12, gap: 10 }}>
							{featured.map(f => (
								<Pressable
									key={`${f.country}-${f.brand}`}
									onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_BRAND, {
										country: { code: f.country, ...f.country_meta },
										countryCode: f.country,
										brandSlug: f.slug || f.brand,
									})}
									style={[styles.featuredItem, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
								>
									<OperatorAvatar brand={f.brand} logoUrl={f.logo_url} size="md" />
									<Text numberOfLines={1} style={[textStyles.caption, { color: theme.colors.primaryText, fontWeight: '600', marginTop: 6, maxWidth: 90, textAlign: 'center' }]}>
										{f.brand}
									</Text>
									<Text numberOfLines={1} style={[textStyles.caption, { color: theme.colors.tertiaryText, fontSize: 10 }]}>
										{f.country_meta?.flag} {f.country_meta?.name}
									</Text>
								</Pressable>
							))}
						</ScrollView>
					</View>
				)}

				{/* Search */}
				{brands.length > 6 && (
					<View style={{ marginBottom: 12 }}>
						<QPInput
							value={search}
							onChangeText={(v) => dispatchFilters({ type: 'set', field: 'search', value: v })}
							placeholder={t('store.topupIndex.searchPlaceholder', { country: selectedCountry?.name || '' })}
							prefixIconName="magnifying-glass"
							style={{ fontSize: theme.typography.fontSize.md }}
						/>
					</View>
				)}

				{/* Brands grid */}
				<View style={styles.section}>
					<View style={styles.sectionHeader}>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
							{selectedCountry?.flag} {t('store.topupIndex.operatorsIn', { country: selectedCountry?.name || '' })}
						</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{t('store.topupIndex.operatorCount', { count: filteredBrands.length })}
						</Text>
					</View>

					{loadingBrands ? (
						<View style={{ paddingVertical: 30, alignItems: 'center' }}>
							<QPLoader />
						</View>
					) : filteredBrands.length === 0 ? (
						<View style={[styles.empty, { backgroundColor: theme.colors.surface }]}>
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
								{search ? t('store.common.noResultsFor', { query: search }) : t('store.common.noOperators')}
							</Text>
						</View>
					) : (
						<FlashList
							data={filteredBrands}
							keyExtractor={(item) => `${selectedCountry?.code}-${item.brand}`}
							renderItem={renderBrand}
							numColumns={1}
							scrollEnabled={false}
							ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
							key={numColumns}
						/>
					)}
				</View>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollView: { flex: 1 },
	heroCard: {
		padding: 14,
		borderRadius: 16,
		marginBottom: 18,
	},
	section: { marginBottom: 22 },
	sectionHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 10,
	},
	featuredItem: {
		alignItems: 'center',
		justifyContent: 'center',
		padding: 12,
		borderRadius: 14,
		width: 110,
	},
	brandCard: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 14,
		borderRadius: 14,
	},
	empty: {
		padding: 40,
		borderRadius: 14,
		alignItems: 'center',
	},
})

export default PhoneTopupIndex
