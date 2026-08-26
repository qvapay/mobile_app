import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { useTranslation } from 'react-i18next'
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
import { useAssistedOrdersQuery } from './assistedQueries'

// i18n (call-time inside effects, so `t` stays out of the dep arrays)
import i18n from '../../../i18n'

// Helpers
import { getShortDateTime } from '../../../helpers'
import { money } from './assistedConstants'
import FulfillmentBadge from './FulfillmentBadge'

// Types
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { Theme } from '../../../theme/ThemeContext'
import type { AssistedOrder } from './assistedConstants'

type Props = NativeStackScreenProps<RootStackParamList, 'AssistedOrders'>

/**
 * List of the user's paid assisted-shopping orders with localized fulfillment
 * status (paid / purchased / delivered / cancelled) and tracking hint.
 */
const AssistedOrders = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	// Pedidos en React Query; el foco revalida (los pedidos nacen en Checkout,
	// más profundo en este mismo stack)
	const ordersQuery = useAssistedOrdersQuery()
	const { refetch: fetchOrders } = ordersQuery
	const orders = ordersQuery.data ?? (ordersQuery.isError ? [] : null)
	const [refreshing, setRefreshing] = useState(false)

	useEffect(() => {
		if (ordersQuery.isError && !ordersQuery.data) {
			toast.error(i18n.t('assisted.orders.toasts.errorTitle'), { description: ordersQuery.error?.message })
		}
	}, [ordersQuery.isError, ordersQuery.data, ordersQuery.error])

	useEffect(() => {
		const listener = () => { fetchOrders() }
		navigation.addListener('focus', listener)
		return () => navigation.removeListener('focus', listener)
	}, [navigation, fetchOrders])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await fetchOrders() }
		catch { /* lo anterior sigue en pantalla */ }
		finally { setRefreshing(false) }
	}, [fetchOrders])

	const renderItem = ({ item }: { item: AssistedOrder }) => {

		const firstImage = item.items?.find(i => i.main_image)?.main_image
		const titles = (item.items || []).map(i => i.title.split(' ').slice(0, 5).join(' ')).join(', ')

		return (
			<Pressable
				style={[styles.orderCard, { backgroundColor: theme.colors.surface }, (theme as Theme & { mode?: string }).mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}
				onPress={() => navigation.navigate(ROUTES.ASSISTED_ORDER_DETAIL, { id: item.id })}
			>
				<View style={styles.thumbWrap}>
					{firstImage ? (
						<FastImage source={{ uri: firstImage }} style={containerStyles.fill} resizeMode={FastImage.resizeMode.contain} />
					) : (
						<FontAwesome6 name="box-open" size={18} color={theme.colors.secondaryText} iconStyle="solid" />
					)}
				</View>
				<View style={{ flex: 1, gap: 3 }}>
					<View style={styles.titleRow}>
						<Text style={[textStyles.h6, { fontWeight: '600' }]}>{t('assisted.common.orderNumber', { id: item.id })}</Text>
						<FulfillmentBadge status={item.status} />
					</View>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]} numberOfLines={1}>
						{titles || t('assisted.common.products', { count: item.item_count })}
					</Text>
					{item.tracking_code ? (
						<Text style={[styles.tracking, { color: theme.colors.secondaryText }]} numberOfLines={1}>
							{t('assisted.orders.tracking', { code: item.tracking_code })}
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
				<Text style={[textStyles.h5, { fontWeight: '600', marginTop: 16 }]}>{t('assisted.orders.emptyTitle')}</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 6, textAlign: 'center' }]}>
					{t('assisted.orders.emptySubtitle')}
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
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
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
