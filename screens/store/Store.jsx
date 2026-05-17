import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, Platform, Pressable, Linking, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPLoader from '../../ui/particles/QPLoader'
import BrandTile from '../../ui/store/BrandTile'
import CountryPicker from '../../ui/store/CountryPicker'
import OperatorAvatar from '../../ui/store/OperatorAvatar'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

import { storeApi } from '../../api/storeApi'
import { ROUTES } from '../../routes'

const DEFAULT_TOPUP_COUNTRY = 'CU'
// Compliance with App Store Guideline 3.1.1 — vouchers hidden on iOS.
const SHOW_GIFT_CARDS = Platform.OS !== 'ios'

const formatPriceRange = (min, max) => {
	if (min == null && max == null) return null
	if (min == null) return `Hasta $${Number(max).toFixed(2)}`
	if (max == null || max === min) return `$${Number(min).toFixed(2)}`
	return `$${Number(min).toFixed(2)} – $${Number(max).toFixed(2)}`
}

const Store = ({ navigation }) => {

	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { width } = useWindowDimensions()
	const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2

	const [favorites, setFavorites] = useState([])
	const [featured, setFeatured] = useState([])
	const [categories, setCategories] = useState([])
	const [topupCountries, setTopupCountries] = useState([])
	const [topupSelected, setTopupSelected] = useState(null)
	const [topupBrands, setTopupBrands] = useState([])
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
			setTopupCountries(list)
			const pick = list.find(c => c.code === DEFAULT_TOPUP_COUNTRY) || list[0]
			if (pick && !topupSelected) setTopupSelected(pick)
		}
		if (SHOW_GIFT_CARDS) {
			if (favRes?.success) setFavorites(favRes.data?.favorites || [])
			if (featRes?.success) setFeatured((featRes.data?.featured || []).slice(0, 6))
			if (catsRes?.success) setCategories((catsRes.data?.categories || []).slice(0, 6))
		}

		setLoading(false)
	}, [topupSelected])

	useEffect(() => { fetchInitial() }, [fetchInitial])

	const fetchTopupBrands = useCallback(async (code) => {
		if (!code) return
		const res = await storeApi.getTopupCatalog({ country: code })
		if (res.success) setTopupBrands(res.data?.brands || [])
		else { toast.error('Operadores', { description: res.error }); setTopupBrands([]) }
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

	const goToVoucherBrand = useCallback((b) => {
		navigation.navigate(ROUTES.GIFT_CARD_BRAND, {
			country: { code: b.country, ...(b.country_meta || {}) },
			countryCode: b.country,
			brandSlug: b.slug || b.brand,
		})
	}, [navigation])

	const goToTopupBrand = useCallback((b) => {
		navigation.navigate(ROUTES.PHONE_TOPUP_BRAND, {
			country: topupSelected,
			countryCode: topupSelected?.code,
			brandSlug: b.slug || b.brand,
		})
	}, [navigation, topupSelected])

	const featuredRows = useMemo(() => featured, [featured])

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
						<Text style={[textStyles.h2, { color: theme.colors.primaryText, fontWeight: '800' }]}>Tienda</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
							Recargas móviles y tarjetas de regalo
						</Text>
					</View>
				</View>

				{/* iOS: banner informativo (sin CTA transaccional, cumple Guideline 3.1.1) */}
				{!SHOW_GIFT_CARDS && (
					<Pressable
						onPress={() => Linking.openURL('https://qvapay.com/shop/giftcards')}
						style={[styles.iosInfoBanner, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
					>
						<Text style={{ fontSize: 26 }}>🎁</Text>
						<View style={{ flex: 1, marginHorizontal: 12 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '700' }]}>
								¿Buscas tarjetas de regalo?
							</Text>
							<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
								Amazon, Steam, Apple, Google Play y más en qvapay.com
							</Text>
						</View>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>›</Text>
					</Pressable>
				)}

				{/* Tarjetas de regalo — entry point siempre presente en Android */}
				{SHOW_GIFT_CARDS && (
					<View style={styles.section}>
						<SectionHeader
							title="Tarjetas de regalo"
							hint="Amazon, Steam, Apple, Google Play y más"
							actionLabel="Ver todas"
							onAction={() => navigation.navigate(ROUTES.GIFT_CARDS)}
							theme={theme}
							textStyles={textStyles}
						/>

						{/* Favoritos del usuario */}
						{favorites.length > 0 && (
							<View style={{ marginBottom: 14 }}>
								<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
									Tus marcas favoritas
								</Text>
								<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 10 }}>
									{favorites.map(b => (
										<View key={`fav-${b.country}-${b.brand}`} style={{ width: 150 }}>
											<BrandTile
												brand={b}
												country={{ code: b.country, ...(b.country_meta || {}) }}
												onPress={() => goToVoucherBrand(b)}
											/>
										</View>
									))}
								</ScrollView>
							</View>
						)}

						{/* Populares */}
						{featuredRows.length > 0 && (
							<View style={{ marginBottom: 14 }}>
								<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
									⚡ Populares
								</Text>
								<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 10 }}>
									{featuredRows.map(b => (
										<View key={`feat-${b.country}-${b.brand}`} style={{ width: 150 }}>
											<BrandTile
												brand={b}
												country={{ code: b.country, ...(b.country_meta || {}) }}
												onPress={() => goToVoucherBrand(b)}
											/>
										</View>
									))}
								</ScrollView>
							</View>
						)}

						{/* Categorías */}
						{categories.length > 0 && (
							<View>
								<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
									Explora por categoría
								</Text>
								<View style={styles.catGrid}>
									{categories.map(c => (
										<Pressable
											key={c.key}
											onPress={() => navigation.navigate(ROUTES.GIFT_CARDS, { category: c.key })}
											style={[
												styles.catCard,
												{ backgroundColor: theme.colors.surface, width: numColumns === 2 ? '48%' : numColumns === 3 ? '31.5%' : '23%' },
												theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
											]}
										>
											<Text style={{ fontSize: 26 }}>{c.emoji}</Text>
											<View style={{ flex: 1, marginLeft: 10 }}>
												<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '700' }]} numberOfLines={1}>
													{c.label}
												</Text>
												<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
													{c.count} {c.count === 1 ? 'marca' : 'marcas'}
												</Text>
											</View>
										</Pressable>
									))}
								</View>
							</View>
						)}

						{/* Empty state: aún sin featured/favorites/categorías → CTA único */}
						{favorites.length === 0 && featuredRows.length === 0 && categories.length === 0 && (
							<Pressable
								onPress={() => navigation.navigate(ROUTES.GIFT_CARDS)}
								style={[styles.giftCardCta, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
							>
								<Text style={{ fontSize: 36 }}>🎁</Text>
								<View style={{ flex: 1, marginLeft: 14 }}>
									<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '700' }]}>
										Explora tarjetas de regalo
									</Text>
									<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
										Cientos de marcas en 11 países
									</Text>
								</View>
								<Text style={[textStyles.h5, { color: theme.colors.primary, fontWeight: '700' }]}>›</Text>
							</Pressable>
						)}
					</View>
				)}

				{/* Recargas móviles */}
				<View style={styles.section}>
					<View style={styles.recargasHeader}>
						<View style={{ flex: 1 }}>
							<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '800' }]}>Recargas móviles</Text>
							<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
								{topupSelected?.code === 'CU'
									? 'Cubacel local — tarifa P2P sin recargo.'
									: 'Recarga el móvil de cualquier persona en LATAM.'}
							</Text>
						</View>
						<Pressable
							onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX, { country: topupSelected?.code })}
							style={[styles.miniCta, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
						>
							<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '700' }]}>Ver todas</Text>
						</Pressable>
					</View>

					{/* Country picker */}
					<View style={{ marginBottom: 12 }}>
						<CountryPicker
							countries={topupCountries}
							value={topupSelected}
							onChange={setTopupSelected}
							placeholder="Selecciona país"
						/>
					</View>

					{/* Brands grid (top 6) */}
					<View style={styles.brandGrid}>
						{topupBrands.slice(0, 6).map(b => {
							const price = formatPriceRange(b.price_min, b.price_max)
							return (
								<Pressable
									key={`${topupSelected?.code}-${b.brand}`}
									onPress={() => goToTopupBrand(b)}
									style={[
										styles.brandCell,
										{
											backgroundColor: theme.colors.surface,
											width: numColumns === 2 ? '48%' : numColumns === 3 ? '31.5%' : '23%',
										},
										theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
									]}
								>
									<OperatorAvatar brand={b.brand} logoUrl={b.logo_url} size="md" />
									<View style={{ flex: 1, marginLeft: 10 }}>
										<Text numberOfLines={1} style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '700' }]}>
											{b.brand}
										</Text>
										<Text numberOfLines={1} style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
											{price || `${b.offer_count || 0} planes`}
										</Text>
									</View>
								</Pressable>
							)
						})}
						{topupBrands.length === 0 && (
							<View style={[styles.empty, { backgroundColor: theme.colors.surface, width: '100%' }]}>
								<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
									No hay operadores disponibles
								</Text>
							</View>
						)}
					</View>
				</View>
			</ScrollView>
		</View>
	)
}

const SectionHeader = ({ title, hint, actionLabel, onAction, theme, textStyles }) => (
	<View style={styles.sectionHeader}>
		<View style={{ flex: 1 }}>
			<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '700' }]}>{title}</Text>
			{hint && <Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>{hint}</Text>}
		</View>
		{actionLabel && onAction && (
			<Pressable onPress={onAction} hitSlop={8}>
				<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '700' }]}>
					{actionLabel} ›
				</Text>
			</Pressable>
		)}
	</View>
)

const styles = StyleSheet.create({
	heroRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 22,
	},
	miniCta: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 999,
	},
	section: { marginBottom: 24 },
	sectionHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 10,
	},
	catGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
	},
	catCard: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 14,
	},
	giftCardCta: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 18,
		borderRadius: 16,
	},
	iosInfoBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 14,
		borderRadius: 14,
		marginBottom: 22,
	},
	recargasHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 14,
	},
	brandGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
	},
	brandCell: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 14,
	},
	empty: {
		padding: 30,
		borderRadius: 14,
		alignItems: 'center',
	},
})

export default Store
