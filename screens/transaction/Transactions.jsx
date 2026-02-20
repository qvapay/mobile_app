import { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { View, Text, FlatList, ActivityIndicator, Modal, Pressable, TextInput, ScrollView, StyleSheet, Platform } from 'react-native'

// Contexts
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// API
import { transferApi } from '../../api/transferApi'

// UI
import QPTransaction from '../../ui/particles/QPTransaction'

// Pull-to-refresh
import QPRefreshIndicator, { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

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
	<Pressable
		onPress={onPress}
		style={[
			styles.chip,
			{ backgroundColor: selected ? theme.colors.primary : theme.colors.surface },
			!theme.isDark && !selected && { borderWidth: 1, borderColor: theme.colors.border },
		]}
	>
		<Text style={[
			styles.chipText,
			{ color: selected ? '#FFFFFF' : theme.colors.primaryText },
		]}>
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
			if (value === undefined || value === null || value === '') {
				delete next[key]
			} else {
				next[key] = value
			}
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
			<QPRefreshIndicator refreshing={isRefreshing} />
			<FlatList
				data={transactions}
				renderItem={({ item, index }) => <QPTransaction transaction={item} navigation={navigation} index={index} totalItems={transactions.length} />}
				keyExtractor={(item) => item.uuid}
				ListEmptyComponent={!isLoading ? <Text style={textStyles.h2}>No hay transacciones</Text> : null}
				ListFooterComponent={renderFooter}
				onEndReached={handleLoadMore}
				onEndReachedThreshold={0.3}
				refreshControl={createHiddenRefreshControl(isRefreshing, handleRefresh)}
			/>

			{/* Filter Modal */}
			<Modal
				visible={showFilters}
				animationType="slide"
				transparent
				onRequestClose={() => setShowFilters(false)}
			>
				<View style={styles.modalOverlay}>
					<View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>

						{/* Header */}
						<View style={styles.modalHeader}>
							<Text style={[textStyles.h3, { flex: 1 }]}>Filtrar transacciones</Text>
							<Pressable onPress={() => setShowFilters(false)} hitSlop={12}>
								<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						</View>

						<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>

							{/* Status */}
							<Text style={[textStyles.h6, styles.sectionLabel]}>Estado</Text>
							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
								{STATUS_OPTIONS.map(opt => (
									<Chip
										key={opt.value}
										label={opt.label}
										selected={draftFilters.status === opt.value}
										onPress={() => updateDraft('status', draftFilters.status === opt.value ? undefined : opt.value)}
										theme={theme}
									/>
								))}
							</ScrollView>

							{/* Search */}
							<Text style={[textStyles.h6, styles.sectionLabel]}>Buscar</Text>
							<TextInput
								style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }]}
								placeholder="Descripción o UUID"
								placeholderTextColor={theme.colors.tertiaryText}
								value={draftFilters.search || ''}
								onChangeText={v => updateDraft('search', v)}
								autoCapitalize="none"
								autoCorrect={false}
							/>

							{/* Period */}
							<Text style={[textStyles.h6, styles.sectionLabel]}>Período</Text>
							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
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
							</ScrollView>

							{/* Amount Range */}
							<Text style={[textStyles.h6, styles.sectionLabel]}>Monto</Text>
							<View style={styles.amountRow}>
								<TextInput
									style={[styles.input, styles.amountInput, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }]}
									placeholder="Mínimo"
									placeholderTextColor={theme.colors.tertiaryText}
									value={draftFilters.min_amount || ''}
									onChangeText={v => updateDraft('min_amount', v.replace(/[^0-9.]/g, ''))}
									keyboardType="decimal-pad"
								/>
								<Text style={[textStyles.caption, { marginHorizontal: 8 }]}>—</Text>
								<TextInput
									style={[styles.input, styles.amountInput, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }]}
									placeholder="Máximo"
									placeholderTextColor={theme.colors.tertiaryText}
									value={draftFilters.max_amount || ''}
									onChangeText={v => updateDraft('max_amount', v.replace(/[^0-9.]/g, ''))}
									keyboardType="decimal-pad"
								/>
							</View>

							{/* Sort */}
							<Text style={[textStyles.h6, styles.sectionLabel]}>Ordenar por</Text>
							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
								{SORT_FIELD_OPTIONS.map(opt => (
									<Chip
										key={opt.value}
										label={opt.label}
										selected={draftFilters.orderBy === opt.value}
										onPress={() => updateDraft('orderBy', draftFilters.orderBy === opt.value ? undefined : opt.value)}
										theme={theme}
									/>
								))}
							</ScrollView>

							<Text style={[textStyles.h6, styles.sectionLabel]}>Dirección</Text>
							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
								{SORT_DIR_OPTIONS.map(opt => (
									<Chip
										key={opt.value}
										label={opt.label}
										selected={draftFilters.order === opt.value}
										onPress={() => updateDraft('order', draftFilters.order === opt.value ? undefined : opt.value)}
										theme={theme}
									/>
								))}
							</ScrollView>

						</ScrollView>

						{/* Action buttons */}
						<View style={styles.actions}>
							<Pressable
								onPress={clearFilters}
								style={[styles.actionButton, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }]}
							>
								<Text style={[styles.actionText, { color: theme.colors.primaryText }]}>Limpiar</Text>
							</Pressable>
							<Pressable
								onPress={applyFilters}
								style={[styles.actionButton, { backgroundColor: theme.colors.primary, flex: 1 }]}
							>
								<Text style={[styles.actionText, { color: '#FFFFFF' }]}>Aplicar</Text>
							</Pressable>
						</View>

					</View>
				</View>
			</Modal>
		</View>
	)
}

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		justifyContent: 'flex-end',
		backgroundColor: 'rgba(0,0,0,0.5)',
	},
	modalContent: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 34,
		maxHeight: '85%',
	},
	modalHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 16,
	},
	sectionLabel: {
		marginTop: 16,
		marginBottom: 8,
	},
	chipRow: {
		flexDirection: 'row',
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
	input: {
		borderRadius: 10,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 16,
		fontFamily: 'Rubik-Regular',
	},
	amountRow: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	amountInput: {
		flex: 1,
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
