import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FastImage from '@d11/react-native-fast-image'

import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'
import OperatorAvatar from '../../../ui/store/OperatorAvatar'

import { marketApi } from '../../../api/marketApi'
import { mediaUrl } from '../../../helpers/mediaUrl'
import { ROUTES } from '../../../routes'
import useMarketCart from './useMarketCart'
import { effectivePrice } from './marketCheckout'
import { KIND_LABELS, formatPriceRange, shipToSummary } from './marketConstants'

import { toast } from 'sonner-native'

/**
 * Variant selector (Amazon-style): one pill row per option axis; impossible
 * or sold-out combinations dim according to the partial selection of the
 * other axes. Port of `qpweb/components/market/variant-picker.js`.
 * `onChange(variant | null)` — null while the selection is incomplete.
 */
const VariantPicker = ({ optionAxes, variants, onChange, theme, textStyles }) => {

	const [selection, setSelection] = useState({})

	const valuesByAxis = useMemo(() => {
		const map = {}
		for (const axis of optionAxes) {
			const values = []
			for (const v of variants) {
				const val = v.options?.[axis]
				if (val != null && !values.includes(val)) values.push(val)
			}
			map[axis] = values
		}
		return map
	}, [optionAxes, variants])

	const findVariant = (sel) => variants.find((v) => optionAxes.every((a) => v.options?.[a] === sel[a])) || null

	const isValueAvailable = (axis, value) => {
		return variants.some((v) => {
			if (v.options?.[axis] !== value) return false
			for (const other of optionAxes) {
				if (other === axis) continue
				if (selection[other] != null && v.options?.[other] !== selection[other]) return false
			}
			return v.stock == null || v.stock > 0
		})
	}

	const pick = (axis, value) => {
		const next = { ...selection, [axis]: selection[axis] === value ? undefined : value }
		setSelection(next)
		const complete = optionAxes.every((a) => next[a] != null)
		onChange(complete ? findVariant(next) : null)
	}

	return (
		<View style={{ gap: 12 }}>
			{optionAxes.map((axis) => (
				<View key={axis}>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginBottom: 6, fontWeight: '500' }]}>
						{axis}{selection[axis] ? `: ${selection[axis]}` : ''}
					</Text>
					<View style={pickerStyles.row}>
						{valuesByAxis[axis].map((value) => {
							const selected = selection[axis] === value
							const available = isValueAvailable(axis, value)
							return (
								<Pressable
									key={value}
									disabled={!available && !selected}
									onPress={() => pick(axis, value)}
									style={[
										pickerStyles.pill,
										selected
											? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
											: { borderColor: theme.mode === 'light' ? theme.colors.border : theme.colors.elevationLight },
										!available && !selected && { opacity: 0.35 },
									]}
								>
									<Text
										style={[
											textStyles.caption,
											{ fontWeight: '600', color: selected ? theme.colors.almostWhite : theme.colors.primaryText },
											!available && !selected && { textDecorationLine: 'line-through' },
										]}
									>
										{value}
									</Text>
								</Pressable>
							)
						})}
					</View>
				</View>
			))}
		</View>
	)
}

const pickerStyles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	pill: {
		paddingHorizontal: 14,
		paddingVertical: 7,
		borderRadius: 999,
		borderWidth: 1,
	},
})

/**
 * Public product sheet: swipeable gallery (the active image follows the
 * selected variant), Amazon-style VariantPicker, effective price
 * (`variant.price ?? product.price`), stock and shipping summary, seller
 * card and the add-to-cart / buy-now CTAs. Always fetched fresh (no cache):
 * price and stock must be current. Route params: `{ uuid }`.
 */
const MarketProduct = ({ navigation, route }) => {

	const { uuid } = route.params || {}
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { width } = useWindowDimensions()
	const galleryWidth = width - 40 // subContainer padding

	const { add } = useMarketCart()
	const [product, setProduct] = useState(null)
	const [shop, setShop] = useState(null)
	const [variant, setVariant] = useState(null)
	const [galleryIndex, setGalleryIndex] = useState(0)
	const galleryRef = useRef(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let cancelled = false
		;(async () => {
			const res = await marketApi.getProduct(uuid)
			if (cancelled) return
			if (res.success) {
				setProduct(res.data?.product || null)
				setShop(res.data?.shop || null)
			} else {
				toast.error('Producto', { description: res.error })
				navigation.goBack()
			}
			setLoading(false)
		})()
		return () => { cancelled = true }
	}, [uuid, navigation])

	const hasVariants = (product?.variants?.length || 0) > 0 && (product?.option_axes?.length || 0) > 0
	const variantReady = !hasVariants || !!variant

	// Galería: main_image + images extra; la imagen de la variante manda al elegirla
	const gallery = useMemo(() => {
		const urls = [product?.main_image, ...(Array.isArray(product?.images) ? product.images : [])]
			.map(mediaUrl)
			.filter(Boolean)
		return [...new Set(urls)]
	}, [product])

	useEffect(() => {
		const variantImage = mediaUrl(variant?.image)
		if (!variantImage) return
		const idx = gallery.indexOf(variantImage)
		if (idx >= 0) galleryRef.current?.scrollTo({ x: idx * galleryWidth, animated: true })
	}, [variant, gallery, galleryWidth])

	// Stock efectivo de la selección actual
	const stock = useMemo(() => {
		if (!product) return null
		if (!product.track_inventory) return null // sin control = ilimitado
		if (hasVariants) return variant ? variant.stock : undefined // undefined = aún sin elegir
		return product.stock
	}, [product, hasVariants, variant])

	const soldOut = stock !== null && stock !== undefined && stock <= 0
	const price = variantReady ? effectivePrice(product, variant) : null
	const priceLabel = variantReady
		? formatPriceRange(price)
		: formatPriceRange(product?.price_min, product?.price_max)

	const buildCartItem = useCallback(() => ({
		product_uuid: product.uuid,
		...(variant ? { variant_uuid: variant.uuid } : {}),
		qty: 1,
		title: product.title,
		image: variant?.image || product.main_image,
		price: effectivePrice(product, variant),
		kind: product.kind,
		shop_slug: shop?.slug,
		shop_name: shop?.name,
		...(variant?.options ? { variant_label: Object.entries(variant.options).map(([k, v]) => `${k}: ${v}`).join(' · ') } : {}),
		ship_to: product.ship_to ?? null,
	}), [product, variant, shop])

	const addToCart = useCallback((silently = false) => {
		if (!variantReady) {
			toast.error(`Elige ${product.option_axes.join(' y ')}`)
			return false
		}
		const accepted = add(buildCartItem())
		if (!accepted) {
			toast.error('Carrito lleno (30 productos máximo)')
			return false
		}
		if (!silently) toast.success('Agregado al carrito', { description: product.title })
		return true
	}, [variantReady, product, add, buildCartItem])

	const buyNow = useCallback(() => {
		if (addToCart(true)) navigation.navigate(ROUTES.MARKET_CART)
	}, [addToCart, navigation])

	if (loading || !product) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	const shipping = product.kind === 'physical' ? shipToSummary(product.ship_to) : null

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>

				{/* Galería */}
				<View style={[styles.gallery, { backgroundColor: theme.colors.elevationLight }]}>
					{gallery.length > 0 ? (
						<ScrollView
							ref={galleryRef}
							horizontal
							pagingEnabled
							showsHorizontalScrollIndicator={false}
							onMomentumScrollEnd={(e) => setGalleryIndex(Math.round(e.nativeEvent.contentOffset.x / galleryWidth))}
						>
							{gallery.map((uri) => (
								<FastImage
									key={uri}
									source={{ uri, priority: FastImage.priority.high, cache: FastImage.cacheControl.immutable }}
									style={{ width: galleryWidth, height: galleryWidth * 0.9 }}
									resizeMode={FastImage.resizeMode.cover}
								/>
							))}
						</ScrollView>
					) : (
						<View style={{ height: galleryWidth * 0.9 }} />
					)}
					{gallery.length > 1 && (
						<View style={styles.dots}>
							{gallery.map((uri, i) => (
								<View
									key={uri}
									style={[styles.dot, { backgroundColor: i === galleryIndex ? theme.colors.primary : 'rgba(255,255,255,0.5)' }]}
								/>
							))}
						</View>
					)}
				</View>

				{/* Título + precio */}
				<View style={{ marginTop: 14 }}>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
						{KIND_LABELS[product.kind] || product.kind}
					</Text>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText, fontWeight: '600', marginTop: 4 }]}>
						{product.title}
					</Text>
					<Text style={[textStyles.h3, { color: theme.colors.primary, fontWeight: '600', marginTop: 6 }]}>
						{!variantReady ? `desde ${priceLabel}` : priceLabel}
					</Text>
					{stock !== null && stock !== undefined && stock > 0 && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 4 }]}>
							{stock} {stock === 1 ? 'disponible' : 'disponibles'}
						</Text>
					)}
					{soldOut && (
						<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 4, fontWeight: '600' }]}>
							Agotado
						</Text>
					)}
				</View>

				{/* Variantes */}
				{hasVariants && (
					<View style={{ marginTop: 16 }}>
						<VariantPicker
							optionAxes={product.option_axes}
							variants={product.variants}
							onChange={setVariant}
							theme={theme}
							textStyles={textStyles}
						/>
					</View>
				)}

				{/* Envío */}
				{shipping && (
					<View style={[styles.infoCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
							Envíos a
						</Text>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4 }]}>
							{shipping}
						</Text>
					</View>
				)}

				{/* Descripción */}
				{!!product.description && (
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginTop: 16 }]}>
						{product.description}
					</Text>
				)}

				{/* Vendido por */}
				{shop && (
					<Pressable
						onPress={() => navigation.navigate(ROUTES.MARKET_STORE, { slug: shop.slug })}
						style={[styles.shopCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
					>
						<OperatorAvatar brand={shop.name} logoUrl={shop.logo} size="md" featured={!!shop.featured} />
						<View style={{ flex: 1, marginLeft: 10 }}>
							<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>Vendido por</Text>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>
								{shop.name}
							</Text>
						</View>
						{shop.rating_avg != null && Number(shop.rating_avg) > 0 && (
							<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>★ {Number(shop.rating_avg).toFixed(1)}</Text>
						)}
						<Text style={[textStyles.h5, { color: theme.colors.primary, fontWeight: '600', marginLeft: 8 }]}>›</Text>
					</Pressable>
				)}
			</ScrollView>

			{/* CTAs fijos al pie */}
			<View style={[styles.ctaBar, { paddingBottom: insets.bottom + 10, backgroundColor: theme.colors.background }]}>
				<View style={{ flex: 1 }}>
					{/* Variante outline primary (QPButton solo trae outline para danger) */}
					<QPButton
						title={soldOut ? 'Agotado' : variantReady ? 'Al carrito' : `Elige ${product.option_axes?.join(' y ') || 'una opción'}`}
						onPress={() => addToCart(false)}
						disabled={soldOut || !variantReady}
						style={{ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.primary }}
						textStyle={{ color: theme.colors.primary }}
					/>
				</View>
				<View style={{ flex: 1 }}>
					<QPButton
						title="Comprar ahora"
						onPress={buyNow}
						disabled={soldOut || !variantReady}
					/>
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	gallery: {
		borderRadius: 16,
		overflow: 'hidden',
	},
	dots: {
		position: 'absolute',
		bottom: 10,
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'center',
		gap: 6,
	},
	dot: {
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	infoCard: {
		marginTop: 16,
		padding: 12,
		borderRadius: 14,
	},
	shopCard: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 16,
		padding: 12,
		borderRadius: 14,
	},
	ctaBar: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: 'row',
		gap: 10,
		paddingHorizontal: 20,
		paddingTop: 10,
	},
})

export default MarketProduct
