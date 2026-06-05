import { useState, useEffect, useMemo, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPInput from '../../ui/particles/QPInput'
import QPLoader from '../../ui/particles/QPLoader'
import CountryPicker from '../../ui/store/CountryPicker'
import OperatorAvatar from '../../ui/store/OperatorAvatar'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

import { storeApi } from '../../api/storeApi'
import { ROUTES } from '../../routes'

import { toast } from 'sonner-native'

const DEFAULT_COUNTRY = 'CU'

const formatPriceRange = (min, max) => {
	if (min == null && max == null) return null
	if (min == null) return `Hasta $${Number(max).toFixed(2)}`
	if (max == null || max === min) return `$${Number(min).toFixed(2)}`
	return `$${Number(min).toFixed(2)} – $${Number(max).toFixed(2)}`
}

// Catalog data + list filters are two cohesive units (same shape as GiftCards)
const initialCatalog = { countries: [], featured: [], brands: [] }

function catalogReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

function filtersReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

const PhoneTopupIndex = ({ navigation, route }) => {

	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { width } = useWindowDimensions()
	const numColumns = width >= 768 ? 3 : 2

	const initialCountry = (route?.params?.country || '').toUpperCase()

	const [catalog, dispatchCatalog] = useReducer(catalogReducer, initialCatalog)
	const { countries, featured, brands } = catalog
	const [filters, dispatchFilters] = useReducer(filtersReducer, { selectedCountry: null, search: '' })
	const { selectedCountry, search } = filters
	const [loadingCountries, setLoadingCountries] = useState(true)
	const [loadingBrands, setLoadingBrands] = useState(false)
	const [refreshing, setRefreshing] = useState(false)

	const fetchCountries = useCallback(async () => {
		const [countriesRes, featuredRes] = await Promise.all([
			storeApi.getTopupCatalog({ countries: true }),
			storeApi.getTopupCatalog({ featured: true }),
		])
		if (countriesRes.success) {
			const list = countriesRes.data?.countries || []
			dispatchCatalog({ type: 'set', field: 'countries', value: list })
			const pick = list.find(c => c.code === (initialCountry || DEFAULT_COUNTRY)) || list[0]
			if (pick && !selectedCountry) dispatchFilters({ type: 'set', field: 'selectedCountry', value: pick })
		} else { toast.error('Países', { description: countriesRes.error }) }
		if (featuredRes.success) {
			dispatchCatalog({ type: 'set', field: 'featured', value: (featuredRes.data?.featured || []).slice(0, 6) })
		}
		setLoadingCountries(false)
	}, [initialCountry, selectedCountry])

	useEffect(() => { fetchCountries() }, [fetchCountries])

	const fetchBrands = useCallback(async (countryCode) => {
		if (!countryCode) return
		setLoadingBrands(true)
		const res = await storeApi.getTopupCatalog({ country: countryCode })
		if (res.success) dispatchCatalog({ type: 'set', field: 'brands', value: res.data?.brands || [] })
		else { toast.error('Operadores', { description: res.error }); dispatchCatalog({ type: 'set', field: 'brands', value: [] }) }
		setLoadingBrands(false)
	}, [])

	useEffect(() => {
		dispatchFilters({ type: 'set', field: 'search', value: '' })
		if (selectedCountry?.code) fetchBrands(selectedCountry.code)
	}, [selectedCountry?.code, fetchBrands])

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
						{price || `${item.offer_count || 0} planes`}
					</Text>
				</View>
				<FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
			</Pressable>
		)
	}

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchCountries()
		if (selectedCountry?.code) await fetchBrands(selectedCountry.code)
		setRefreshing(false)
	}, [fetchCountries, fetchBrands, selectedCountry?.code])

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
				contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>
				{/* Hero card: country picker */}
				<View style={[styles.heroCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
						País del destinatario
					</Text>
					<CountryPicker
						countries={countries}
						value={selectedCountry}
						onChange={(c) => dispatchFilters({ type: 'set', field: 'selectedCountry', value: c })}
						placeholder="Selecciona país"
					/>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 8 }]}>
						{selectedCountry?.code === 'CU'
							? 'Cubacel local — sin cargo del exterior.'
							: 'Recarga el móvil de cualquier persona en LATAM.'}
					</Text>
				</View>

				{/* Featured */}
				{featured.length > 0 && !search && (
					<View style={styles.section}>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 10 }]}>
							⚡ Operadores populares
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
							placeholder={`Filtrar operador en ${selectedCountry?.name || ''}…`}
							prefixIconName="magnifying-glass"
							style={{ fontSize: theme.typography.fontSize.md }}
						/>
					</View>
				)}

				{/* Brands grid */}
				<View style={styles.section}>
					<View style={styles.sectionHeader}>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
							{selectedCountry?.flag} Operadores en {selectedCountry?.name}
						</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{filteredBrands.length} {filteredBrands.length === 1 ? 'operador' : 'operadores'}
						</Text>
					</View>

					{loadingBrands ? (
						<View style={{ paddingVertical: 30, alignItems: 'center' }}>
							<QPLoader />
						</View>
					) : filteredBrands.length === 0 ? (
						<View style={[styles.empty, { backgroundColor: theme.colors.surface }]}>
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
								{search ? `Sin resultados para "${search}"` : 'No hay operadores disponibles'}
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
