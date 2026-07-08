import { useState, useEffect, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FastImage from '@d11/react-native-fast-image'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'

// Routes & API
import { ROUTES } from '../../../routes'
import { shopApi } from '../../../api/shopApi'

// Constants
import { money, providerLabel, feePercent } from './assistedConstants'

const MAX_QUANTITY = 10

/**
 * Assisted-shopping product view. Receives the parsed `product` from the URL
 * search (or only a `uuid` when coming from the recent shelf, in which case it
 * re-hydrates via `GET /shop/assisted-shopping/product/{uuid}`). Gallery +
 * price with the QvaPay fee spelled out + quantity stepper + add to cart.
 */
const AssistedProduct = ({ navigation, route }) => {

	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	const [product, setProduct] = useState(route.params?.product || null)
	const [quantity, setQuantity] = useState(1)
	const [adding, setAdding] = useState(false)
	const [selectedImage, setSelectedImage] = useState(route.params?.product?.main_image || null)

	// Re-hydrate when only a uuid was passed (recent shelf, future deep links).
	useEffect(() => {
		const uuid = route.params?.uuid
		if (product || !uuid) return
		const fetchProduct = async () => {
			const res = await shopApi.getProduct(uuid)
			if (res.success && res.data?.product) {
				setProduct(res.data.product)
				setSelectedImage(res.data.product.main_image)
			} else {
				toast.error('Compras asistidas', { description: res.error })
				navigation.goBack()
			}
		}
		fetchProduct()
	}, [route.params?.uuid, product, navigation])

	const gallery = useMemo(() => {
		if (!product) return []
		const extras = Array.isArray(product.images) ? product.images : []
		return [...new Set([product.main_image, ...extras].filter(Boolean))].slice(0, 8)
	}, [product])

	const fee = product ? feePercent(product.price, product.qp_price) : 0
	const total = product ? Number(product.qp_price) * quantity : 0

	const handleAddToCart = async () => {
		setAdding(true)
		const res = await shopApi.addToCart({ product_uuid: product.uuid, quantity })
		setAdding(false)
		if (res.success) {
			toast.success('Agregado al carrito', { description: `${quantity} × ${product.title.slice(0, 60)}` })
			navigation.navigate(ROUTES.ASSISTED_CART)
		} else {
			toast.error('Carrito', { description: res.error })
		}
	}

	if (!product) { return <View style={containerStyles.subContainer} /> }

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>

				{/* Gallery */}
				<View style={styles.mainImageWrap}>
					{selectedImage ? (
						<FastImage
							source={{ uri: selectedImage, priority: FastImage.priority.high }}
							style={styles.mainImage}
							resizeMode={FastImage.resizeMode.contain}
						/>
					) : (
						<FontAwesome6 name="image" size={40} color={theme.colors.secondaryText} iconStyle="solid" />
					)}
				</View>
				{gallery.length > 1 && (
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbsRow}>
						{gallery.map(img => (
							<Pressable
								key={img}
								onPress={() => setSelectedImage(img)}
								style={[styles.thumb, selectedImage === img && { borderColor: theme.colors.primary, borderWidth: 2 }]}
							>
								<FastImage source={{ uri: img }} style={styles.thumbImage} resizeMode={FastImage.resizeMode.contain} />
							</Pressable>
						))}
					</ScrollView>
				)}

				{/* Provider + title */}
				<View style={styles.providerRow}>
					<View style={[styles.providerPill, { backgroundColor: `${theme.colors.primary}1A` }]}>
						<Text style={[textStyles.caption, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium }]}>
							{providerLabel(product.provider)}
						</Text>
					</View>
					<Pressable style={styles.externalLink} onPress={() => Linking.openURL(product.url)}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Ver en {providerLabel(product.provider)}</Text>
						<FontAwesome6 name="arrow-up-right-from-square" size={11} color={theme.colors.secondaryText} iconStyle="solid" />
					</Pressable>
				</View>
				<Text style={[textStyles.h4, { fontWeight: '600', marginTop: 10, lineHeight: 24 }]}>
					{product.title}
				</Text>

				{/* Price */}
				<View style={styles.priceRow}>
					<Text style={[textStyles.h2, { color: theme.colors.primary, fontWeight: '700' }]}>
						{money(product.qp_price)}
					</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
						{fee > 0 ? `Incluye ${fee}% de comisión QvaPay` : 'Sin comisión QvaPay'}
					</Text>
				</View>
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
					El tax estatal se calcula en el checkout según la dirección de envío.
				</Text>

				{/* Quantity + total */}
				<View style={[styles.quantityCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}>
					<Text style={[textStyles.h6, { fontWeight: '600' }]}>Cantidad</Text>
					<View style={styles.stepper}>
						<Pressable
							style={[styles.stepperButton, { backgroundColor: theme.colors.background }, quantity <= 1 && { opacity: 0.4 }]}
							onPress={() => setQuantity(q => Math.max(1, q - 1))}
							disabled={quantity <= 1}
						>
							<FontAwesome6 name="minus" size={14} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
						<Text style={[textStyles.h5, { fontWeight: '600', minWidth: 28, textAlign: 'center' }]}>{quantity}</Text>
						<Pressable
							style={[styles.stepperButton, { backgroundColor: theme.colors.background }, quantity >= MAX_QUANTITY && { opacity: 0.4 }]}
							onPress={() => setQuantity(q => Math.min(MAX_QUANTITY, q + 1))}
							disabled={quantity >= MAX_QUANTITY}
						>
							<FontAwesome6 name="plus" size={14} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					</View>
				</View>

				{/* Description */}
				{!!product.description && (
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 14, lineHeight: 18 }]} numberOfLines={8}>
						{product.description}
					</Text>
				)}

				<QPButton
					title={`Agregar al carrito · ${money(total)}`}
					icon="basket-shopping"
					onPress={handleAddToCart}
					loading={adding}
					style={{ marginTop: 22 }}
				/>

			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	mainImageWrap: {
		height: 280,
		borderRadius: 16,
		backgroundColor: '#FFFFFF',
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
		marginTop: 10,
	},
	mainImage: {
		width: '100%',
		height: '100%',
	},
	thumbsRow: {
		gap: 8,
		marginTop: 10,
	},
	thumb: {
		width: 56,
		height: 56,
		borderRadius: 10,
		backgroundColor: '#FFFFFF',
		overflow: 'hidden',
	},
	thumbImage: {
		width: '100%',
		height: '100%',
	},
	providerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginTop: 16,
	},
	providerPill: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
	},
	externalLink: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 5,
	},
	priceRow: {
		flexDirection: 'row',
		alignItems: 'baseline',
		gap: 10,
		marginTop: 12,
	},
	quantityCard: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: 14,
		borderRadius: 14,
		marginTop: 16,
	},
	stepper: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
	},
	stepperButton: {
		width: 34,
		height: 34,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center',
	},
})

export default AssistedProduct
