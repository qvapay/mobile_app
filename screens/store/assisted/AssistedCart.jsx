import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import useContentPadding from '../../../hooks/useContentPadding'
import FastImage from '@d11/react-native-fast-image'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Routes & API
import { ROUTES } from '../../../routes'
import { shopApi } from '../../../api/shopApi'
import { useAssistedCartQuery } from './assistedQueries'

// Constants
import { money, providerLabel, MINIMUM_CART } from './assistedConstants'

/**
 * Assisted-shopping cart. Quantity is encoded server-side by repetition, so
 * the +/- steppers add/remove one occurrence per tap. Checkout unlocks at the
 * backend-enforced $20 minimum.
 */
const AssistedCart = ({ navigation }) => {

	const { theme, styles: themeStyles } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding(30, 8)

	// Carrito en React Query (meta.noPersist: estado vivo, no snapshot); las
	// mutaciones de abajo refetchean tras confirmar
	const cartQuery = useAssistedCartQuery()
	const cart = cartQuery.data || null
	const { refetch: fetchCart } = cartQuery
	const [refreshing, setRefreshing] = useState(false)
	const [mutatingUuid, setMutatingUuid] = useState(null)

	useEffect(() => {
		if (cartQuery.isError && !cartQuery.data) {
			toast.error('Carrito', { description: cartQuery.error?.message })
		}
	}, [cartQuery.isError, cartQuery.data, cartQuery.error])

	// Refetch on focus — items get added from the product screen.
	useEffect(() => {
		const listener = () => { fetchCart() }
		navigation.addListener('focus', listener)
		return () => navigation.removeListener('focus', listener)
	}, [navigation, fetchCart])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await fetchCart() }
		catch { /* lo anterior sigue en pantalla */ }
		finally { setRefreshing(false) }
	}, [fetchCart])

	const changeQuantity = async (item, delta) => {
		setMutatingUuid(item.uuid)
		const res = delta > 0
			? await shopApi.addToCart({ product_uuid: item.uuid, quantity: 1 })
			: await shopApi.removeFromCart(item.uuid)
		setMutatingUuid(null)
		if (res.success) await fetchCart()
		else toast.error('Carrito', { description: res.error })
	}

	const removeItem = async (item) => {
		setMutatingUuid(item.uuid)
		// Quantity is encoded by repetition — drop every occurrence.
		for (let i = 0; i < item.count; i++) {
			const res = await shopApi.removeFromCart(item.uuid)
			if (!res.success) {
				toast.error('Carrito', { description: res.error })
				break
			}
		}
		setMutatingUuid(null)
		await fetchCart()
	}

	if (!cart) { return <View style={containerStyles.subContainer} /> }

	const items = cart.products || []
	const subtotal = Number(cart.subtotal || 0)
	const meetsMinimum = subtotal >= MINIMUM_CART

	if (items.length === 0) {
		return (
			<View style={[containerStyles.subContainer, styles.emptyContainer]}>
				<View style={[styles.emptyIcon, { backgroundColor: `${theme.colors.primary}1A` }]}>
					<FontAwesome6 name="basket-shopping" size={28} color={theme.colors.primary} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h5, { fontWeight: '600', marginTop: 16 }]}>Tu carrito está vacío</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 6, textAlign: 'center' }]}>
					Pega el enlace de un producto de Amazon o eBay para empezar.
				</Text>
				<QPButton
					title="Buscar productos"
					icon="magnifying-glass"
					onPress={() => navigation.navigate(ROUTES.ASSISTED_SHOPPING)}
					style={{ marginTop: 22, alignSelf: 'stretch' }}
				/>
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={contentPadding}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>
				<View style={{ gap: 10 }}>
					{items.map(item => {
						const busy = mutatingUuid === item.uuid
						return (
							<View
								key={item.uuid}
								style={[styles.itemCard, { backgroundColor: theme.colors.surface, opacity: busy ? 0.6 : 1 }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}
							>
								<View style={styles.itemImageWrap}>
									{item.main_image ? (
										<FastImage source={{ uri: item.main_image }} style={themeStyles.container.fill} resizeMode={FastImage.resizeMode.contain} />
									) : null}
								</View>
								<View style={{ flex: 1, gap: 4 }}>
									<Text style={[textStyles.caption, { color: theme.colors.primaryText }]} numberOfLines={2}>{item.title}</Text>
									<Text style={[styles.itemMeta, { color: theme.colors.secondaryText }]}>
										{providerLabel(item.provider)} · {money(item.qp_price)} c/u
									</Text>
									<View style={styles.itemActions}>
										<View style={styles.stepper}>
											<Pressable
												style={[styles.stepperButton, { backgroundColor: theme.colors.background }]}
												onPress={() => changeQuantity(item, -1)}
												disabled={busy}
											>
												<FontAwesome6 name="minus" size={11} color={theme.colors.primaryText} iconStyle="solid" />
											</Pressable>
											<Text style={[textStyles.h6, { fontWeight: '600', minWidth: 20, textAlign: 'center' }]}>{item.count}</Text>
											<Pressable
												style={[styles.stepperButton, { backgroundColor: theme.colors.background }]}
												onPress={() => changeQuantity(item, 1)}
												disabled={busy}
											>
												<FontAwesome6 name="plus" size={11} color={theme.colors.primaryText} iconStyle="solid" />
											</Pressable>
										</View>
										<Text style={[textStyles.h6, { fontWeight: '600' }]}>{money(item.qp_price * item.count)}</Text>
									</View>
								</View>
								<Pressable style={styles.trashButton} onPress={() => removeItem(item)} disabled={busy}>
									<FontAwesome6 name="trash-can" size={15} color={theme.colors.danger} iconStyle="solid" />
								</Pressable>
							</View>
						)
					})}
				</View>

				{/* Summary */}
				<View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}>
					<View style={themeStyles.container.rowBetween}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Subtotal</Text>
						<Text style={[textStyles.h5, { fontWeight: '600' }]}>{money(subtotal)}</Text>
					</View>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 4 }]}>
						El tax estatal se agrega en el checkout según tu dirección.
					</Text>
					{!meetsMinimum && (
						<Text style={[textStyles.caption, { color: theme.colors.warning, marginTop: 6 }]}>
							El mínimo de compra es {money(MINIMUM_CART)} — te faltan {money(MINIMUM_CART - subtotal)}.
						</Text>
					)}
				</View>

				<QPButton
					title="Continuar al checkout"
					icon="arrow-right"
					onPress={() => navigation.navigate(ROUTES.ASSISTED_CHECKOUT)}
					disabled={!meetsMinimum}
					style={{ marginTop: 16 }}
				/>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	emptyContainer: {
		justifyContent: 'center',
		alignItems: 'center',
	},
	emptyIcon: {
		width: 64,
		height: 64,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
	},
	itemCard: {
		flexDirection: 'row',
		padding: 12,
		borderRadius: 14,
		gap: 12,
	},
	itemImageWrap: {
		width: 64,
		height: 64,
		borderRadius: 10,
		backgroundColor: '#FFFFFF',
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
	itemMeta: {
		fontSize: 11,
	},
	itemActions: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginTop: 4,
	},
	stepper: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	stepperButton: {
		width: 26,
		height: 26,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	trashButton: {
		padding: 4,
		alignSelf: 'flex-start',
	},
	summaryCard: {
		padding: 14,
		borderRadius: 14,
		marginTop: 16,
	},
})

export default AssistedCart
