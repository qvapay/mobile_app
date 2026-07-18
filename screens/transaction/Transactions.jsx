import { useState, useEffect, useCallback, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { View, Text, ActivityIndicator, Pressable, Platform, useWindowDimensions } from 'react-native'
import { FlashList } from '@shopify/flash-list'

// Contexts
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// API
import { transferApi } from '../../api/transferApi'

// Stale-while-revalidate cache (instant cold-start / offline rendering)
import { CACHE_KEYS, readCache, writeCache } from '../../helpers/dataCache'

// UI
import QPTransaction from '../../ui/particles/QPTransaction'
import QPInput from '../../ui/particles/QPInput'
import TransactionFilterModal from './TransactionFilterModal'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const PAGE_SIZE = 20

// The fetched list (items + its two loading flags) moves together as one unit
const initialList = { transactions: [], isLoading: false, isRefreshing: false }

function listReducer(state, action) {
	switch (action.type) {
		case 'start':
			return { ...state, isLoading: !action.refresh, isRefreshing: !!action.refresh }
		case 'setItems':
			return { ...state, transactions: action.items }
		case 'hydrate':
			// Cached first page — never clobber data a fetch already delivered
			return state.transactions.length === 0 && action.items?.length ? { ...state, transactions: action.items } : state
		case 'appendItems':
			return { ...state, transactions: [...state.transactions, ...action.items] }
		case 'clear':
			return { ...state, transactions: [] }
		case 'finish':
			return { ...state, isLoading: false, isRefreshing: false }
		default:
			return state
	}
}

// The filter-modal draft (pending filters + selected period preset) is one unit
const initialDraft = { filters: {}, period: null }

function draftReducer(state, action) {
	switch (action.type) {
		case 'seed':
			return { filters: { ...action.filters }, period: action.period }
		case 'updateFilter': {
			const next = { ...state.filters }
			if (action.value === undefined || action.value === null || action.value === '') { delete next[action.key] }
			else { next[action.key] = action.value }
			return { ...state, filters: next }
		}
		case 'setPeriod':
			return { filters: { ...state.filters, date_from: action.range.date_from, date_to: action.range.date_to }, period: action.idx }
		case 'clearPeriod': {
			const next = { ...state.filters }
			delete next.date_from
			delete next.date_to
			return { period: null, filters: next }
		}
		case 'clearAll':
			return { filters: {}, period: null }
		default:
			return state
	}
}

/**
 * Full transaction history with search, filters and infinite scroll (FlashList).
 * Pages through `GET /transaction` (20 per page); accepts `route.params.showSearch`
 * to open with the search bar already visible.
 * Header search/filter buttons use iOS native `unstable_headerRightItems`
 * (SF Symbols, liquid-glass) with a `headerRight` fallback on Android.
 * The filter modal edits a draft that only takes effect on "Aplicar".
 */
const Transactions = ({ navigation, route }) => {

	// Fetched list state
	const [list, dispatchList] = useReducer(listReducer, initialList)
	const { transactions, isLoading, isRefreshing } = list

	// Pagination cursors — read only inside fetch/load-more handlers, never rendered,
	// so refs avoid re-rendering the whole list on every page/hasMore change.
	const pageRef = useRef(1)
	const hasMoreRef = useRef(true)
	// In-flight guard kept in a ref so fetchTransactions needn't capture isLoading state
	const inFlightRef = useRef(false)
	// Flipped on the first successful fetch — blocks late cache hydration from
	// overwriting fresh (possibly filtered or genuinely empty) results
	const hasFreshDataRef = useRef(false)

	// Applied filter state
	const [filters, setFilters] = useState({})
	const [showFilters, setShowFilters] = useState(false)

	// Search state
	const [showSearch, setShowSearch] = useState(route?.params?.showSearch ?? false)
	const [searchText, setSearchText] = useState('')

	// Draft filter state (only applied on "Aplicar")
	const [draft, dispatchDraft] = useReducer(draftReducer, initialDraft)
	// Currently-applied period preset — only read when seeding the draft, never rendered
	const selectedPeriodRef = useRef(null)

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const { height: windowHeight } = useWindowDimensions()

	// Check if any filters are active
	const hasActiveFilters = useMemo(() => Object.keys(filters).length > 0, [filters])

	// Fetch transactions with current filters
	const fetchTransactions = useCallback(async (pageNum = 1, refresh = false, activeFilters = filters) => {

		if (inFlightRef.current) return
		inFlightRef.current = true

		try {

			dispatchList({ type: 'start', refresh })

			const result = await transferApi.getLatestTransactions({
				page: pageNum,
				take: PAGE_SIZE,
				...activeFilters,
			})

			if (result.success) {
				hasFreshDataRef.current = true
				const newData = result.data || []
				if (refresh || pageNum === 1) { dispatchList({ type: 'setItems', items: newData }) }
				else { dispatchList({ type: 'appendItems', items: newData }) }
				hasMoreRef.current = newData.length >= PAGE_SIZE
				pageRef.current = pageNum
				// Persist the unfiltered first page for instant cold-start rendering
				if (pageNum === 1 && Object.keys(activeFilters).length === 0) {
					writeCache(CACHE_KEYS.TRANSACTIONS_FIRST_PAGE, newData)
				}
			}
		} catch (error) {
			// Silent fail - list stays as is
		} finally {
			inFlightRef.current = false
			dispatchList({ type: 'finish' })
		}
	}, [filters])

	// Open filter modal with current filters as draft
	const openFilters = useCallback(() => {
		dispatchDraft({ type: 'seed', filters, period: selectedPeriodRef.current })
		setShowFilters(true)
	}, [filters])

	// Toggle search
	const toggleSearch = useCallback(() => {
		setShowSearch(prev => {
			if (prev && searchText) {
				// Closing search — clear search text and re-fetch without search filter
				setSearchText('')
				const newFilters = { ...filters }
				delete newFilters.search
				setFilters(newFilters)
				pageRef.current = 1
				hasMoreRef.current = true
				dispatchList({ type: 'clear' })
				fetchTransactions(1, false, newFilters)
			}
			return !prev
		})
	}, [searchText, filters, fetchTransactions])

	// Header buttons (search + filter)
	useLayoutEffect(() => {
		const filterColor = hasActiveFilters ? theme.colors.primary : theme.colors.primaryText
		const searchColor = showSearch ? theme.colors.primary : theme.colors.primaryText
		navigation.setOptions({
			// Android fallback
			headerRight: () => (
				<View style={[containerStyles.headerRight, { gap: 18 }]}>
					<Pressable onPress={toggleSearch} hitSlop={8}>
						<FontAwesome6 name="magnifying-glass" size={18} color={searchColor} iconStyle="solid" />
					</Pressable>
					<Pressable onPress={openFilters} hitSlop={8}>
						<FontAwesome6 name="filter" size={18} color={filterColor} iconStyle="solid" />
					</Pressable>
				</View>
			),
			// iOS native header items
			...(Platform.OS === 'ios' && {
				unstable_headerRightItems: () => [
					{
						type: 'button',
						label: 'Buscar',
						icon: { type: 'sfSymbol', name: 'magnifyingglass' },
						tintColor: showSearch ? theme.colors.primary : undefined,
						onPress: toggleSearch,
					},
					{
						type: 'button',
						label: 'Filtrar',
						icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease' },
						tintColor: hasActiveFilters ? theme.colors.primary : undefined,
						onPress: openFilters,
					},
				],
			}),
		})
	}, [hasActiveFilters, showSearch, theme, navigation, containerStyles.headerRight, openFilters, toggleSearch])

	// Cold-start hydration (mount only): paint the cached unfiltered first page
	// while the network fetch revalidates; a resolved fetch always wins
	useEffect(() => {
		readCache(CACHE_KEYS.TRANSACTIONS_FIRST_PAGE).then(items => {
			if (items && !hasFreshDataRef.current) dispatchList({ type: 'hydrate', items })
		})
	}, [])

	// Initial load
	useEffect(() => {
		fetchTransactions(1)
	}, [fetchTransactions])

	// Load more on scroll end
	const handleLoadMore = useCallback(() => {
		if (!isLoading && hasMoreRef.current) {
			fetchTransactions(pageRef.current + 1)
		}
	}, [isLoading, fetchTransactions])

	// Pull to refresh
	const handleRefresh = useCallback(() => {
		hasMoreRef.current = true
		fetchTransactions(1, true)
	}, [fetchTransactions])

	// Apply filters from modal
	const applyFilters = () => {
		setFilters(draft.filters)
		selectedPeriodRef.current = draft.period
		setShowFilters(false)
		pageRef.current = 1
		hasMoreRef.current = true
		dispatchList({ type: 'clear' })
		fetchTransactions(1, false, draft.filters)
	}

	// Clear all draft filters
	const clearFilters = () => {
		dispatchDraft({ type: 'clearAll' })
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

	// Handle search submit
	const handleSearch = useCallback((text) => {
		const newFilters = { ...filters }
		if (text.trim()) {
			newFilters.search = text.trim()
		} else {
			delete newFilters.search
		}
		setFilters(newFilters)
		pageRef.current = 1
		hasMoreRef.current = true
		dispatchList({ type: 'clear' })
		fetchTransactions(1, false, newFilters)
	}, [filters, fetchTransactions])

	return (
		<View style={containerStyles.subContainer}>
			{showSearch && (
				<View style={{ paddingHorizontal: 0, paddingBottom: 8 }}>
					<QPInput
						placeholder="Buscar por descripción o UUID"
						value={searchText}
						onChangeText={setSearchText}
						onSubmitEditing={() => handleSearch(searchText)}
						returnKeyType="search"
						autoCapitalize="none"
						autoCorrect={false}
						autoFocus={true}
						prefixIconName="magnifying-glass"
						style={{ marginVertical: 0 }}
					/>
				</View>
			)}
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

			<TransactionFilterModal
				visible={showFilters}
				draftFilters={draft.filters}
				draftPeriod={draft.period}
				onUpdateDraft={(key, value) => dispatchDraft({ type: 'updateFilter', key, value })}
				onSetPeriod={(idx, range) => dispatchDraft({ type: 'setPeriod', idx, range })}
				onClearPeriod={() => dispatchDraft({ type: 'clearPeriod' })}
				onClear={clearFilters}
				onApply={applyFilters}
				onClose={() => setShowFilters(false)}
				theme={theme}
				textStyles={textStyles}
				windowHeight={windowHeight}
			/>
		</View>
	)
}

export default Transactions
