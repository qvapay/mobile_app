import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import FastImage from '@d11/react-native-fast-image'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Routes & API
import { ROUTES } from '../../../routes'
import { shopApi } from '../../../api/shopApi'

// Helpers
import { getShortDateTime } from '../../../helpers'
import { money } from './assistedConstants'
import FulfillmentBadge from './FulfillmentBadge'

/**
 * List of the user's paid assisted-shopping orders with fulfillment status
 * (Confirmado / En camino / Entregado / Cancelado) and tracking hint.
 */
const AssistedOrders = ({ navigation }) => {

	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	const [orders, setOrders] = useState(null)
	const [refreshing, setRefreshing] = useState(false)

	const fetchOrders = useCallback(async () => {
		const res = await shopApi.getOrders()
		if (res.success) setOrders(res.data?.orders || [])
		else {
			setOrders([])
			toast.error('Mis pedidos', { description: res.error })
		}
	}, [])

	useEffect(() => {
		navigation.addListener('focus', fetchOrders)
		return () => navigation.removeListener('focus', fetchOrders)
	}, [navigation, fetchOrders])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchOrders()
		setRefreshing(false)
	}, [fetchOrders])

	const renderItem = ({ item }) => {

		const firstImage = item.items?.find(i => i.main_image)?.main_image
		const titles = (item.items || []).map(i => i.title.split(' ').slice(0, 5).join(' ')).join(', ')

		return (
			<Pressable
				style={[styles.orderCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}
				onPress={() => navigation.navigate(ROUTES.ASSISTED_ORDER_DETAIL, { id: item.id })}
			>
				<View style={styles.thumbWrap}>
					{firstImage ? (
						<FastImage source={{ uri: firstImage }} style={styles.thumb} resizeMode={FastImage.resizeMode.contain} />
					) : (
						<FontAwesome6 name="box-open" size={18} color={theme.colors.secondaryText} iconStyle="solid" />
					)}
				</View>
				<View style={{ flex: 1, gap: 3 }}>
					<View style={styles.titleRow}>
						<Text style={[textStyles.h6, { fontWeight: '600' }]}>Pedido #{item.id}</Text>
						<FulfillmentBadge status={item.status} />
					</View>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]} numberOfLines={1}>
						{titles || `${item.item_count} producto${item.item_count === 1 ? '' : 's'}`}
					</Text>
					{item.tracking_code ? (
						<Text style={[styles.tracking, { color: theme.colors.secondaryText }]} numberOfLines={1}>
							Tracking: {item.tracking_code}
						</Text>
					) : null}
				</View>
				<View style={{ alignItems: 'flex-end', gap: 3 }}>
					<Text style={[textStyles.h6, { fontWeight: '600' }]}>{money(item.total)}</Text>
					<Text style={[styles.tracking, { color: theme.colors.tertiaryText }]}>{getShortDateTime(item.created_at)}</Text>
				</View>
			</Pressable>
		)
	}

	if (orders === null) { return <View style={containerStyles.subContainer} /> }

	if (orders.length === 0) {
		return (
			<View style={[containerStyles.subContainer, styles.emptyContainer]}>
				<View style={[styles.emptyIcon, { backgroundColor: `${theme.colors.primary}1A` }]}>
					<FontAwesome6 name="clipboard-list" size={26} color={theme.colors.primary} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h5, { fontWeight: '600', marginTop: 16 }]}>Aún no tienes pedidos</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 6, textAlign: 'center' }]}>
					Cuando hagas tu primera compra asistida aparecerá aquí.
				</Text>
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<FlashList
				data={orders}
				keyExtractor={(item) => String(item.id)}
				renderItem={renderItem}
				contentContainerStyle={styles.listContent}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	listContent: {
		paddingVertical: 8,
	},
	orderCard: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 14,
		gap: 12,
		marginBottom: 8,
	},
	thumbWrap: {
		width: 48,
		height: 48,
		borderRadius: 10,
		backgroundColor: '#FFFFFF',
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
	thumb: {
		width: '100%',
		height: '100%',
	},
	titleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	tracking: {
		fontSize: 11,
	},
	emptyContainer: {
		justifyContent: 'center',
		alignItems: 'center',
	},
	emptyIcon: {
		width: 60,
		height: 60,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
})

export default AssistedOrders
