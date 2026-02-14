import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, FlatList, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPProduct from '../../ui/particles/QPProduct'
import QPLoader from '../../ui/particles/QPLoader'

// API
import { storeApi } from '../../api/storeApi'

// Routes
import { ROUTES } from '../../routes'

// Toast
import Toast from 'react-native-toast-message'

// GiftCards component
const GiftCards = ({ navigation }) => {

	// Contexts
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	// States
	const [search, setSearch] = useState('')
	const [giftCards, setGiftCards] = useState([])
	const [filteredCards, setFilteredCards] = useState([])
	const [isLoading, setIsLoading] = useState(false)
	const [isRefreshing, setIsRefreshing] = useState(false)

	// Fetch gift cards
	const fetchGiftCards = async (refresh = false) => {

		if (refresh) { setIsRefreshing(true) }
		else { setIsLoading(true) }

		try {
			const response = await storeApi.getGiftCards()
			if (response.success) {
				const cards = Array.isArray(response.data) ? response.data : []
				setGiftCards(cards)
				setFilteredCards(cards)
			}
			else { Toast.show({ type: 'error', text1: 'Error', text2: response.error || 'No se pudieron obtener las tarjetas de regalo' }) }
		} catch (error) {
			console.error('Error fetching gift cards:', error)
			Toast.show({ type: 'error', text1: 'Error', text2: 'Ha ocurrido un error al cargar las tarjetas de regalo' })
		} finally {
			setIsLoading(false)
			setIsRefreshing(false)
		}
	}

	// Initial load
	useEffect(() => {
		fetchGiftCards()
	}, [])

	// Filter cards when search changes
	useEffect(() => {
		if (search.trim()) {
			const searchLower = search.toLowerCase()
			setFilteredCards(giftCards.filter((card) =>
				card.name?.toLowerCase().includes(searchLower) ||
				card.category?.toLowerCase().includes(searchLower)
			))
		} else {
			setFilteredCards(giftCards)
		}
	}, [search, giftCards])

	// Handle card selection
	const handleCardSelect = (card) => { navigation.navigate(ROUTES.GIFT_CARD_DETAIL, { uuid: card.uuid }) }

	// Handle refresh
	const handleRefresh = () => { fetchGiftCards(true) }

	return (
		<View style={[containerStyles.subContainer]}>
			<ScrollView
				style={styles.scrollView}
				contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={isRefreshing}
						onRefresh={handleRefresh}
						tintColor={theme.colors.primary}
					/>
				}
			>
				{/* Search bar */}
				<QPInput
					value={search}
					onChangeText={setSearch}
					placeholder="Buscar tarjeta de regalo..."
					prefixIconName="magnifying-glass"
					style={styles.searchInput}
				/>

				{/* Loading state */}
				{isLoading && !isRefreshing && (
					<View style={styles.loadingContainer}>
						<QPLoader />
					</View>
				)}

				{/* Cards list */}
				{!isLoading && (
					<View style={styles.cardsContainer}>
						{filteredCards.length > 0 ? (
							<>
								<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 16 }]}>
									{filteredCards.length} tarjeta{filteredCards.length !== 1 ? 's' : ''} disponible{filteredCards.length !== 1 ? 's' : ''}
								</Text>
								<FlatList
									data={filteredCards}
									keyExtractor={(item) => item.uuid || item.id?.toString()}
									renderItem={({ item }) => (
										<QPProduct
											name={item.name}
											price={null}
											details={[item.lead || item.category].filter(Boolean)}
											logo={item.logo}
											onPress={() => handleCardSelect(item)}
											style={styles.cardItem}
										/>
									)}
									numColumns={2}
									columnWrapperStyle={styles.row}
									scrollEnabled={false}
									contentContainerStyle={styles.listContent}
								/>
							</>
						) : (
							<View style={styles.emptyContainer}>
								<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
									No se encontraron tarjetas de regalo
								</Text>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 8 }]}>
									{search.trim()
										? 'Intenta con otros términos de búsqueda'
										: 'No hay tarjetas disponibles en este momento'}
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
		fontSize: 16,
		marginBottom: 16,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		minHeight: 200,
	},
	cardsContainer: {
		flex: 1,
	},
	listContent: {
		paddingBottom: 20,
	},
	row: {
		justifyContent: 'space-between',
		marginBottom: 12,
	},
	cardItem: {
		width: '48%',
	},
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingVertical: 60,
	},
})

export default GiftCards
