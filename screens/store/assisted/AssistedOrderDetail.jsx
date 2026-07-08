import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FastImage from '@d11/react-native-fast-image'

// Toast
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// API
import { shopApi } from '../../../api/shopApi'

// Helpers
import { getShortDateTime } from '../../../helpers'
import { money, providerLabel } from './assistedConstants'
import FulfillmentBadge from './FulfillmentBadge'

/**
 * Assisted-shopping order detail: items, totals (subtotal / tax / total paid),
 * shipping address snapshot and fulfillment info (store order + tracking).
 * Route params: `{ id }` — the cart/order id.
 */
const AssistedOrderDetail = ({ route }) => {

	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	const [order, setOrder] = useState(null)
	const [refreshing, setRefreshing] = useState(false)

	const fetchOrder = useCallback(async () => {
		const res = await shopApi.getOrder(route.params?.id)
		if (res.success) setOrder(res.data?.order || null)
		else toast.error('Pedido', { description: res.error })
	}, [route.params?.id])

	useEffect(() => { fetchOrder() }, [fetchOrder])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchOrder()
		setRefreshing(false)
	}, [fetchOrder])

	if (!order) { return <View style={containerStyles.subContainer} /> }

	const address = order.shipping_address
	const cardStyle = [
		styles.card,
		{ backgroundColor: theme.colors.surface },
		theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight },
	]

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 30, paddingTop: 8 }}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>

				{/* Header */}
				<View style={styles.headerRow}>
					<View>
						<Text style={[textStyles.h4, { fontWeight: '600' }]}>Pedido #{order.id}</Text>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]}>
							{getShortDateTime(order.created_at)}
						</Text>
					</View>
					<FulfillmentBadge status={order.status} />
				</View>

				{/* Items */}
				<View style={[...cardStyle, { marginTop: 16 }]}>
					{order.items.map((item, index) => (
						<View key={item.uuid} style={[styles.itemRow, index > 0 && { borderTopWidth: 1, borderTopColor: `${theme.colors.secondaryText}22` }]}>
							<View style={styles.itemImageWrap}>
								{item.main_image ? (
									<FastImage source={{ uri: item.main_image }} style={styles.itemImage} resizeMode={FastImage.resizeMode.contain} />
								) : null}
							</View>
							<View style={{ flex: 1, gap: 2 }}>
								<Text style={[textStyles.caption, { color: theme.colors.primaryText }]} numberOfLines={2}>{item.title}</Text>
								<Text style={[styles.meta, { color: theme.colors.secondaryText }]}>
									{providerLabel(item.provider)} · × {item.count} · {money(item.qp_price)} c/u
								</Text>
							</View>
							<Text style={[textStyles.h6, { fontWeight: '600' }]}>{money(item.qp_price * item.count)}</Text>
						</View>
					))}
				</View>

				{/* Totals */}
				<View style={[...cardStyle, { marginTop: 12 }]}>
					<Text style={[textStyles.h6, { fontWeight: '600', marginBottom: 10 }]}>Resumen</Text>
					<View style={styles.summaryRow}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Subtotal</Text>
						<Text style={[textStyles.h6, { fontWeight: '500' }]}>{money(order.subtotal)}</Text>
					</View>
					<View style={styles.summaryRow}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Tax</Text>
						<Text style={[textStyles.h6, { fontWeight: '500' }]}>{money(order.tax)}</Text>
					</View>
					<View style={[styles.summaryRow, styles.totalRow, { borderTopColor: `${theme.colors.secondaryText}33` }]}>
						<Text style={[textStyles.h6, { fontWeight: '600' }]}>Total pagado</Text>
						<Text style={[textStyles.h5, { fontWeight: '600', color: theme.colors.primary }]}>{money(order.total)}</Text>
					</View>
				</View>

				{/* Fulfillment */}
				<View style={[...cardStyle, { marginTop: 12 }]}>
					<Text style={[textStyles.h6, { fontWeight: '600', marginBottom: 10 }]}>Seguimiento</Text>
					<View style={styles.summaryRow}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Orden en tienda</Text>
						<Text style={[textStyles.h6, { fontWeight: '500' }]}>{order.store_id || '—'}</Text>
					</View>
					<View style={styles.summaryRow}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Tracking</Text>
						<Text style={[textStyles.h6, { fontWeight: '500' }]} numberOfLines={1}>{order.tracking_code || '—'}</Text>
					</View>
				</View>

				{/* Shipping address */}
				<View style={[...cardStyle, { marginTop: 12 }]}>
					<Text style={[textStyles.h6, { fontWeight: '600', marginBottom: 10 }]}>Dirección de envío</Text>
					{address ? (
						<View style={{ gap: 2 }}>
							{!!address.recipient_name && <Text style={[textStyles.h6, { fontWeight: '500' }]}>{address.recipient_name}</Text>}
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
								{address.line1}{address.line2 ? `, ${address.line2}` : ''}
							</Text>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
								{address.city}, {address.state} {address.postal_code} · {address.country}
							</Text>
							{!!address.phone && <Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>Tel: {address.phone}</Text>}
						</View>
					) : (
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Sin dirección registrada</Text>
					)}
				</View>

			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	headerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	card: {
		padding: 14,
		borderRadius: 14,
	},
	itemRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingVertical: 10,
	},
	itemImageWrap: {
		width: 52,
		height: 52,
		borderRadius: 10,
		backgroundColor: '#FFFFFF',
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
	itemImage: {
		width: '100%',
		height: '100%',
	},
	meta: {
		fontSize: 11,
	},
	summaryRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 6,
	},
	totalRow: {
		borderTopWidth: 1,
		paddingTop: 8,
		marginTop: 4,
		marginBottom: 0,
	},
})

export default AssistedOrderDetail
