import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FastImage from '@d11/react-native-fast-image'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Routes & API
import { ROUTES } from '../../../routes'
import { shopApi } from '../../../api/shopApi'

// Constants
import { STORES, money, providerLabel } from './assistedConstants'

/**
 * Assisted-shopping landing: paste a store product URL and the fulfillment
 * team buys it for you with your QvaPay balance. Shows available stores
 * (Amazon, eBay) and coming-soon ones, quick access to cart/orders and a
 * shelf of recently searched products.
 */
const AssistedShopping = ({ navigation }) => {

	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { width } = useWindowDimensions()
	const numColumns = width >= 600 ? 3 : 2

	const [url, setUrl] = useState('')
	const [searching, setSearching] = useState(false)
	const [cartCount, setCartCount] = useState(0)
	const [recent, setRecent] = useState([])
	const [refreshing, setRefreshing] = useState(false)

	const fetchData = useCallback(async () => {
		const [cartRes, recentRes] = await Promise.all([
			shopApi.getCart(),
			shopApi.getRecentProducts(),
		])
		if (cartRes.success) setCartCount(cartRes.data?.cart?.item_count || 0)
		if (recentRes.success) setRecent(recentRes.data?.products || [])
	}, [])

	// Refresh the cart badge every time the screen regains focus (items are
	// added/removed from deeper screens in this same stack).
	useEffect(() => navigation.addListener('focus', fetchData), [navigation, fetchData])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchData()
		setRefreshing(false)
	}, [fetchData])

	const handleSearch = async () => {
		const trimmed = url.trim()
		if (!trimmed) {
			toast.error('Compras asistidas', { description: 'Pega el enlace del producto que quieres comprar' })
			return
		}
		setSearching(true)
		const res = await shopApi.parseProductUrl(trimmed)
		setSearching(false)
		if (res.success && res.data?.product) {
			setUrl('')
			navigation.navigate(ROUTES.ASSISTED_PRODUCT, { product: res.data.product })
		} else {
			toast.error('Compras asistidas', { description: res.error })
		}
	}

	const cardWidth = (width - 32 - (numColumns - 1) * 10) / numColumns

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
				keyboardShouldPersistTaps="handled"
			>

				{/* Hero */}
				<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '600', marginTop: 12 }]}>
					Pega el enlace y lo compramos por ti
				</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 6, lineHeight: 18 }]}>
					Te traemos los datos del producto en vivo, pagas con tu balance y nosotros lo compramos y enviamos a tu dirección en Estados Unidos.
				</Text>

				{/* URL search */}
				<View style={{ marginTop: 16 }}>
					<QPInput
						prefixIconName="link"
						placeholder="https://www.amazon.com/dp/…"
						value={url}
						onChangeText={setUrl}
						autoCapitalize="none"
						autoCorrect={false}
						keyboardType="url"
						returnKeyType="search"
						onSubmitEditing={handleSearch}
					/>
					<QPButton
						title="Buscar producto"
						icon="magnifying-glass"
						onPress={handleSearch}
						loading={searching}
						style={{ marginTop: 10 }}
					/>
				</View>

				{/* Stores */}
				<View style={styles.storesRow}>
					{STORES.map(store => (
						<View
							key={store.key}
							style={[
								styles.storeChip,
								{ backgroundColor: theme.colors.surface },
								theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight },
								!store.available && { opacity: 0.55 },
							]}
						>
							{store.icon && (
								<FontAwesome6 name={store.icon} size={14} color={theme.colors.primaryText} iconStyle="brand" />
							)}
							<Text style={[textStyles.caption, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium }]}>
								{store.label}
							</Text>
							{!store.available && (
								<Text style={[styles.soonTag, { color: theme.colors.warning, fontFamily: theme.typography.fontFamily.medium }]}>
									Pronto
								</Text>
							)}
						</View>
					))}
				</View>

				{/* Cart & Orders shortcuts */}
				<View style={styles.shortcutsRow}>
					<Pressable
						style={[styles.shortcutCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}
						onPress={() => navigation.navigate(ROUTES.ASSISTED_CART)}
					>
						<View style={[styles.shortcutIcon, { backgroundColor: `${theme.colors.primary}1A` }]}>
							<FontAwesome6 name="basket-shopping" size={16} color={theme.colors.primary} iconStyle="solid" />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[textStyles.h6, { fontWeight: '600' }]}>Mi carrito</Text>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]} numberOfLines={1}>
								{cartCount > 0 ? `${cartCount} producto${cartCount === 1 ? '' : 's'}` : 'Vacío por ahora'}
							</Text>
						</View>
						{cartCount > 0 && (
							<View style={[styles.countBadge, { backgroundColor: theme.colors.primary }]}>
								<Text style={[styles.countBadgeText, { fontFamily: theme.typography.fontFamily.medium }]}>{cartCount}</Text>
							</View>
						)}
					</Pressable>

					<Pressable
						style={[styles.shortcutCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}
						onPress={() => navigation.navigate(ROUTES.ASSISTED_ORDERS)}
					>
						<View style={[styles.shortcutIcon, { backgroundColor: `${theme.colors.primary}1A` }]}>
							<FontAwesome6 name="clipboard-list" size={16} color={theme.colors.primary} iconStyle="solid" />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[textStyles.h6, { fontWeight: '600' }]}>Mis pedidos</Text>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]} numberOfLines={1}>Historial y tracking</Text>
						</View>
					</Pressable>
				</View>

				{/* Recently searched */}
				{recent.length > 0 && (
					<View style={{ marginTop: 24 }}>
						<Text style={[textStyles.h5, { fontWeight: '600', marginBottom: 10 }]}>Buscados recientemente</Text>
						<View style={styles.recentGrid}>
							{recent.map(product => (
								<Pressable
									key={product.uuid}
									style={[styles.productCard, { width: cardWidth, backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}
									onPress={() => navigation.navigate(ROUTES.ASSISTED_PRODUCT, { uuid: product.uuid })}
								>
									<View style={styles.productImageWrap}>
										{product.main_image ? (
											<FastImage
												source={{ uri: product.main_image, priority: FastImage.priority.normal }}
												style={styles.productImage}
												resizeMode={FastImage.resizeMode.contain}
											/>
										) : (
											<FontAwesome6 name="image" size={24} color={theme.colors.secondaryText} iconStyle="solid" />
										)}
									</View>
									<Text style={[textStyles.caption, { color: theme.colors.primaryText }]} numberOfLines={2}>
										{product.title}
									</Text>
									<View style={styles.productFooter}>
										<Text style={[textStyles.h6, { fontWeight: '600', color: theme.colors.primary }]}>
											{money(product.qp_price)}
										</Text>
										<Text style={[styles.providerTag, { color: theme.colors.secondaryText }]}>
											{providerLabel(product.provider)}
										</Text>
									</View>
								</Pressable>
							))}
						</View>
					</View>
				)}

				{/* Fine print */}
				<Text style={[styles.finePrint, { color: theme.colors.tertiaryText }]}>
					Solo envíos dentro de Estados Unidos · Mínimo de compra $20 USD · Tax estatal según destino · Comisión QvaPay: 0% Amazon · 1% eBay
				</Text>

			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	storesRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		marginTop: 18,
	},
	storeChip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
	},
	soonTag: {
		fontSize: 10,
	},
	shortcutsRow: {
		flexDirection: 'row',
		gap: 10,
		marginTop: 18,
	},
	shortcutCard: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		padding: 12,
		borderRadius: 14,
	},
	shortcutIcon: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center',
	},
	countBadge: {
		minWidth: 22,
		height: 22,
		borderRadius: 11,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 6,
	},
	countBadgeText: {
		color: '#FFFFFF',
		fontSize: 12,
	},
	recentGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
	},
	productCard: {
		borderRadius: 14,
		padding: 10,
		gap: 8,
	},
	productImageWrap: {
		height: 110,
		borderRadius: 10,
		backgroundColor: '#FFFFFF',
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
	},
	productImage: {
		width: '100%',
		height: '100%',
	},
	productFooter: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	providerTag: {
		fontSize: 11,
	},
	finePrint: {
		fontSize: 11,
		lineHeight: 16,
		textAlign: 'center',
		marginTop: 26,
	},
})

export default AssistedShopping
