import { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { View, Text, ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Platform, useWindowDimensions } from 'react-native'
import { FlashList } from '@shopify/flash-list'

// Contexts
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// API
import { transferApi } from '../../api/transferApi'

// UI
import QPTransaction from '../../ui/particles/QPTransaction'
import QPInput from '../../ui/particles/QPInput'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const PAGE_SIZE = 20

// Status options for filter chips
const STATUS_OPTIONS = [
	{ label: 'Pagadas', value: 'paid' },
	{ label: 'Pendientes', value: 'pending' },
	{ label: 'Procesando', value: 'processing' },
	{ label: 'Canceladas', value: 'cancelled' },
]

// Period preset helpers
const getStartOfDay = () => {
	const d = new Date()
	d.setHours(0, 0, 0, 0)
	return d.toISOString()
}

const getStartOfWeek = () => {
	const d = new Date()
	d.setDate(d.getDate() - d.getDay() + 1) // Monday
	d.setHours(0, 0, 0, 0)
	return d.toISOString()
}

const getStartOfMonth = () => {
	const d = new Date()
	d.setDate(1)
	d.setHours(0, 0, 0, 0)
	return d.toISOString()
}

const getStartOfLastMonth = () => {
	const d = new Date()
	d.setMonth(d.getMonth() - 1)
	d.setDate(1)
	d.setHours(0, 0, 0, 0)
	return d.toISOString()
}

const getEndOfLastMonth = () => {
	const d = new Date()
	d.setDate(0) // last day of previous month
	d.setHours(23, 59, 59, 999)
	return d.toISOString()
}

const PERIOD_OPTIONS = [
	{ label: 'Hoy', getRange: () => ({ date_from: getStartOfDay(), date_to: new Date().toISOString() }) },
	{ label: 'Esta semana', getRange: () => ({ date_from: getStartOfWeek(), date_to: new Date().toISOString() }) },
	{ label: 'Este mes', getRange: () => ({ date_from: getStartOfMonth(), date_to: new Date().toISOString() }) },
	{ label: 'Último mes', getRange: () => ({ date_from: getStartOfLastMonth(), date_to: getEndOfLastMonth() }) },
]

const SORT_FIELD_OPTIONS = [
	{ label: 'Fecha', value: 'created_at' },
	{ label: 'Monto', value: 'amount' },
]

const SORT_DIR_OPTIONS = [
	{ label: 'Recientes', value: 'desc' },
	{ label: 'Antiguos', value: 'asc' },
]

// Chip component
const Chip = ({ label, selected, onPress, theme }) => (
	<Pressable onPress={onPress} style={[styles.chip, selected ? { backgroundColor: theme.colors.primary } : { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border }]}>
		<Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.colors.secondaryText }]}>
			{label}
		</Text>
	</Pressable>
)

// Transactions Screen
const Transactions = ({ navigation }) => {

	// States
	const [transactions, setTransactions] = useState([])
	const [page, setPage] = useState(1)
	const [hasMore, setHasMore] = useState(true)
	const [isLoading, setIsLoading] = useState(false)
	const [isRefreshing, setIsRefreshing] = useState(false)

	// Filter state
	const [filters, setFilters] = useState({})
	const [showFilters, setShowFilters] = useState(false)

	// Draft filter state (only applied on "Aplicar")
	const [draftFilters, setDraftFilters] = useState({})
	const [selectedPeriod, setSelectedPeriod] = useState(null)
	const [draftPeriod, setDraftPeriod] = useState(null)

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const { height: windowHeight } = useWindowDimensions()

	// Check if any filters are active
	const hasActiveFilters = useMemo(() => Object.keys(filters).length > 0, [filters])

	// Open filter modal with current filters as draft
	const openFilters = useCallback(() => {
		setDraftFilters({ ...filters })
		setDraftPeriod(selectedPeriod)
		setShowFilters(true)
	}, [filters, selectedPeriod])

	// Header filter button
	useLayoutEffect(() => {
		const filterColor = hasActiveFilters ? theme.colors.primary : theme.colors.primaryText
		navigation.setOptions({
			headerRight: () => (
				<Pressable style={containerStyles.headerRight} onPress={openFilters}>
					<FontAwesome6 name="filter" size={20} color={filterColor} iconStyle="solid" />
				</Pressable>
			),
			...(Platform.OS === 'ios' && {
				unstable_headerRightItems: () => [{
					type: 'button',
					label: 'Filtrar',
					icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease' },
					tintColor: hasActiveFilters ? theme.colors.primary : undefined,
					onPress: openFilters,
				}],
			}),
		})
	}, [hasActiveFilters, theme, navigation, containerStyles.headerRight, openFilters])

	// Fetch transactions with current filters
	const fetchTransactions = useCallback(async (pageNum = 1, refresh = false, activeFilters = filters) => {

		if (isLoading) return

		try {

			if (refresh) { setIsRefreshing(true) }
			else { setIsLoading(true) }

			const result = await transferApi.getLatestTransactions({
				page: pageNum,
				take: PAGE_SIZE,
				...activeFilters,
			})

			if (result.success) {
				const newData = result.data || []
				if (refresh || pageNum === 1) { setTransactions(newData) }
				else { setTransactions(prev => [...prev, ...newData]) }
				setHasMore(newData.length >= PAGE_SIZE)
				setPage(pageNum)
			}
		} catch (error) {
			// Silent fail - list stays as is
		} finally {
			setIsLoading(false)
			setIsRefreshing(false)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filters])

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

	// Apply filters from modal
	const applyFilters = () => {
		setFilters(draftFilters)
		setSelectedPeriod(draftPeriod)
		setShowFilters(false)
		setPage(1)
		setTransactions([])
		setHasMore(true)
		fetchTransactions(1, false, draftFilters)
	}

	// Clear all filters
	const clearFilters = () => {
		setDraftFilters({})
		setDraftPeriod(null)
	}

	// Update a single draft filter value
	const updateDraft = (key, value) => {
		setDraftFilters(prev => {
			const next = { ...prev }
			if (value === undefined || value === null || value === '') { delete next[key] }
			else { next[key] = value }
			return next
		})
	}

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
			<FlashList
				data={transactions}
				renderItem={({ item, index }) => <QPTransaction transaction={item} navigation={navigation} index={index} totalItems={transactions.length} />}
				keyExtractor={(item) => item.uuid}
				ListEmptyComponent={!isLoading ? <Text style={textStyles.h2}>No hay transacciones</Text> : null}
				ListFooterComponent={renderFooter}
				onEndReached={handleLoadMore}
				onEndReachedThreshold={0.3}
				refreshControl={createHiddenRefreshControl(isRefreshing, handleRefresh)}
				showsVerticalScrollIndicator={false}
				estimatedItemSize={70}
			/>

			{/* Filter Modal */}
			<Modal visible={showFilters} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowFilters(false)} >
				<Pressable style={styles.overlay} onPress={() => setShowFilters(false)}>
					<Pressable style={[styles.modalCard, { backgroundColor: theme.colors.surface, maxHeight: windowHeight * 0.75 }]} onPress={() => { }}>

						{/* Header */}
						<View style={styles.modalHeader}>
							<FontAwesome6 name="filter" size={20} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.h3, { flex: 1, marginLeft: 12 }]}>Filtrar</Text>
							<Pressable onPress={() => setShowFilters(false)} hitSlop={12}>
								<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						</View>

						<ScrollView showsVerticalScrollIndicator={false} bounces={false}>

							{/* Status */}
							<Text style={[textStyles.h6, styles.sectionLabel]}>Estado</Text>
							<View style={styles.chipRow}>
								{STATUS_OPTIONS.map(opt => (
									<Chip
										key={opt.value}
										label={opt.label}
										selected={draftFilters.status === opt.value}
										onPress={() => updateDraft('status', draftFilters.status === opt.value ? undefined : opt.value)}
										theme={theme}
									/>
								))}
							</View>

							{/* Search */}
							<Text style={[textStyles.h6, styles.sectionLabel]}>Buscar</Text>
							<QPInput
								placeholder="Descripción o UUID"
								value={draftFilters.search || ''}
								onChangeText={v => updateDraft('search', v)}
								autoCapitalize="none"
								autoCorrect={false}
								prefixIconName="magnifying-glass"
								style={{ marginVertical: 0 }}
							/>

							{/* Period */}
							<Text style={[textStyles.h6, styles.sectionLabel]}>Período</Text>
							<View style={styles.chipRow}>
								{PERIOD_OPTIONS.map((opt, idx) => (
									<Chip
										key={opt.label}
										label={opt.label}
										selected={draftPeriod === idx}
										onPress={() => {
											if (draftPeriod === idx) {
												setDraftPeriod(null)
												updateDraft('date_from', undefined)
												updateDraft('date_to', undefined)
											} else {
												setDraftPeriod(idx)
												const range = opt.getRange()
												setDraftFilters(prev => ({ ...prev, date_from: range.date_from, date_to: range.date_to }))
											}
										}}
										theme={theme}
									/>
								))}
							</View>

							{/* Amount Range */}
							<Text style={[textStyles.h6, styles.sectionLabel]}>Monto</Text>
							<View style={styles.amountRow}>
								<View style={{ flex: 1 }}>
									<QPInput
										placeholder="Mínimo"
										value={draftFilters.min_amount || ''}
										onChangeText={v => updateDraft('min_amount', v.replace(/[^0-9.]/g, ''))}
										keyboardType="decimal-pad"
										style={{ marginVertical: 0 }}
									/>
								</View>
								<Text style={[textStyles.caption, { marginHorizontal: 8 }]}>—</Text>
								<View style={{ flex: 1 }}>
									<QPInput
										placeholder="Máximo"
										value={draftFilters.max_amount || ''}
										onChangeText={v => updateDraft('max_amount', v.replace(/[^0-9.]/g, ''))}
										keyboardType="decimal-pad"
										style={{ marginVertical: 0 }}
									/>
								</View>
							</View>

							{/* Sort */}
							<Text style={[textStyles.h6, styles.sectionLabel]}>Ordenar por</Text>
							<View style={styles.chipRow}>
								{SORT_FIELD_OPTIONS.map(opt => (
									<Chip
										key={opt.value}
										label={opt.label}
										selected={draftFilters.orderBy === opt.value}
										onPress={() => updateDraft('orderBy', draftFilters.orderBy === opt.value ? undefined : opt.value)}
										theme={theme}
									/>
								))}
							</View>

							<Text style={[textStyles.h6, styles.sectionLabel]}>Dirección</Text>
							<View style={styles.chipRow}>
								{SORT_DIR_OPTIONS.map(opt => (
									<Chip
										key={opt.value}
										label={opt.label}
										selected={draftFilters.order === opt.value}
										onPress={() => updateDraft('order', draftFilters.order === opt.value ? undefined : opt.value)}
										theme={theme}
									/>
								))}
							</View>

						</ScrollView>

						{/* Action buttons */}
						<View style={styles.actions}>
							<Pressable onPress={clearFilters} style={[styles.actionButton, { backgroundColor: theme.colors.elevation }]} >
								<Text style={[styles.actionText, { color: theme.colors.primaryText }]}>Limpiar</Text>
							</Pressable>
							<Pressable onPress={applyFilters} style={[styles.actionButton, { backgroundColor: theme.colors.primary, flex: 1 }]} >
								<Text style={[styles.actionText, { color: '#FFFFFF' }]}>Aplicar</Text>
							</Pressable>
						</View>

					</Pressable>
				</Pressable>
			</Modal>
		</View>
	)
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	modalCard: {
		width: '100%',
		borderRadius: 16,
		padding: 24,
	},
	modalHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 8,
	},
	sectionLabel: {
		marginTop: 16,
		marginBottom: 8,
	},
	chipRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	chip: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
	},
	chipText: {
		fontSize: 14,
		fontFamily: 'Rubik-Medium',
	},
	amountRow: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	actions: {
		flexDirection: 'row',
		gap: 12,
		marginTop: 16,
	},
	actionButton: {
		paddingVertical: 14,
		paddingHorizontal: 24,
		borderRadius: 25,
		alignItems: 'center',
		justifyContent: 'center',
	},
	actionText: {
		fontSize: 16,
		fontFamily: 'Rubik-SemiBold',
	},
})

export default Transactions
