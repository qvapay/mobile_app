import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Share, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ReactElement } from 'react'
import type { RefreshControlProps } from 'react-native'
import type { EdgeInsets } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import useContentPadding from '../../../hooks/useContentPadding'
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
import { useMarketShopQuery } from './marketQueries'
import { mediaUrl } from '../../../helpers/mediaUrl'
import { ROUTES } from '../../../routes'
import useMarketCart from './useMarketCart'
import { MARKET_CATEGORIES, MARKET_SOCIAL_ICONS, socialHref } from './marketConstants'

import { toast } from 'sonner-native'

import type { Theme } from '../../../theme/ThemeContext'
import type { RootStackParamList } from '../../../types/navigation'
import type { MarketProductDetail } from './marketQueries'
import type { ApiError } from '../../../api/unwrap'

// OJO: `theme.mode` no existe en el tema (siempre undefined) — bug de runtime
// pre-existente que se preserva tal cual; el alias es solo de tipos.
type ThemeWithMode = Theme & { mode?: string }

/** Páginas extra del catálogo por tienda (estado local sobre la query). */
type ExtraCatalog = { products: MarketProductDetail[], page: number, total: number | null }

// Cover total (status bar incluido) = 20% del alto de pantalla, igual que
// P2PUser — headerShown:false arranca en y=0, sin márgenes negativos
const COVER_HEIGHT_RATIO = 0.2

// Detalle embebido: 12 productos; el resto pagina contra el catálogo por tienda.
const CATALOG_PAGE_SIZE = 24

// Páginas extra del catálogo cargadas con "Cargar más" — estado local que se
// descarta en cada refresh (la primera tanda viene embebida en la query)
const initialExtra: ExtraCatalog = { products: [], page: 1, total: null }

/**
 * Floating controls over the cover (Scan/Profile look): back pill on the left
 * and the cart pill (with live badge) on the right. Rendered OUTSIDE the
 * ScrollView — and also in the loading state — so back always exists.
 */
type FloatingTopBarProps = {
	insets: EdgeInsets
	onBack: () => void
	onCart: () => void
	cartCount: number
	theme: Theme
}

const FloatingTopBar = ({ insets, onBack, onCart, cartCount, theme }: FloatingTopBarProps) => (
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
const MarketStore = ({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'MarketStore'>) => {

	const { slug } = route.params || {}
	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const contentPadding = useContentPadding(24)
	const { width, height: windowHeight } = useWindowDimensions()
	const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2
	const { count: cartCount } = useMarketCart()

	// Cover extends behind the status bar (header is disabled for this screen).
	const totalCoverHeight = Math.round(windowHeight * COVER_HEIGHT_RATIO)

	const [extra, setExtra] = useState(initialExtra)
	const [loadingMore, setLoadingMore] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const [policyOpen, setPolicyOpen] = useState(false)

	// Escaparate (tienda + primeros productos): React Query hace el fetch, la
	// persistencia en frío por slug y conserva lo último bueno si la red falla
	const shopQuery = useMarketShopQuery(slug)
	const { refetch: refetchShop } = shopQuery
	const store = shopQuery.data?.store || null
	const loading = shopQuery.isPending

	// Embebidos + páginas extra, dedup por uuid (offsets corridos pueden repetir)
	const products = useMemo(() => {
		const seen = new Set()
		const merged = []
		for (const p of [...(shopQuery.data?.products || []), ...extra.products]) {
			if (p?.uuid && seen.has(p.uuid)) continue
			if (p?.uuid) seen.add(p.uuid)
			merged.push(p)
		}
		return merged
	}, [shopQuery.data, extra.products])

	const catalogTotal = extra.total ?? store?.product_count ?? null

	// El toast solo sin NADA que pintar; un 404 devuelve al índice, como antes
	useEffect(() => {
		if (shopQuery.isError && !shopQuery.data) {
			toast.error(t('market.store.toasts.loadErrorTitle'), { description: shopQuery.error?.message })
			// `error` llega como Error; `unwrap` lanza ApiError, que adjunta el status
			if ((shopQuery.error as ApiError | null)?.status === 404) navigation.goBack()
		}
	}, [shopQuery.isError, shopQuery.data, shopQuery.error, navigation, t])

	// "Cargar más": pagina el catálogo por tienda (estado local sobre la query)
	const loadMore = useCallback(async () => {
		setLoadingMore(true)
		const nextPage = extra.page + 1
		const res = await marketApi.getCatalog({ shop: slug, page: nextPage, take: CATALOG_PAGE_SIZE, sort: 'newest' })
		if (res.success) {
			// `marketApi.getCatalog` devuelve `unknown`: la pantalla lee productos + total
			const incoming = (res.data as { products?: MarketProductDetail[] } | undefined)?.products || []
			setExtra(prev => ({
				products: [...prev.products, ...incoming],
				page: nextPage,
				total: (res.data as { total?: number | null } | undefined)?.total ?? prev.total,
			}))
		} else {
			toast.error(t('market.store.toasts.productsErrorTitle'), { description: res.error })
		}
		setLoadingMore(false)
	}, [slug, extra.page, t])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try {
			setExtra(initialExtra)
			await refetchShop()
		} catch { /* lo anterior sigue en pantalla */ }
		finally { setRefreshing(false) }
	}, [refetchShop])

	const goBack = useCallback(() => { navigation.goBack() }, [navigation])
	const goCart = useCallback(() => { navigation.navigate(ROUTES.MARKET_CART) }, [navigation])

	// Compartir la URL pública (la app la captura como deep link).
	// TODO(viralidad): añadir ?ref={username} a la URL cuando qpweb atribuya
	// puntos al que comparte — decidido 2026-08-12, pendiente del backend.
	const handleShare = useCallback(async () => {
		const url = `https://www.qvapay.com/store/${slug}`
		try {
			await Share.share({
				url, // iOS uses this as the payload
				message: t('market.store.share.message', { name: store?.name || t('market.store.share.fallbackName'), url }), // Android uses message
				title: store?.name || t('market.store.share.fallbackTitle'),
			})
		} catch (_) { /* cancelled */ }
	}, [slug, store?.name, t])

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
		store.category && MARKET_CATEGORIES[store.category] ? t(MARKET_CATEGORIES[store.category]) : null,
		rating && store.accept_reviews !== false && (store.rating_count as number) > 0
			? t('market.store.reviews', { rating, count: store.rating_count })
			: null,
		store.sales_count ? t('market.store.sales', { count: store.sales_count }) : null,
	].filter(Boolean).join(' · ')
	const socials = Object.entries(store.socials || {}).map(([network, value]) => ({ network, href: socialHref(network, value) })).filter(s => s.href) as { network: string, href: string }[]
	const hasMore = catalogTotal != null && products.length < catalogTotal

	const renderProduct = ({ item }: { item: MarketProductDetail }) => (
		<View style={{ flex: 1 / numColumns, padding: 5 }}>
			<ProductTile product={item} onPress={() => navigation.navigate(ROUTES.MARKET_PRODUCT, { uuid: item.uuid as string })} />
		</View>
	)

	return (
		<View style={containerStyles.container}>
			<ScrollView
				contentContainerStyle={contentPadding}
				showsVerticalScrollIndicator={false}
				contentInsetAdjustmentBehavior="never"
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
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
									{/* Icono y estilo vienen de MARKET_SOCIAL_ICONS (dato, no literales): FA6
									    tipa `name` como unión POR estilo, así que se fija la variante solid
									    en tipos — el valor real ('brand' en las redes) viaja intacto */}
									<FontAwesome6 name={social.icon as FontAwesome6SolidIconName} size={17} color={color} iconStyle={social.iconStyle as 'solid'} />
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
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>{t('market.store.products')}</Text>
					{store.product_count != null && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{t('market.common.products', { count: store.product_count })}
						</Text>
					)}
				</View>

				{products.length === 0 ? (
					<View style={styles.section}>
						<View style={[styles.empty, { backgroundColor: theme.colors.surface }]}>
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
								{t('market.store.emptyProducts')}
							</Text>
						</View>
					</View>
				) : (
					<View style={styles.gridWrap}>
						<FlashList
							data={products}
							keyExtractor={(item) => item.uuid as string}
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
										{t('market.common.loadMore')}
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
							style={[styles.policyCard, { backgroundColor: theme.colors.surface }, (theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
						>
							<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
								{t('market.store.returnsPolicy')} {policyOpen ? '▾' : '▸'}
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
		borderRadius: 16,
		borderCurve: 'continuous',
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
