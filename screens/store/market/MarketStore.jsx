import { useState, useEffect, useCallback, useLayoutEffect, useReducer, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import FastImage from '@d11/react-native-fast-image'

import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

import QPLoader from '../../../ui/particles/QPLoader'
import OperatorAvatar from '../../../ui/store/OperatorAvatar'
import ProductTile from '../../../ui/store/ProductTile'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

import { marketApi } from '../../../api/marketApi'
import { mediaUrl } from '../../../helpers/mediaUrl'
import { ROUTES } from '../../../routes'
import { MARKET_CATEGORIES, MARKET_SOCIAL_NETWORKS, socialHref } from './marketConstants'

// Stale-while-revalidate cache (instant back-navigation / offline rendering)
import { CACHE_KEYS, readCache, writeCache } from '../../../helpers/dataCache'

import { toast } from 'sonner-native'

// Detalle embebido: 12 productos; el resto pagina contra el catálogo por tienda.
const CATALOG_PAGE_SIZE = 24

function shopReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		case 'hydrate':
			return state.store ? state : { ...state, ...action.values }
		case 'appendProducts':
			return { ...state, products: [...state.products, ...action.value] }
		default:
			return state
	}
}

/**
 * Public storefront of one approved marketplace store: banner + logo header,
 * real seller rating, socials, returns policy and the product grid. First 12
 * products arrive embedded in `GET /market/stores/{slug}`; "Cargar más" pages
 * the per-store catalog (`GET /market/catalog?shop=`). Route params: `{ slug }`.
 */
const MarketStore = ({ navigation, route }) => {

	const { slug } = route.params || {}
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { width } = useWindowDimensions()
	const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2

	const [data, dispatchData] = useReducer(shopReducer, { store: null, products: [], catalogPage: 1, catalogTotal: null })
	const { store, products, catalogPage, catalogTotal } = data
	const [loading, setLoading] = useState(true)
	const [loadingMore, setLoadingMore] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const [policyOpen, setPolicyOpen] = useState(false)
	const hasFresh = useRef(false)

	const cacheKey = `${CACHE_KEYS.MARKET_SHOP}:${slug}`

	useLayoutEffect(() => {
		navigation.setOptions({ headerTitle: store?.name || '' })
	}, [navigation, store?.name])

	// Cold-start hydration: paint the cached storefront, revalidate below
	useEffect(() => {
		readCache(cacheKey).then(cached => {
			if (!cached?.store || hasFresh.current) return
			dispatchData({ type: 'hydrate', values: { store: cached.store, products: cached.products || [] } })
			setLoading(false)
		})
	}, [cacheKey])

	const fetchStore = useCallback(async () => {
		const res = await marketApi.getStore(slug)
		if (res.success) {
			hasFresh.current = true
			const fresh = { store: res.data?.store || null, products: res.data?.products || [] }
			dispatchData({ type: 'set', field: 'store', value: fresh.store })
			dispatchData({ type: 'set', field: 'products', value: fresh.products })
			dispatchData({ type: 'set', field: 'catalogPage', value: 1 })
			dispatchData({ type: 'set', field: 'catalogTotal', value: fresh.store?.product_count ?? null })
			writeCache(cacheKey, fresh)
		} else if (!store) {
			toast.error('Tienda', { description: res.error })
			if (res.status === 404) navigation.goBack()
		}
		setLoading(false)
	}, [slug, cacheKey, store, navigation])

	useEffect(() => { fetchStore() }, []) // eslint-disable-line react-hooks/exhaustive-deps

	// "Cargar más": pagina el catálogo por tienda y de-dup por uuid con lo embebido
	const loadMore = useCallback(async () => {
		setLoadingMore(true)
		const nextPage = catalogPage + 1
		const res = await marketApi.getCatalog({ shop: slug, page: nextPage, take: CATALOG_PAGE_SIZE, sort: 'newest' })
		if (res.success) {
			const fresh = (res.data?.products || []).filter(p => !products.some(x => x.uuid === p.uuid))
			dispatchData({ type: 'appendProducts', value: fresh })
			dispatchData({ type: 'set', field: 'catalogPage', value: nextPage })
			if (res.data?.total != null) dispatchData({ type: 'set', field: 'catalogTotal', value: res.data.total })
		} else {
			toast.error('Productos', { description: res.error })
		}
		setLoadingMore(false)
	}, [slug, catalogPage, products])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchStore()
		setRefreshing(false)
	}, [fetchStore])

	if (loading || !store) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	const banner = mediaUrl(store.banner)
	const rating = store.rating_avg != null && Number(store.rating_avg) > 0 ? Number(store.rating_avg).toFixed(1) : null
	const socials = Object.entries(store.socials || {}).map(([network, value]) => ({ network, href: socialHref(network, value) })).filter(s => s.href)
	const hasMore = catalogTotal != null && products.length < catalogTotal

	const renderProduct = ({ item }) => (
		<View style={{ flex: 1 / numColumns, padding: 5 }}>
			<ProductTile product={item} onPress={() => navigation.navigate(ROUTES.MARKET_PRODUCT, { uuid: item.uuid })} />
		</View>
	)

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>
				{/* Cover + logo flotante (estilo perfil) */}
				<View style={[styles.cover, { backgroundColor: theme.colors.elevationLight }]}>
					{banner && (
						<FastImage
							source={{ uri: banner, priority: FastImage.priority.high, cache: FastImage.cacheControl.immutable }}
							style={StyleSheet.absoluteFill}
							resizeMode={FastImage.resizeMode.cover}
						/>
					)}
				</View>
				<View style={styles.headerRow}>
					<View style={[styles.logoRing, { backgroundColor: theme.colors.surface }]}>
						<OperatorAvatar brand={store.name} logoUrl={store.logo} size="lg" />
					</View>
					<View style={{ flex: 1, marginLeft: 12, marginTop: 26 }}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>
							{store.name}
						</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]} numberOfLines={1}>
							{[
								store.category && MARKET_CATEGORIES[store.category],
								rating && store.accept_reviews !== false && store.rating_count > 0
									? `★ ${rating} · ${store.rating_count} ${store.rating_count === 1 ? 'reseña' : 'reseñas'}`
									: null,
								store.sales_count ? `${store.sales_count} ${store.sales_count === 1 ? 'venta' : 'ventas'}` : null,
							].filter(Boolean).join(' · ')}
						</Text>
					</View>
				</View>

				{!!store.description && (
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginTop: 10 }]}>
						{store.description}
					</Text>
				)}

				{/* Redes sociales */}
				{socials.length > 0 && (
					<View style={styles.socialsRow}>
						{socials.map(({ network, href }) => (
							<Pressable key={network} onPress={() => Linking.openURL(href)} hitSlop={6}>
								<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '600' }]}>
									{MARKET_SOCIAL_NETWORKS[network] || network}
								</Text>
							</Pressable>
						))}
					</View>
				)}

				{/* Política de devoluciones (colapsable) */}
				{!!store.returns_policy && (
					<Pressable
						onPress={() => setPolicyOpen(o => !o)}
						style={[styles.policyCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
					>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
							Política de devoluciones {policyOpen ? '▾' : '▸'}
						</Text>
						{policyOpen && (
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 6 }]}>
								{store.returns_policy}
							</Text>
						)}
					</Pressable>
				)}

				{/* Productos */}
				<View style={styles.gridHeader}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>Productos</Text>
					{store.product_count != null && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{store.product_count} {store.product_count === 1 ? 'producto' : 'productos'}
						</Text>
					)}
				</View>

				{products.length === 0 ? (
					<View style={[styles.empty, { backgroundColor: theme.colors.surface }]}>
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
							Esta tienda aún no tiene productos publicados
						</Text>
					</View>
				) : (
					<View style={{ marginHorizontal: -5 }}>
						<FlashList
							data={products}
							keyExtractor={(item) => item.uuid}
							renderItem={renderProduct}
							numColumns={numColumns}
							key={numColumns}
							scrollEnabled={false}
						/>
						{hasMore && (
							<View style={{ alignItems: 'center', marginTop: 14 }}>
								{loadingMore ? (
									<QPLoader />
								) : (
									<Text
										onPress={loadMore}
										style={[textStyles.h6, { color: theme.colors.primary, fontWeight: '600', paddingVertical: 10, paddingHorizontal: 24 }]}
									>
										Cargar más
									</Text>
								)}
							</View>
						)}
					</View>
				)}
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	cover: {
		height: 120,
		borderRadius: 16,
		overflow: 'hidden',
	},
	headerRow: {
		flexDirection: 'row',
		marginTop: -32,
		paddingHorizontal: 10,
	},
	logoRing: {
		width: 76,
		height: 76,
		borderRadius: 21,
		alignItems: 'center',
		justifyContent: 'center',
	},
	socialsRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 14,
		marginTop: 10,
	},
	policyCard: {
		marginTop: 14,
		padding: 12,
		borderRadius: 14,
	},
	gridHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginTop: 20,
		marginBottom: 10,
		paddingHorizontal: 5,
	},
	empty: {
		padding: 40,
		borderRadius: 14,
		alignItems: 'center',
	},
})

export default MarketStore
