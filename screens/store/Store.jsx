import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPProduct from '../../ui/particles/QPProduct'
import QPSectionHeader from '../../ui/particles/QPSectionHeader'

// User Context
import { useAuth } from '../../auth/AuthContext'

// Routes
import { ROUTES } from '../../routes'

// API
import { storeApi } from '../../api/storeApi'

// Store component
const Store = ({ navigation }) => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	// States
	const [search, setSearch] = useState('')
	const [topupPlans, setTopupPlans] = useState([])
	const [giftCards, setGiftCards] = useState([])
	const [isLoading, setIsLoading] = useState(false)

	// Effects Topups + Gift Cards
	useEffect(() => {
		const fetchData = async () => {
			setIsLoading(true)
			try {
				const [topupResponse, giftCardResponse] = await Promise.all([
					storeApi.phonePackages(),
					storeApi.getGiftCards({ featured: true, take: 6 }),
				])
				if (topupResponse.success) { setTopupPlans(topupResponse.data || []) }
				if (giftCardResponse.success) {
					const cards = Array.isArray(giftCardResponse.data) ? giftCardResponse.data : []
					setGiftCards(cards)
				}
			} catch (error) { console.error('Error fetching store data:', error) }
			finally { setIsLoading(false) }
		}
		fetchData()
	}, [])

	return (
		<View style={[containerStyles.subContainer]}>
			<ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false}>

				{/* Search bar */}
				<QPInput value={search} onChangeText={setSearch} placeholder="Buscar en la tienda" prefixIconName="magnifying-glass" style={styles.searchInput} />

				{/* Mobile top-up plans */}
				<View style={[styles.section, { marginTop: 10, gap: 5 }]}>
					<QPSectionHeader title="Recargas móviles" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX)} />
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList} >
						{topupPlans.map((plan) => (
							<QPProduct key={plan.id} name={plan.name} price={plan.price} details={plan.details} logo={plan.logo} onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_PURCHASE, { package: plan })} />
						))}
					</ScrollView>
				</View>

				{/* Gift cards */}
				<View style={[styles.section, { gap: 5 }]}>
					<QPSectionHeader title="Tarjetas de regalo" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.GIFT_CARDS)} />
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
						{giftCards.map((card) => (
							<QPProduct key={card.uuid || card.id} name={card.name} price={null} details={[card.lead || card.category].filter(Boolean)} logo={card.logo} onPress={() => navigation.navigate(ROUTES.GIFT_CARD_DETAIL, { uuid: card.uuid })} />
						))}
					</ScrollView>
				</View>

			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollView: {
		flex: 1,
	},
	searchContainer: {
		borderRadius: 16,
		paddingHorizontal: 16,
		paddingVertical: 10,
		marginBottom: 20,
	},
	searchInput: {
		fontSize: 16,
	},
	section: {
		marginBottom: 24,
	},
	sectionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	horizontalList: {
		paddingRight: 8,
	},
	topupCard: {
		width: 220,
		borderRadius: 12,
		padding: 8,
		marginRight: 12,
		borderWidth: 0.5,
	},
	topupImagePlaceholder: {
		height: 80,
		borderRadius: 8,
		marginBottom: 10,
		backgroundColor: 'rgba(255,255,255,0.06)',
	},
	topupHeaderRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 4,
	},
	topupTitle: {
		flex: 1,
		marginRight: 8,
	},
	topupPrice: {
		textAlign: 'right',
	},
	card: {
		width: 180,
		borderRadius: 16,
		padding: 16,
		marginRight: 12,
	},
	cardTitle: {
		marginBottom: 4,
	},
	cardSubtitle: {
		marginBottom: 12,
	},
	cardPrice: {
	},
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		rowGap: 16,
	},
	productCard: {
		width: '48%',
		borderRadius: 16,
		padding: 12,
		borderWidth: 1,
	},
	productImagePlaceholder: {
		height: 100,
		borderRadius: 12,
		marginBottom: 10,
		backgroundColor: 'rgba(255,255,255,0.06)',
	},
	productTitle: {
		marginBottom: 4,
	},
	productPrice: {
	},
})

export default Store