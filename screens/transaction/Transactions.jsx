import { useState, useCallback, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { View, Text, ActivityIndicator, Pressable, Platform, useWindowDimensions } from 'react-native'
import { FlashList } from '@shopify/flash-list'

// Contexts
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Data
import useTransactionsList from './useTransactionsList'
import { groupTransactionsByDay } from './transactionsGrouping'

// UI
import QPTransaction from '../../ui/particles/QPTransaction'
import QPInput from '../../ui/particles/QPInput'
import TransactionFilterModal from './TransactionFilterModal'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

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
 *
 * Los datos viven en React Query (`useTransactionsList`): cada juego de filtros
 * es su propia query infinita, la primera página sin filtrar se persiste en
 * disco para el arranque en frío, y aplicar filtros o buscar es simplemente
 * cambiar el estado `filters` — la query nueva arranca sola.
 *
 * Header search/filter buttons use iOS native `unstable_headerRightItems`
 * (SF Symbols, liquid-glass) with a `headerRight` fallback on Android.
 * The filter modal edits a draft that only takes effect on "Aplicar".
 */
const Transactions = ({ navigation, route }) => {

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

	// Paginated history for the applied filters
	const { transactions, isPending, isFetchingNextPage, refreshing, onRefresh, loadMore } = useTransactionsList(filters)

	// Separadores por día (estilo Mercury): cada día es su propia tarjeta con
	// una fecha minúscula encima; las posiciones relativas al grupo hacen que
	// QPTransaction redondee las esquinas de cada bloque, no de la lista entera
	const listItems = useMemo(() => groupTransactionsByDay(transactions), [transactions])

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const { height: windowHeight } = useWindowDimensions()

	// Check if any filters are active
	const hasActiveFilters = useMemo(() => Object.keys(filters).length > 0, [filters])

	// Open filter modal with current filters as draft
	const openFilters = useCallback(() => {
		dispatchDraft({ type: 'seed', filters, period: selectedPeriodRef.current })
		setShowFilters(true)
	}, [filters])

	// Toggle search
	const toggleSearch = useCallback(() => {
		setShowSearch(prev => {
			if (prev && searchText) {
				// Closing search — clear search text and drop the search filter
				setSearchText('')
				setFilters(current => {
					const next = { ...current }
					delete next.search
					return next
				})
			}
			return !prev
		})
	}, [searchText])

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

	// Apply filters from modal — cambiar `filters` cambia de query; no hay nada
	// más que resetear (cursores y lista los gestiona React Query)
	const applyFilters = () => {
		setFilters(draft.filters)
		selectedPeriodRef.current = draft.period
		setShowFilters(false)
	}

	// Clear all draft filters
	const clearFilters = () => {
		dispatchDraft({ type: 'clearAll' })
	}

	// Footer loader (next page in flight)
	const renderFooter = () => {
		if (!isFetchingNextPage) return null
		return (
			<View style={{ paddingVertical: 20, alignItems: 'center' }}>
				<ActivityIndicator size="small" color={theme.colors.primary} />
			</View>
		)
	}

	// Handle search submit
	const handleSearch = useCallback((text) => {
		const term = text.trim()
		setFilters(current => {
			const next = { ...current }
			if (term) { next.search = term }
			else { delete next.search }
			return next
		})
	}, [])

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
				data={listItems}
				getItemType={(item) => item.type}
				renderItem={({ item }) => (
					item.type === 'header'
						? <Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 8, marginBottom: 6, marginLeft: 4 }]}>{item.label}</Text>
						: <QPTransaction transaction={item.transaction} navigation={navigation} index={item.groupIndex} totalItems={item.groupSize} />
				)}
				keyExtractor={(item) => (item.type === 'header' ? item.key : item.transaction.uuid)}
				ListEmptyComponent={!isPending ? <Text style={textStyles.h2}>No hay transacciones</Text> : null}
				ListFooterComponent={renderFooter}
				onEndReached={loadMore}
				onEndReachedThreshold={0.3}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
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
