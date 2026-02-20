import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPLoader from '../../ui/particles/QPLoader'
import QPButton from '../../ui/particles/QPButton'

// Routes
import { ROUTES } from '../../routes'

// API
import { storeApi } from '../../api/storeApi'

// Pull-to-refresh
import QPRefreshIndicator, { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Helpers
import { getShortDateTime, statusText } from '../../helpers'

// Toast
import Toast from 'react-native-toast-message'

// Status colors (same pattern as Transaction.jsx)
const getStatusColor = (status, theme) => {
	switch (status) {
		case 'paid': case 'completed': case 'received': return theme.colors.success
		case 'pending': case 'processing': return theme.colors.warning
		case 'cancelled': case 'failed': return theme.colors.danger
		default: return theme.colors.secondaryText
	}
}

const MyPurchases = ({ navigation }) => {

	// Contexts
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	// States
	const [purchases, setPurchases] = useState([])
	const [isLoading, setIsLoading] = useState(true)
	const [isRefreshing, setIsRefreshing] = useState(false)

	// Fetch purchases
	const fetchPurchases = useCallback(async (refresh = false) => {
		if (refresh) { setIsRefreshing(true) }
		else { setIsLoading(true) }

		try {
			const response = await storeApi.getMyPurchases()
			if (response.success) {
				setPurchases(response.data || [])
			} else {
				Toast.show({ type: 'error', text1: 'Error', text2: response.error || 'No se pudieron cargar tus compras' })
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo conectar con el servidor' })
		} finally {
			setIsLoading(false)
			setIsRefreshing(false)
		}
	}, [])

	// Initial load
	useEffect(() => { fetchPurchases() }, [fetchPurchases])

	// Handle purchase tap - navigate to PurchaseDetail
	const handlePurchasePress = (purchase) => {
		navigation.navigate(ROUTES.PURCHASE_DETAIL, { purchaseId: purchase.id })
	}

	// Get logo URL (same pattern as QPProduct)
	const getLogoUrl = (logo) => {
		if (!logo) return ''
		return logo.startsWith('http') ? logo : `https://media.qvapay.com/${logo}`
	}

	// Render purchase item
	const renderItem = ({ item }) => {
		const logoUrl = getLogoUrl(item.service_logo)
		const color = getStatusColor(item.status, theme)

		return (
			<Pressable style={[styles.purchaseItem, { backgroundColor: theme.colors.surface }]} onPress={() => handlePurchasePress(item)} >
				<View style={[styles.logoContainer, { backgroundColor: theme.colors.elevationLight }]}>
					{logoUrl ? (
						<FastImage source={{ uri: logoUrl, priority: FastImage.priority.normal }} style={styles.logo} resizeMode={FastImage.resizeMode.contain} />
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

	// Loading state
	if (isLoading) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	// Empty state
	if (purchases.length === 0) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>No tienes compras a\u00FAn</Text>
				<QPButton
					title="Ir a la tienda"
					onPress={() => navigation.goBack()}
					style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 24 }}
					textStyle={{ color: theme.colors.almostWhite }}
				/>
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<QPRefreshIndicator refreshing={isRefreshing} />
			<FlatList
				data={purchases}
				keyExtractor={(item) => String(item.id)}
				renderItem={renderItem}
				contentContainerStyle={styles.listContent}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(isRefreshing, () => fetchPurchases(true))}
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
	logo: {
		width: '100%',
		height: '100%',
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
