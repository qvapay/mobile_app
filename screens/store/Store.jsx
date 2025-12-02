import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPProduct from '../../ui/particles/QPProduct'
import QPSectionHeader from '../../ui/particles/QPSectionHeader'

// User Context
import { useAuth } from '../../auth/AuthContext'

// API
import { storeApi } from '../../api/storeApi'

// Store component
const Store = () => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	// States
	const [search, setSearch] = useState('')
	const [topupPlans, setTopupPlans] = useState([])
	const [isLoading, setIsLoading] = useState(false)

	// Effects Topups
	useEffect(() => {
		const fetchTopupPlans = async () => {
			setIsLoading(true)
			try {
				const response = await storeApi.phonePackages()
				if (response.success) { setTopupPlans(response.data || []) }
			} catch (error) { console.error('Error fetching topup plans:', error) }
			finally { setIsLoading(false) }
		}
		fetchTopupPlans()
	}, [])

	const giftCards = [
		// { id: '1', title: 'Netflix', tag: 'Entretenimiento', amount: '$15' },
		// { id: '2', title: 'PlayStation', tag: 'Gaming', amount: '$20' },
		// { id: '3', title: 'Amazon', tag: 'Shopping', amount: '$25' },
	]

	const popularProducts = [
		// { id: '1', title: 'AirPods Pro', price: '$210.00' },
		// { id: '2', title: 'Tarjeta Visa Virtual', price: '$50.00' },
		// { id: '3', title: 'Cuenta Spotify Premium', price: '$8.00' },
		// { id: '4', title: 'Gift Card Steam', price: '$20.00' },
	]

	return (
		<View style={[containerStyles.subContainer]}>
			<ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

				{/* Search bar */}
				<QPInput value={search} onChangeText={setSearch} placeholder="Buscar en la tienda" prefixIconName="magnifying-glass" style={styles.searchInput} />

				{/* Mobile top-up plans */}
				<View style={[styles.section, { marginTop: 10, gap: 5 }]}>
					<QPSectionHeader title="Recargas móviles" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.MOBILE_RECHARGES)} />
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList} >
						{topupPlans.map((plan) => (
							<QPProduct key={plan.id} name={plan.name} price={plan.price} details={plan.details} image={plan.image} onPress={() => navigation.navigate(ROUTES.MOBILE_RECHARGE, { planId: plan.id })} />
						))}
					</ScrollView>
				</View>

				{/* Gift cards */}
				<View style={[styles.section, { gap: 5 }]}>
					<QPSectionHeader title="Tarjetas de regalo" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.GIFT_CARDS)} />
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
						{giftCards.map((card) => (
							<QPProduct key={card.id} name={card.title} price={card.amount} details={card.tag} image={card.image} onPress={() => navigation.navigate(ROUTES.GIFT_CARD, { cardId: card.id })} />
						))}
					</ScrollView>
				</View>

				{/* Popular products */}
				<View style={[styles.section, { gap: 5 }]}>
					<QPSectionHeader title="Productos populares" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.POPULAR_PRODUCTS)} />
					<View style={styles.grid}>
						{popularProducts.map((product) => (
							<QPProduct key={product.id} name={product.title} price={product.price} details={product.details} image={product.image} onPress={() => navigation.navigate(ROUTES.PRODUCT, { productId: product.id })} style={{ width: '46%' }} />
						))}
					</View>
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