import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, FlatList, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPProduct from '../../ui/particles/QPProduct'

// API
import { storeApi } from '../../api/storeApi'

// Routes
import { ROUTES } from '../../routes'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Toast
import Toast from 'react-native-toast-message'

// PhoneTopupIndex component
const PhoneTopupIndex = ({ navigation, route }) => {

	// External filter from route params
	const external = route.params?.external

	// Contexts
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { width: screenWidth } = useWindowDimensions()
	const numColumns = screenWidth >= 1024 ? 4 : screenWidth >= 768 ? 3 : 2
	const itemWidth = numColumns === 4 ? '23.5%' : numColumns === 3 ? '31.5%' : '48%'

	// States
	const [search, setSearch] = useState('')
	const [phonePackages, setPhonePackages] = useState([])
	const [filteredPackages, setFilteredPackages] = useState([])
	const [isLoading, setIsLoading] = useState(false)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [filters, setFilters] = useState({ country: '', operator: '' })

	// Fetch phone packages
	const fetchPhonePackages = async (refresh = false) => {

		if (refresh) { setIsRefreshing(true) }
		else { setIsLoading(true) }

		try {
			const response = await storeApi.phonePackages(filters)
			if (response.success) {
				setPhonePackages(response.data || [])
				setFilteredPackages(response.data || [])
			}
			else { Toast.show({ type: 'error', text1: 'Error', text2: response.error || 'No se pudieron obtener las recargas telefónicas' }) }
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error', text2: 'Ha ocurrido un error al cargar las recargas' })
		} finally {
			setIsLoading(false)
			setIsRefreshing(false)
		}
	}

	// Initial load
	useEffect(() => {
		fetchPhonePackages()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Filter packages by external param and search (client-side filtering)
	useEffect(() => {
		let filtered = phonePackages

		// Apply external filter from route params
		if (external !== undefined) { filtered = filtered.filter((pkg) => pkg.external === external) }

		// Apply search filter
		if (search.trim()) {
			const searchLower = search.toLowerCase()
			filtered = filtered.filter((pkg) =>
				pkg.name?.toLowerCase().includes(searchLower) ||
				pkg.operator?.toLowerCase().includes(searchLower) ||
				pkg.country?.toLowerCase().includes(searchLower)
			)
		}

		setFilteredPackages(filtered)
	}, [search, phonePackages, external])

	// Refetch when country or operator filters change (server-side filtering)
	useEffect(() => {
		// Debounce to avoid too many requests when filters change
		const timeoutId = setTimeout(() => {
			// Only refetch if filters are actually set
			if (filters.country || filters.operator) { fetchPhonePackages() }
		}, 500)
		return () => clearTimeout(timeoutId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filters.country, filters.operator])

	// Handle package selection
	const handlePackageSelect = (packageItem) => { navigation.navigate(ROUTES.PHONE_TOPUP_PURCHASE, { package: packageItem }) }

	// Handle refresh
	const handleRefresh = () => { fetchPhonePackages(true) }

	return (
		<View style={[containerStyles.subContainer]}>
			<ScrollView
				style={styles.scrollView}
				contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(isRefreshing, handleRefresh)}
			>
				{/* Search bar */}
				<QPInput
					value={search}
					onChangeText={setSearch}
					placeholder="Buscar recarga..."
					prefixIconName="magnifying-glass"
					style={[styles.searchInput, { fontSize: theme.typography.fontSize.md }]}
				/>

				{/* Filters section */}
				<View style={styles.filtersContainer}>
					<View style={styles.filterRow}>
						<View style={[styles.filterInput, { flex: 1, marginRight: 8 }]}>
							<QPInput
								value={filters.country}
								onChangeText={(value) => setFilters({ ...filters, country: value })}
								placeholder="País (ej: CU)"
								prefixIconName="globe"
								style={[styles.filterInputStyle, { fontSize: theme.typography.fontSize.sm }]}
							/>
						</View>
						<View style={[styles.filterInput, { flex: 1, marginLeft: 8 }]}>
							<QPInput
								value={filters.operator}
								onChangeText={(value) => setFilters({ ...filters, operator: value })}
								placeholder="Operador (ej: ETECSA)"
								prefixIconName="tower-broadcast"
								style={[styles.filterInputStyle, { fontSize: theme.typography.fontSize.sm }]}
							/>
						</View>
					</View>
				</View>

				{/* Packages list */}
				{!isLoading && (
					<View style={styles.packagesContainer}>
						{filteredPackages.length > 0 ? (
							<>
								<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 16 }]}>
									{filteredPackages.length} recarga{filteredPackages.length !== 1 ? 's' : ''} disponible{filteredPackages.length !== 1 ? 's' : ''}
								</Text>
								<FlatList
									data={filteredPackages}
									keyExtractor={(item) => item.id?.toString() || item.uuid?.toString() || Math.random().toString()}
									renderItem={({ item }) => {
										// Build details array - use item.details if available, otherwise construct from available fields
										const details = item.details || [
											item.operator,
											item.country,
											item.amount ? `${item.amount} ${item.currency || 'QUSD'}` : null,
										].filter(Boolean)

										return (
											<QPProduct
												name={item.name || 'Recarga'}
												price={item.price}
												details={details}
												logo={item.logo}
												image={item.image}
												onPress={() => handlePackageSelect(item)}
												style={[styles.packageCard, { width: itemWidth }]}
											/>
										)
									}}
									numColumns={numColumns}
									key={numColumns}
									columnWrapperStyle={styles.row}
									scrollEnabled={false}
									contentContainerStyle={styles.listContent}
								/>
							</>
						) : (
							<View style={styles.emptyContainer}>
								<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
									No se encontraron recargas
								</Text>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 8 }]}>
									{search.trim() || filters.country || filters.operator
										? 'Intenta con otros filtros de búsqueda'
										: 'No hay recargas disponibles en este momento'}
								</Text>
							</View>
						)}
					</View>
				)}
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollView: {
		flex: 1,
	},
	searchInput: {
		marginBottom: 16,
	},
	filtersContainer: {
		marginBottom: 20,
	},
	filterRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
	filterInput: {
		flex: 1,
	},
	filterInputStyle: {
	},
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		minHeight: 200,
	},
	packagesContainer: {
		flex: 1,
	},
	listContent: {
		paddingBottom: 20,
	},
	row: {
		justifyContent: 'space-between',
		marginBottom: 12,
	},
	packageCard: {
		width: '48%',
	},
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingVertical: 60,
	},
})

export default PhoneTopupIndex