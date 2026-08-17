import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Routes
import { ROUTES } from '../../routes'

// Data (React Query)
import { useMyPurchasesQuery } from './storeQueries'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Helpers
import { getShortDateTime, statusText } from '../../helpers'
import { mediaUrl } from '../../helpers/mediaUrl'

// Toast
import { toast } from 'sonner-native'

// Status colors (same pattern as Transaction.jsx)
const getStatusColor = (status, theme) => {
	switch (status) {
		case 'paid': case 'completed': case 'received': return theme.colors.success
		case 'pending': case 'processing': return theme.colors.warning
		case 'cancelled': case 'failed': return theme.colors.danger
		default: return theme.colors.secondaryText
	}
}

/**
 * List of the user's store purchases (top-ups, gift cards) with status badges.
 * Loads once from `GET /store/my` with pull-to-refresh; each row navigates to
 * PurchaseDetail passing `purchaseId`. The initial load shows no spinner —
 * the global loading bar covers it.
 */
const MyPurchases = ({ navigation }) => {

	// Contexts
	const { theme, styles: themeStyles } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	// Data: la query hace el fetch, la persistencia en frío y conserva la
	// última lista buena si la red falla
	const query = useMyPurchasesQuery()
	const purchases = query.data || []
	const isLoading = query.isPending
	const [isRefreshing, setIsRefreshing] = useState(false)

	// El toast solo cuando no hay NADA que pintar
	useEffect(() => {
		if (query.isError && !query.data) {
			toast.error('Error', { description: query.error?.message || 'No se pudieron cargar tus compras' })
		}
	}, [query.isError, query.data, query.error])

	const { refetch } = query
	const onRefresh = useCallback(async () => {
		setIsRefreshing(true)
		try { await refetch() }
		catch { /* la lista anterior sigue en pantalla */ }
		finally { setIsRefreshing(false) }
	}, [refetch])

	// Handle purchase tap - navigate to PurchaseDetail
	const handlePurchasePress = (purchase) => { navigation.navigate(ROUTES.PURCHASE_DETAIL, { purchaseId: purchase.id }) }

	// Render purchase item
	const renderItem = ({ item }) => {

		const logoUrl = mediaUrl(item.service_logo) || ''
		const color = getStatusColor(item.status, theme)

		return (
			<Pressable style={[styles.purchaseItem, { backgroundColor: theme.colors.surface }]} onPress={() => handlePurchasePress(item)} >
				<View style={[styles.logoContainer, { backgroundColor: theme.colors.elevationLight }]}>
					{logoUrl ? (
						<FastImage source={{ uri: logoUrl, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }} style={themeStyles.container.fill} resizeMode={FastImage.resizeMode.contain} />
					) : null}
				</View>
				<View style={styles.itemContent}>
					<Text style={[textStyles.h6, { fontWeight: '600' }]} numberOfLines={1}>{item.service_name}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{getShortDateTime(item.created_at)}</Text>
				</View>
				<View style={[styles.statusBadge, { backgroundColor: color }]}>
					<Text style={[textStyles.h7, { color: theme.colors.almostBlack, fontWeight: '600' }]}>
						{statusText(item.status)}
					</Text>
				</View>
			</Pressable>
		)
	}

	// Loading state — global loading bar handles the indicator
	if (isLoading) { return <View style={containerStyles.subContainer} /> }

	// Empty state
	if (purchases.length === 0) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>No tienes compras aún</Text>
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<FlatList
				data={purchases}
				keyExtractor={(item) => String(item.id)}
				renderItem={renderItem}
				contentContainerStyle={styles.listContent}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(isRefreshing, onRefresh)}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	listContent: {
		paddingVertical: 8,
		gap: 8,
	},
	purchaseItem: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		gap: 12,
	},
	logoContainer: {
		width: 44,
		height: 44,
		borderRadius: 10,
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
	itemContent: {
		flex: 1,
		gap: 2,
	},
	statusBadge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
	},
})

export default MyPurchases
