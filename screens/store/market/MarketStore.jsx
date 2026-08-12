import { useState, useEffect, useCallback, useReducer, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Share, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import FastImage from '@d11/react-native-fast-image'
import LinearGradient from 'react-native-linear-gradient'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

import QPLoader from '../../../ui/particles/QPLoader'
import OperatorAvatar from '../../../ui/store/OperatorAvatar'
import ProductTile from '../../../ui/store/ProductTile'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

import { marketApi } from '../../../api/marketApi'
import { mediaUrl } from '../../../helpers/mediaUrl'
import { ROUTES } from '../../../routes'
import useMarketCart from './useMarketCart'
import { MARKET_CATEGORIES, MARKET_SOCIAL_ICONS, socialHref } from './marketConstants'

// Stale-while-revalidate cache (instant back-navigation / offline rendering)
import { CACHE_KEYS, readCache, writeCache } from '../../../helpers/dataCache'

import { toast } from 'sonner-native'

// Cover total (status bar incluido) = 20% del alto de pantalla, igual que
// P2PUser — headerShown:false arranca en y=0, sin márgenes negativos
const COVER_HEIGHT_RATIO = 0.2

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
 * Floating controls over the cover (Scan/Profile look): back pill on the left
 * and the cart pill (with live badge) on the right. Rendered OUTSIDE the
 * ScrollView — and also in the loading state — so back always exists.
 */
const FloatingTopBar = ({ insets, onBack, onCart, cartCount, theme }) => (
	<View style={[styles.floatingTopBar, { top: insets.top + 6 }]} pointerEvents="box-none">
		<Pressable onPress={onBack} style={styles.floatingBtn} hitSlop={10}>
			<FontAwesome6 name="arrow-left" size={18} color="white" iconStyle="solid" />
		</Pressable>
		<Pressable onPress={onCart} style={styles.floatingBtn} hitSlop={10}>
			<FontAwesome6 name="cart-shopping" size={16} color="white" iconStyle="solid" />
			{cartCount > 0 && (
				<View style={[styles.cartBadge, { backgroundColor: theme.colors.primary }]}>
					<Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
				</View>
			)}
		</Pressable>
	</View>
)

/**
 * Public storefront of one approved marketplace store, with the profile
 * treatment (P2PUser look): full-bleed cover up to the status bar (no native
 * header), dark scrim for the floating back/cart pills, bottom fade into the
 * background and the shop logo overhanging the cover inside a ring. Identity
 * (name, rating, socials) is centered below; then returns policy and the
 * product grid. First 12 products arrive embedded in
 * `GET /market/stores/{slug}`; "Cargar más" pages the per-store catalog
 * (`GET /market/catalog?shop=`). Route params: `{ slug }`.
 */
const MarketStore = ({ navigation, route }) => {

	const { slug } = route.params || {}
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { width, height: windowHeight } = useWindowDimensions()
	const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2
	const { count: cartCount } = useMarketCart()

	// Cover extends behind the status bar (header is disabled for this screen).
	const totalCoverHeight = Math.round(windowHeight * COVER_HEIGHT_RATIO)

	const [data, dispatchData] = useReducer(shopReducer, { store: null, products: [], catalogPage: 1, catalogTotal: null })
	const { store, products, catalogPage, catalogTotal } = data
	const [loading, setLoading] = useState(true)
	const [loadingMore, setLoadingMore] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const [policyOpen, setPolicyOpen] = useState(false)
	const hasFresh = useRef(false)

	const cacheKey = `${CACHE_KEYS.MARKET_SHOP}:${slug}`

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

	const goBack = useCallback(() => { navigation.goBack() }, [navigation])
	const goCart = useCallback(() => { navigation.navigate(ROUTES.MARKET_CART) }, [navigation])

	// Compartir la URL pública (la app la captura como deep link).
	// TODO(viralidad): añadir ?ref={username} a la URL cuando qpweb atribuya
	// puntos al que comparte — decidido 2026-08-12, pendiente del backend.
	const handleShare = useCallback(async () => {
		const url = `https://qvapay.com/store/${slug}`
		try {
			await Share.share({
				url, // iOS uses this as the payload
				message: `Descubre ${store?.name || 'esta tienda'} en QvaPay: ${url}`, // Android uses message
				title: store?.name || 'Tienda en QvaPay',
			})
		} catch (_) { /* cancelled */ }
	}, [slug, store?.name])

	if (loading || !store) {
		return (
			<View style={containerStyles.container}>
				<View style={[StyleSheet.absoluteFill, styles.center]}>
					<QPLoader />
				</View>
				<FloatingTopBar insets={insets} onBack={goBack} onCart={goCart} cartCount={cartCount} theme={theme} />
			</View>
		)
	}

	// Cover: banner → primera imagen de producto → fondo plano (el scrim mantiene
	// los pills legibles en todos los casos)
	const cover = mediaUrl(store.banner) || mediaUrl(store.product_images?.[0]) || mediaUrl(products[0]?.main_image)
	const rating = store.rating_avg != null && Number(store.rating_avg) > 0 ? Number(store.rating_avg).toFixed(1) : null
	const metaLine = [
		store.category && MARKET_CATEGORIES[store.category],
		rating && store.accept_reviews !== false && store.rating_count > 0
			? `★ ${rating} · ${store.rating_count} ${store.rating_count === 1 ? 'reseña' : 'reseñas'}`
			: null,
		store.sales_count ? `${store.sales_count} ${store.sales_count === 1 ? 'venta' : 'ventas'}` : null,
	].filter(Boolean).join(' · ')
	const socials = Object.entries(store.socials || {}).map(([network, value]) => ({ network, href: socialHref(network, value) })).filter(s => s.href)
	const hasMore = catalogTotal != null && products.length < catalogTotal

	const renderProduct = ({ item }) => (
		<View style={{ flex: 1 / numColumns, padding: 5 }}>
			<ProductTile product={item} onPress={() => navigation.navigate(ROUTES.MARKET_PRODUCT, { uuid: item.uuid })} />
		</View>
	)

	return (
		<View style={containerStyles.container}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
				showsVerticalScrollIndicator={false}
				contentInsetAdjustmentBehavior="never"
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>
				{/* Cover full-bleed hasta el status bar (tratamiento perfil) */}
				<View style={{ height: totalCoverHeight, backgroundColor: theme.colors.surface }}>
					{cover && (
						<FastImage
							source={{ uri: cover, priority: FastImage.priority.high, cache: FastImage.cacheControl.immutable }}
							style={StyleSheet.absoluteFill}
							resizeMode={FastImage.resizeMode.cover}
						/>
					)}
					{/* Scrim superior: legibilidad de los pills flotantes */}
					<LinearGradient
						colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.15)', 'transparent']}
						start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
						style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 56 }}
					/>
					{/* Fade inferior hacia el fondo de la pantalla */}
					<LinearGradient
						colors={['transparent', theme.colors.background]}
						start={{ x: 0.5, y: 0.55 }} end={{ x: 0.5, y: 1 }}
						style={StyleSheet.absoluteFill}
					/>
					{/* Logo sobresaliendo del cover, con anillo que funde con el fondo */}
					<View style={styles.logoWrap}>
						<View style={[styles.logoRing, { borderColor: theme.colors.background, backgroundColor: theme.colors.surface }]}>
							<OperatorAvatar brand={store.name} logoUrl={store.logo} size="lg" featured={!!store.featured} />
						</View>
					</View>
				</View>

				{/* Identidad centrada (estilo perfil) */}
				<View style={styles.identity}>
					<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '600', textAlign: 'center' }]} numberOfLines={2}>
						{store.name}
					</Text>
					{!!metaLine && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 4, textAlign: 'center' }]} numberOfLines={1}>
							{metaLine}
						</Text>
					)}
					{!!store.description && (
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginTop: 10, textAlign: 'center' }]}>
							{store.description}
						</Text>
					)}
					<View style={styles.socialsRow}>
						{socials.map(({ network, href }) => {
							const social = MARKET_SOCIAL_ICONS[network]
							if (!social) return null
							// X y el globo web no tienen color de marca usable en dark → theme
							const color = social.color || theme.colors.primaryText
							return (
								<Pressable
									key={network}
									onPress={() => Linking.openURL(href)}
									hitSlop={6}
									style={[styles.socialCircle, { backgroundColor: `${color}18` }]}
								>
									<FontAwesome6 name={social.icon} size={17} color={color} iconStyle={social.iconStyle} />
								</Pressable>
							)
						})}
						{/* Compartir tienda — siempre presente, cierra la fila */}
						<Pressable
							onPress={handleShare}
							hitSlop={6}
							style={[styles.socialCircle, { backgroundColor: `${theme.colors.primary}18` }]}
						>
							<FontAwesome6 name="share-nodes" size={16} color={theme.colors.primary} iconStyle="solid" />
						</Pressable>
					</View>
				</View>

				{/* Productos */}
				<View style={[styles.section, styles.gridHeader]}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>Productos</Text>
					{store.product_count != null && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{store.product_count} {store.product_count === 1 ? 'producto' : 'productos'}
						</Text>
					)}
				</View>

				{products.length === 0 ? (
					<View style={styles.section}>
						<View style={[styles.empty, { backgroundColor: theme.colors.surface }]}>
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
								Esta tienda aún no tiene productos publicados
							</Text>
						</View>
					</View>
				) : (
					<View style={styles.gridWrap}>
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

				{/* Política de devoluciones (colapsable) — al pie, como letra pequeña */}
				{!!store.returns_policy && (
					<View style={styles.section}>
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
					</View>
				)}
			</ScrollView>

			<FloatingTopBar insets={insets} onBack={goBack} onCart={goCart} cartCount={cartCount} theme={theme} />
		</View>
	)
}

const styles = StyleSheet.create({
	center: {
		alignItems: 'center',
		justifyContent: 'center',
	},
	floatingTopBar: {
		position: 'absolute',
		left: 16,
		right: 16,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	floatingBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: 'rgba(0,0,0,0.4)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	cartBadge: {
		position: 'absolute',
		top: -3,
		right: -5,
		minWidth: 16,
		height: 16,
		borderRadius: 8,
		paddingHorizontal: 3,
		alignItems: 'center',
		justifyContent: 'center',
	},
	cartBadgeText: {
		color: '#FFF',
		fontSize: 9,
		fontWeight: '700',
	},
	// El logo sobresale 40px por debajo del cover; identity compensa con marginTop
	logoWrap: {
		position: 'absolute',
		bottom: -40,
		left: 0,
		right: 0,
		alignItems: 'center',
	},
	logoRing: {
		width: 84,
		height: 84,
		borderRadius: 24,
		borderWidth: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	identity: {
		marginTop: 50,
		paddingHorizontal: 16,
		alignItems: 'center',
	},
	socialsRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		gap: 12,
		marginTop: 12,
	},
	socialCircle: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: 'center',
		justifyContent: 'center',
	},
	section: {
		paddingHorizontal: 16,
	},
	policyCard: {
		marginTop: 16,
		padding: 12,
		borderRadius: 14,
	},
	gridHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginTop: 20,
		marginBottom: 10,
	},
	// 16 de sección − 5 de padding de celda = 11
	gridWrap: {
		paddingHorizontal: 11,
	},
	empty: {
		padding: 40,
		borderRadius: 14,
		alignItems: 'center',
	},
})

export default MarketStore
