import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

// Theme Context
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import QPLoader from '../../../ui/particles/QPLoader'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Routes & API
import { ROUTES } from '../../../routes'
import { marketApi } from '../../../api/marketApi'

// Helpers
import { getShortDateTime } from '../../../helpers'
import { mediaUrl } from '../../../helpers/mediaUrl'
import { MARKET_ORDER_STATUS } from './marketConstants'

// Stale-while-revalidate cache (first page only)
import { CACHE_KEYS, readCache, writeCache } from '../../../helpers/dataCache'

import { toast } from 'sonner-native'

const PAGE_SIZE = 20

/**
 * The user's marketplace purchases as buyer (`GET /market/orders`), newest
 * first with infinite scroll and pull-to-refresh. The first page is
 * SWR-cached; each row navigates to MarketOrderDetail carrying the full
 * order (there is no per-order fetch — the row already has everything).
 */
const MarketOrders = ({ navigation }) => {

	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	const [orders, setOrders] = useState([])
	const [total, setTotal] = useState(null)
	const [page, setPage] = useState(1)
	const [loading, setLoading] = useState(true)
	const [loadingMore, setLoadingMore] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const hasFresh = useRef(false)

	// Cold-start hydration (first page)
	useEffect(() => {
		readCache(CACHE_KEYS.MARKET_ORDERS).then(cached => {
			if (!cached?.length || hasFresh.current) return
			setOrders(cached)
			setLoading(false)
		})
	}, [])

	const fetchFirstPage = useCallback(async () => {
		const res = await marketApi.getOrders({ page: 1, take: PAGE_SIZE })
		if (res.success) {
			hasFresh.current = true
			const list = res.data?.orders || []
			setOrders(list)
			setTotal(res.data?.total ?? null)
			setPage(1)
			writeCache(CACHE_KEYS.MARKET_ORDERS, list)
		} else if (!orders.length) {
			toast.error('Compras', { description: res.error })
		}
		setLoading(false)
	}, [orders.length])

	useEffect(() => { fetchFirstPage() }, []) // eslint-disable-line react-hooks/exhaustive-deps

	const loadMore = useCallback(async () => {
		if (loadingMore || total == null || orders.length >= total) return
		setLoadingMore(true)
		const nextPage = page + 1
		const res = await marketApi.getOrders({ page: nextPage, take: PAGE_SIZE })
		if (res.success) {
			const fresh = (res.data?.orders || []).filter(o => !orders.some(x => x.uuid === o.uuid))
			setOrders(prev => [...prev, ...fresh])
			setPage(nextPage)
		}
		setLoadingMore(false)
	}, [loadingMore, total, orders, page])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchFirstPage()
		setRefreshing(false)
	}, [fetchFirstPage])

	const renderItem = ({ item }) => {
		const status = MARKET_ORDER_STATUS[item.status] || { label: item.status, color: 'placeholder' }
		const image = mediaUrl(item.product?.main_image)
		return (
			<Pressable
				onPress={() => navigation.navigate(ROUTES.MARKET_ORDER_DETAIL, { order: item })}
				style={[styles.row, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
			>
				<View style={[styles.image, { backgroundColor: theme.colors.elevationLight }]}>
					{image && <FastImage source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode={FastImage.resizeMode.cover} />}
				</View>
				<View style={{ flex: 1 }}>
					<Text style={[textStyles.h6, { fontWeight: '500' }]} numberOfLines={1}>{item.product?.title || 'Producto'}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]} numberOfLines={1}>
						{[item.shop?.name, getShortDateTime(item.created_at)].filter(Boolean).join(' · ')}
					</Text>
					<Text style={[textStyles.caption, { color: theme.colors[status.color] || theme.colors.secondaryText, marginTop: 3, fontWeight: '600' }]}>
						{status.label}{item.tracking_code ? ` · ${item.tracking_code}` : ''}
					</Text>
				</View>
				<View style={styles.right}>
					<Text style={[textStyles.h6, { fontWeight: '600' }]}>${Number(item.total).toFixed(2)}</Text>
					{item.quantity > 1 && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>x{item.quantity}</Text>
					)}
				</View>
			</Pressable>
		)
	}

	if (loading) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			{orders.length === 0 ? (
				<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
					<Text style={{ fontSize: 44 }}>🛍️</Text>
					<Text style={[textStyles.h5, { fontWeight: '600', marginTop: 12 }]}>Aún no has comprado nada</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4, textAlign: 'center' }]}>
						Tus compras en las tiendas de la comunidad aparecerán aquí.
					</Text>
				</View>
			) : (
				<FlatList
					data={orders}
					keyExtractor={(item) => item.uuid}
					renderItem={renderItem}
					contentContainerStyle={{ paddingVertical: 8, gap: 8 }}
					showsVerticalScrollIndicator={false}
					refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
					onEndReached={loadMore}
					onEndReachedThreshold={0.4}
					ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 16, alignItems: 'center' }}><QPLoader /></View> : null}
				/>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 12,
		borderRadius: 14,
	},
	image: {
		width: 52,
		height: 52,
		borderRadius: 12,
		overflow: 'hidden',
	},
	right: {
		alignItems: 'flex-end',
		gap: 2,
	},
})

export default MarketOrders
