import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import FastImage from '@d11/react-native-fast-image'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import type { ListRenderItemInfo, RefreshControlProps } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// Theme Context
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import QPLoader from '../../../ui/particles/QPLoader'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Routes & Data
import { ROUTES } from '../../../routes'
import { useMarketOrdersInfiniteQuery, flattenOrders } from './marketQueries'
import { trimToFirstPage } from '../../../api/queryUtils'

// Helpers
import { getShortDateTime } from '../../../helpers'
import { mediaUrl } from '../../../helpers/mediaUrl'
import { MARKET_ORDER_STATUS } from './marketConstants'

import { toast } from 'sonner-native'

import type { Theme } from '../../../theme/ThemeContext'
import type { RootStackParamList } from '../../../types/navigation'
import type { MarketOrder } from './marketQueries'

// OJO: `theme.mode` no existe en el tema (siempre undefined) — bug de runtime
// pre-existente que se preserva tal cual; el alias es solo de tipos.
type ThemeWithMode = Theme & { mode?: string }

/**
 * The user's marketplace purchases as buyer (`GET /market/orders`), newest
 * first with infinite scroll and pull-to-refresh. Los datos viven en React
 * Query (query infinita persistida con su primera página); each row navigates
 * to MarketOrderDetail carrying the full order (there is no per-order fetch —
 * the row already has everything).
 */
const MarketOrders = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'MarketOrders'>) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	const queryClient = useQueryClient()
	const [refreshing, setRefreshing] = useState(false)

	const query = useMarketOrdersInfiniteQuery()
	const { hasNextPage, isFetching, fetchNextPage, refetch } = query

	const orders = useMemo(() => flattenOrders(query.data?.pages), [query.data])
	const loading = query.isPending
	const loadingMore = query.isFetchingNextPage

	// El toast solo cuando no hay NADA que pintar (offline con caché, silencio)
	useEffect(() => {
		if (query.isError && !query.data) {
			toast.error(t('market.orders.toasts.loadErrorTitle'), { description: query.error?.message })
		}
	}, [query.isError, query.data, query.error, t])

	const loadMore = useCallback(() => {
		if (hasNextPage && !isFetching) fetchNextPage()
	}, [hasNextPage, isFetching, fetchNextPage])

	// Recortar a la página 1 antes de refetch: un refresh = UNA petición
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try {
			queryClient.setQueryData(['market', 'orders'], trimToFirstPage)
			await refetch()
		} catch { /* los datos anteriores siguen en pantalla */ }
		finally { setRefreshing(false) }
	}, [queryClient, refetch])

	const renderItem = ({ item }: ListRenderItemInfo<MarketOrder>) => {
		const status = MARKET_ORDER_STATUS[item.status as string] || { label: item.status as string, color: 'placeholder' }
		const image = mediaUrl(item.product?.main_image)
		return (
			<Pressable
				onPress={() => navigation.navigate(ROUTES.MARKET_ORDER_DETAIL, { order: item })}
				style={[styles.row, { backgroundColor: theme.colors.surface }, (theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
			>
				<View style={[styles.image, { backgroundColor: theme.colors.elevationLight }]}>
					{image && <FastImage source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode={FastImage.resizeMode.cover} />}
				</View>
				<View style={{ flex: 1 }}>
					<Text style={[textStyles.h6, { fontWeight: '500' }]} numberOfLines={1}>{item.product?.title || t('market.common.productFallback')}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]} numberOfLines={1}>
						{[item.shop?.name, getShortDateTime(item.created_at as string)].filter(Boolean).join(' · ')}
					</Text>
					<Text style={[textStyles.caption, { color: (theme.colors as Record<string, string>)[status.color] || theme.colors.secondaryText, marginTop: 3, fontWeight: '600' }]}>
						{t(status.label)}{item.tracking_code ? ` · ${item.tracking_code}` : ''}
					</Text>
				</View>
				<View style={styles.right}>
					<Text style={[textStyles.h6, { fontWeight: '600' }]}>${Number(item.total).toFixed(2)}</Text>
					{(item.quantity as number) > 1 && (
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
					<Text style={[textStyles.h5, { fontWeight: '600', marginTop: 12 }]}>{t('market.orders.emptyTitle')}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4, textAlign: 'center' }]}>
						{t('market.orders.emptySubtitle')}
					</Text>
				</View>
			) : (
				<FlatList
					data={orders}
					keyExtractor={(item) => item.uuid as string}
					renderItem={renderItem}
					contentContainerStyle={{ paddingVertical: 8, gap: 8 }}
					showsVerticalScrollIndicator={false}
					refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
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
