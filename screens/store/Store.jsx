import { useState, useEffect, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Platform, Pressable, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPLoader from '../../ui/particles/QPLoader'
import StoreTopupSection from './StoreTopupSection'
import StoreGiftCardsSection from './StoreGiftCardsSection'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

import { storeApi } from '../../api/storeApi'
import { ROUTES } from '../../routes'

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
 * Store tab landing: department cards (compras asistidas, recargas and — on
 * Android only — gift cards) followed by the mobile top-up and gift-card
 * sections. Vouchers are hidden on iOS to comply with App Store Guideline 3.1.1.
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
							{SHOW_GIFT_CARDS ? 'Recargas, tarjetas de regalo y compras asistidas' : 'Recargas móviles y compras asistidas'}
						</Text>
					</View>
				</View>

				{/* Departamentos — entradas a cada vertical, como en la web */}
				<View style={styles.departmentsBlock}>
					<DepartmentCard
						icon="basket-shopping"
						color="#10B981"
						title="Compras asistidas"
						subtitle="Compra en Amazon y eBay con tu saldo · Pronto: Walmart, BestBuy, TEMU y AliExpress"
						theme={theme}
						textStyles={textStyles}
						onPress={() => navigation.navigate(ROUTES.ASSISTED_SHOPPING)}
					/>
					<View style={styles.departmentsRow}>
						<DepartmentCard
							icon="mobile-screen-button"
							color={theme.colors.primary}
							title="Recargas móviles"
							subtitle="Cubacel y +100 países"
							compact
							theme={theme}
							textStyles={textStyles}
							onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX)}
						/>
						{SHOW_GIFT_CARDS && (
							<DepartmentCard
								icon="gift"
								color="#8B5CF6"
								title="Tarjetas de regalo"
								subtitle="+100 marcas"
								compact
								theme={theme}
								textStyles={textStyles}
								onPress={() => navigation.navigate(ROUTES.GIFT_CARDS)}
							/>
						)}
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

/**
 * Entry card for a Store vertical (recargas, gift cards, compras asistidas) —
 * mobile version of the web shop hub's DepartmentCard. `compact` renders the
 * half-width variant used in the second row.
 */
const DepartmentCard = ({ icon, color, title, subtitle, compact = false, theme, textStyles, onPress }) => (
	<Pressable
		style={[
			styles.departmentCard,
			compact && styles.departmentCardCompact,
			{ backgroundColor: theme.colors.surface },
			theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight },
		]}
		onPress={onPress}
	>
		<View style={[styles.departmentIcon, { backgroundColor: `${color}1A` }]}>
			<FontAwesome6 name={icon} size={16} color={color} iconStyle="solid" />
		</View>
		<View style={styles.departmentContent}>
			<Text style={[textStyles.h6, { fontWeight: '600' }]} numberOfLines={1}>{title}</Text>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]} numberOfLines={2}>
				{subtitle}
			</Text>
		</View>
		<FontAwesome6 name="chevron-right" size={11} color={theme.colors.tertiaryText} iconStyle="solid" />
	</Pressable>
)

const styles = StyleSheet.create({
	heroRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 22,
	},
	departmentsBlock: {
		gap: 10,
		marginBottom: 26,
	},
	departmentsRow: {
		flexDirection: 'row',
		gap: 10,
	},
	departmentCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 14,
		borderRadius: 14,
	},
	departmentCardCompact: {
		flex: 1,
		gap: 10,
		padding: 12,
	},
	departmentContent: {
		flex: 1,
	},
	departmentIcon: {
		width: 38,
		height: 38,
		borderRadius: 11,
		alignItems: 'center',
		justifyContent: 'center',
	},
})

export default Store
