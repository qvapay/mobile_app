import { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, ActivityIndicator } from 'react-native'

// Contexts
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// API
import { transferApi } from '../../api/transferApi'

// UI
import QPTransaction from '../../ui/particles/QPTransaction'

const PAGE_SIZE = 20

// Transactions Screen
const Transactions = ({ navigation, route }) => {

	// States
	const [transactions, setTransactions] = useState([])
	const [page, setPage] = useState(1)
	const [hasMore, setHasMore] = useState(true)
	const [isLoading, setIsLoading] = useState(false)
	const [isRefreshing, setIsRefreshing] = useState(false)

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Fetch transactions
	const fetchTransactions = useCallback(async (pageNum = 1, refresh = false) => {
		if (isLoading) return

		try {
			if (refresh) { setIsRefreshing(true) }
			else { setIsLoading(true) }

			const result = await transferApi.getLatestTransactions({ page: pageNum, take: PAGE_SIZE })

			if (result.success) {
				const newData = result.data || []
				if (refresh || pageNum === 1) {
					setTransactions(newData)
				} else {
					setTransactions(prev => [...prev, ...newData])
				}
				setHasMore(newData.length >= PAGE_SIZE)
				setPage(pageNum)
			}
		} catch (error) {
			// Silent fail - list stays as is
		} finally {
			setIsLoading(false)
			setIsRefreshing(false)
		}
	}, [])

	// Initial load
	useEffect(() => {
		fetchTransactions(1)
	}, [fetchTransactions])

	// Load more on scroll end
	const handleLoadMore = useCallback(() => {
		if (!isLoading && hasMore) {
			fetchTransactions(page + 1)
		}
	}, [isLoading, hasMore, page, fetchTransactions])

	// Pull to refresh
	const handleRefresh = useCallback(() => {
		setHasMore(true)
		fetchTransactions(1, true)
	}, [fetchTransactions])

	// Footer loader
	const renderFooter = () => {
		if (!isLoading || transactions.length === 0) return null
		return (
			<View style={{ paddingVertical: 20, alignItems: 'center' }}>
				<ActivityIndicator size="small" color={theme.colors.primary} />
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<FlatList
				data={transactions}
				renderItem={({ item, index }) => <QPTransaction transaction={item} navigation={navigation} index={index} totalItems={transactions.length} />}
				keyExtractor={(item) => item.uuid}
				ListEmptyComponent={!isLoading ? <Text style={textStyles.h2}>No hay transacciones</Text> : null}
				ListFooterComponent={renderFooter}
				onEndReached={handleLoadMore}
				onEndReachedThreshold={0.3}
				refreshing={isRefreshing}
				onRefresh={handleRefresh}
			/>
		</View>
	)
}

export default Transactions
