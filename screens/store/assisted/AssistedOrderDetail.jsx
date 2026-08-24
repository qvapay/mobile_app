import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import useContentPadding from '../../../hooks/useContentPadding'
import FastImage from '@d11/react-native-fast-image'

// Toast
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// API
import { useAssistedOrderQuery } from './assistedQueries'

// i18n (call-time inside effects, so `t` stays out of the dep arrays)
import i18n from '../../../i18n'

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

	const { t } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding(30, 8)

	// Pedido en React Query (clave por id)
	const orderQuery = useAssistedOrderQuery(route.params?.id)
	const order = orderQuery.data || null
	const [refreshing, setRefreshing] = useState(false)

	useEffect(() => {
		if (orderQuery.isError && !orderQuery.data) {
			toast.error(i18n.t('assisted.orderDetail.toasts.errorTitle'), { description: orderQuery.error?.message })
		}
	}, [orderQuery.isError, orderQuery.data, orderQuery.error])

	const { refetch: fetchOrder } = orderQuery
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await fetchOrder() }
		catch { /* lo anterior sigue en pantalla */ }
		finally { setRefreshing(false) }
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
				contentContainerStyle={contentPadding}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>

				{/* Header */}
				<View style={themeStyles.container.rowBetween}>
					<View>
						<Text style={[textStyles.h4, { fontWeight: '600' }]}>{t('assisted.common.orderNumber', { id: order.id })}</Text>
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
									<FastImage source={{ uri: item.main_image }} style={themeStyles.container.fill} resizeMode={FastImage.resizeMode.contain} />
								) : null}
							</View>
							<View style={{ flex: 1, gap: 2 }}>
								<Text style={[textStyles.caption, { color: theme.colors.primaryText }]} numberOfLines={2}>{item.title}</Text>
								<Text style={[styles.meta, { color: theme.colors.secondaryText }]}>
									{t('assisted.orderDetail.itemMeta', { store: providerLabel(item.provider), count: item.count, amount: money(item.qp_price) })}
								</Text>
							</View>
							<Text style={[textStyles.h6, { fontWeight: '600' }]}>{money(item.qp_price * item.count)}</Text>
						</View>
					))}
				</View>

				{/* Totals */}
				<View style={[...cardStyle, { marginTop: 12 }]}>
					<Text style={[textStyles.h6, { fontWeight: '600', marginBottom: 10 }]}>{t('assisted.common.summary')}</Text>
					<View style={styles.summaryRow}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('assisted.common.subtotal')}</Text>
						<Text style={[textStyles.h6, { fontWeight: '500' }]}>{money(order.subtotal)}</Text>
					</View>
					<View style={styles.summaryRow}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('assisted.orderDetail.tax')}</Text>
						<Text style={[textStyles.h6, { fontWeight: '500' }]}>{money(order.tax)}</Text>
					</View>
					<View style={[styles.summaryRow, styles.totalRow, { borderTopColor: `${theme.colors.secondaryText}33` }]}>
						<Text style={[textStyles.h6, { fontWeight: '600' }]}>{t('assisted.orderDetail.totalPaid')}</Text>
						<Text style={[textStyles.h5, { fontWeight: '600', color: theme.colors.primary }]}>{money(order.total)}</Text>
					</View>
				</View>

				{/* Fulfillment */}
				<View style={[...cardStyle, { marginTop: 12 }]}>
					<Text style={[textStyles.h6, { fontWeight: '600', marginBottom: 10 }]}>{t('assisted.orderDetail.fulfillment')}</Text>
					<View style={styles.summaryRow}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('assisted.orderDetail.storeOrder')}</Text>
						<Text style={[textStyles.h6, { fontWeight: '500' }]}>{order.store_id || '—'}</Text>
					</View>
					<View style={styles.summaryRow}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('assisted.orderDetail.trackingLabel')}</Text>
						<Text style={[textStyles.h6, { fontWeight: '500' }]} numberOfLines={1}>{order.tracking_code || '—'}</Text>
					</View>
				</View>

				{/* Shipping address */}
				<View style={[...cardStyle, { marginTop: 12 }]}>
					<Text style={[textStyles.h6, { fontWeight: '600', marginBottom: 10 }]}>{t('assisted.common.shippingAddress')}</Text>
					{address ? (
						<View style={{ gap: 2 }}>
							{!!address.recipient_name && <Text style={[textStyles.h6, { fontWeight: '500' }]}>{address.recipient_name}</Text>}
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
								{address.line1}{address.line2 ? `, ${address.line2}` : ''}
							</Text>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
								{address.city}, {address.state} {address.postal_code} · {address.country}
							</Text>
							{!!address.phone && <Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{t('assisted.orderDetail.phone', { phone: address.phone })}</Text>}
						</View>
					) : (
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('assisted.orderDetail.noAddress')}</Text>
					)}
				</View>

			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
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
