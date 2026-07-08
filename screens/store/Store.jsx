import { useState, useEffect, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Platform, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Toast
import { toast } from 'sonner-native'

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPLoader from '../../ui/particles/QPLoader'
import StoreTopupSection from './StoreTopupSection'
import StoreGiftCardsSection from './StoreGiftCardsSection'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

import { storeApi } from '../../api/storeApi'

const DEFAULT_TOPUP_COUNTRY = 'CU'
// Compliance with App Store Guideline 3.1.1 — vouchers hidden on iOS.
const SHOW_GIFT_CARDS = Platform.OS !== 'ios'

// All Store catalog slices arrive from one fetch pass — keep them as one unit
const initialCatalog = { favorites: [], featured: [], categories: [], topupCountries: [], topupBrands: [] }

function catalogReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/**
 * Store tab landing: mobile top-ups plus (Android-only) the gift-card storefront.
 * Vouchers are hidden on iOS to comply with App Store Guideline 3.1.1.
 * Loads Zendit-backed catalogs from `GET /store/topup-catalog` and
 * `GET /store/voucher-catalog` using mode params (countries / favorites / featured /
 * categories / country); the top-up country defaults to Cuba (CU).
 */
const Store = ({ navigation }) => {

	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { width } = useWindowDimensions()
	const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2

	const [catalog, dispatchCatalog] = useReducer(catalogReducer, initialCatalog)
	const { favorites, featured, categories, topupCountries, topupBrands } = catalog
	const [topupSelected, setTopupSelected] = useState(null)
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)

	const fetchInitial = useCallback(async () => {
		const requests = [
			storeApi.getTopupCatalog({ countries: true }),
		]
		if (SHOW_GIFT_CARDS) {
			requests.push(
				storeApi.getVoucherCatalog({ favorites: true }),
				storeApi.getVoucherCatalog({ featured: true }),
				storeApi.getVoucherCatalog({ categories: true }),
			)
		}
		const results = await Promise.all(requests)
		const [countriesRes, favRes, featRes, catsRes] = results

		if (countriesRes.success) {
			const list = countriesRes.data?.countries || []
			dispatchCatalog({ type: 'set', field: 'topupCountries', value: list })
			const pick = list.find(c => c.code === DEFAULT_TOPUP_COUNTRY) || list[0]
			if (pick && !topupSelected) setTopupSelected(pick)
		}
		if (SHOW_GIFT_CARDS) {
			if (favRes?.success) dispatchCatalog({ type: 'set', field: 'favorites', value: favRes.data?.favorites || [] })
			if (featRes?.success) dispatchCatalog({ type: 'set', field: 'featured', value: (featRes.data?.featured || []).slice(0, 6) })
			if (catsRes?.success) dispatchCatalog({ type: 'set', field: 'categories', value: (catsRes.data?.categories || []).slice(0, 6) })
		}

		setLoading(false)
	}, [topupSelected])

	useEffect(() => { fetchInitial() }, [fetchInitial])

	const fetchTopupBrands = useCallback(async (code) => {
		if (!code) return
		const res = await storeApi.getTopupCatalog({ country: code })
		if (res.success) dispatchCatalog({ type: 'set', field: 'topupBrands', value: res.data?.brands || [] })
		else { toast.error('Operadores', { description: res.error }); dispatchCatalog({ type: 'set', field: 'topupBrands', value: [] }) }
	}, [])

	useEffect(() => {
		if (topupSelected?.code) fetchTopupBrands(topupSelected.code)
	}, [topupSelected?.code, fetchTopupBrands])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchInitial()
		if (topupSelected?.code) await fetchTopupBrands(topupSelected.code)
		setRefreshing(false)
	}, [fetchInitial, fetchTopupBrands, topupSelected?.code])

	if (loading) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>

				{/* Hero */}
				<View style={styles.heroRow}>
					<View style={{ flex: 1 }}>
						<Text style={[textStyles.h2, { color: theme.colors.primaryText, fontWeight: '600' }]}>Tienda</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
							{SHOW_GIFT_CARDS ? 'Recargas móviles y tarjetas de regalo' : 'Recargas móviles'}
						</Text>
					</View>
				</View>

				{/* Tarjetas de regalo — entry point siempre presente en Android */}
				{SHOW_GIFT_CARDS && (
					<StoreGiftCardsSection
						favorites={favorites}
						featured={featured}
						categories={categories}
						numColumns={numColumns}
						theme={theme}
						textStyles={textStyles}
						navigation={navigation}
					/>
				)}

				{/* Recargas móviles */}
				<StoreTopupSection
					topupCountries={topupCountries}
					topupSelected={topupSelected}
					topupBrands={topupBrands}
					onSelectCountry={setTopupSelected}
					numColumns={numColumns}
					theme={theme}
					textStyles={textStyles}
					navigation={navigation}
				/>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	heroRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 22,
	},
})

export default Store
