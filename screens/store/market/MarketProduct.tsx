import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ScrollView as ScrollViewType } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import useContentPadding from '../../../hooks/useContentPadding'
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

import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles } from '../../../theme/themeUtils'
import type { RootStackParamList } from '../../../types/navigation'
import type { MarketProductDetail, MarketShop, MarketVariant } from './marketQueries'
import type { CartItem } from './cartCore'

// OJO: `theme.mode` no existe en el tema (siempre undefined) — bug de runtime
// pre-existente que se preserva tal cual; el alias es solo de tipos.
type ThemeWithMode = Theme & { mode?: string }

/** Selección parcial del picker: eje → valor elegido (undefined = sin elegir). */
type VariantSelection = Record<string, string | undefined>

type VariantPickerProps = {
	optionAxes: string[]
	variants: MarketVariant[]
	onChange: (variant: MarketVariant | null) => void
	theme: Theme
	textStyles: TextStyles
}

/**
 * Variant selector (Amazon-style): one pill row per option axis; impossible
 * or sold-out combinations dim according to the partial selection of the
 * other axes. Port of `qpweb/components/market/variant-picker.js`.
 * `onChange(variant | null)` — null while the selection is incomplete.
 */
const VariantPicker = ({ optionAxes, variants, onChange, theme, textStyles }: VariantPickerProps) => {

	const [selection, setSelection] = useState<VariantSelection>({})

	const valuesByAxis = useMemo(() => {
		const map: Record<string, string[]> = {}
		for (const axis of optionAxes) {
			const values: string[] = []
			for (const v of variants) {
				const val = v.options?.[axis]
				if (val != null && !values.includes(val)) values.push(val)
			}
			map[axis] = values
		}
		return map
	}, [optionAxes, variants])

	const findVariant = (sel: VariantSelection) => variants.find((v) => optionAxes.every((a) => v.options?.[a] === sel[a])) || null

	const isValueAvailable = (axis: string, value: string) => {
		return variants.some((v) => {
			if (v.options?.[axis] !== value) return false
			for (const other of optionAxes) {
				if (other === axis) continue
				if (selection[other] != null && v.options?.[other] !== selection[other]) return false
			}
			return v.stock == null || v.stock > 0
		})
	}

	const pick = (axis: string, value: string) => {
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
											: { borderColor: (theme as ThemeWithMode).mode === 'light' ? theme.colors.border : theme.colors.elevationLight },
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
const MarketProduct = ({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'MarketProduct'>) => {

	const { uuid } = route.params || {}
	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const contentPadding = useContentPadding(110)
	const { width } = useWindowDimensions()
	const galleryWidth = width - 40 // subContainer padding

	const { add } = useMarketCart()
	const [product, setProduct] = useState<MarketProductDetail | null>(null)
	const [shop, setShop] = useState<MarketShop | null>(null)
	const [variant, setVariant] = useState<MarketVariant | null>(null)
	const [galleryIndex, setGalleryIndex] = useState(0)
	const galleryRef = useRef<ScrollViewType | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let cancelled = false
		;(async () => {
			const res = await marketApi.getProduct(uuid)
			if (cancelled) return
			if (res.success) {
				// `marketApi.getProduct` devuelve `unknown`: la ficha es `{ product, shop }`
				setProduct((res.data as { product?: MarketProductDetail | null } | undefined)?.product || null)
				setShop((res.data as { shop?: MarketShop | null } | undefined)?.shop || null)
			} else {
				toast.error(t('market.product.toasts.loadErrorTitle'), { description: res.error })
				navigation.goBack()
			}
			setLoading(false)
		})()
		return () => { cancelled = true }
	}, [uuid, navigation, t])

	const hasVariants = (product?.variants?.length || 0) > 0 && (product?.option_axes?.length || 0) > 0
	const variantReady = !hasVariants || !!variant

	// Galería: main_image + images extra; la imagen de la variante manda al elegirla
	const gallery = useMemo(() => {
		// `filter(Boolean)` no estrecha el tipo: el cast recupera `string[]`
		const urls = [product?.main_image, ...(Array.isArray(product?.images) ? product.images : [])]
			.map(mediaUrl)
			.filter(Boolean) as string[]
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

	const buildCartItem = useCallback((): CartItem => ({
		// Solo se invoca con `product` cargado (los CTAs viven bajo el guard de loading)
		product_uuid: product!.uuid as string,
		...(variant ? { variant_uuid: variant.uuid } : {}),
		qty: 1,
		title: product!.title,
		image: variant?.image || product!.main_image,
		price: effectivePrice(product, variant),
		kind: product!.kind,
		shop_slug: shop?.slug,
		shop_name: shop?.name,
		...(variant?.options ? { variant_label: Object.entries(variant.options).map(([k, v]) => `${k}: ${v}`).join(' · ') } : {}),
		ship_to: product!.ship_to ?? null,
	}), [product, variant, shop])

	const addToCart = useCallback((silently = false) => {
		if (!variantReady) {
			toast.error(t('market.product.chooseAxes', { axes: product!.option_axes!.join(t('market.product.axesJoiner')) }))
			return false
		}
		const accepted = add(buildCartItem())
		if (!accepted) {
			toast.error(t('market.product.toasts.cartFull'))
			return false
		}
		if (!silently) toast.success(t('market.product.toasts.added'), { description: product!.title as string })
		return true
	}, [variantReady, product, add, buildCartItem, t])

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
			<ScrollView contentContainerStyle={contentPadding} showsVerticalScrollIndicator={false}>

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
						{KIND_LABELS[product.kind as string] ? t(KIND_LABELS[product.kind as string]) : product.kind}
					</Text>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText, fontWeight: '600', marginTop: 4 }]}>
						{product.title}
					</Text>
					<Text style={[textStyles.h3, { color: theme.colors.primary, fontWeight: '600', marginTop: 6 }]}>
						{!variantReady ? t('market.product.from', { price: priceLabel }) : priceLabel}
					</Text>
					{stock !== null && stock !== undefined && stock > 0 && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 4 }]}>
							{t('market.product.available', { count: stock })}
						</Text>
					)}
					{soldOut && (
						<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 4, fontWeight: '600' }]}>
							{t('market.common.soldOut')}
						</Text>
					)}
				</View>

				{/* Variantes */}
				{hasVariants && (
					<View style={{ marginTop: 16 }}>
						<VariantPicker
							optionAxes={product.option_axes as string[]}
							variants={product.variants as MarketVariant[]}
							onChange={setVariant}
							theme={theme}
							textStyles={textStyles}
						/>
					</View>
				)}

				{/* Envío */}
				{shipping && (
					<View style={[styles.infoCard, { backgroundColor: theme.colors.surface }, (theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
							{t('market.product.shipsTo')}
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
						onPress={() => navigation.navigate(ROUTES.MARKET_STORE, { slug: shop.slug as string })}
						style={[styles.shopCard, { backgroundColor: theme.colors.surface }, (theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
					>
						<OperatorAvatar brand={shop.name} logoUrl={shop.logo} size="md" featured={!!shop.featured} />
						<View style={{ flex: 1, marginLeft: 10 }}>
							<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{t('market.common.soldBy')}</Text>
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
						title={soldOut ? t('market.common.soldOut') : variantReady ? t('market.product.addToCart') : t('market.product.chooseAxes', { axes: product.option_axes?.join(t('market.product.axesJoiner')) || t('market.product.oneOption') })}
						onPress={() => addToCart(false)}
						disabled={soldOut || !variantReady}
						style={{ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.primary }}
						textStyle={{ color: theme.colors.primary }}
					/>
				</View>
				<View style={{ flex: 1 }}>
					<QPButton
						title={t('market.product.buyNow')}
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
