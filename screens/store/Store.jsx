import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPSectionHeader from '../../ui/particles/QPSectionHeader'

// User Context
import { useAuth } from '../../auth/AuthContext'

// Store component
const Store = () => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	// States
	const [search, setSearch] = useState('')

	// Mock data for sections
	const rechargePlans = [
		{ id: '1', title: 'Paquete Diario', description: '500 MB + 20 min', price: '$3.00' },
		{ id: '2', title: 'Paquete Semanal', description: '3 GB + 80 min', price: '$10.00' },
		{ id: '3', title: 'Paquete Mensual', description: '10 GB + 200 min', price: '$25.00' },
	]

	const giftCards = [
		{ id: '1', title: 'Netflix', tag: 'Entretenimiento', amount: '$15' },
		{ id: '2', title: 'PlayStation', tag: 'Gaming', amount: '$20' },
		{ id: '3', title: 'Amazon', tag: 'Shopping', amount: '$25' },
	]

	const popularProducts = [
		{ id: '1', title: 'AirPods Pro', price: '$210.00' },
		{ id: '2', title: 'Tarjeta Visa Virtual', price: '$50.00' },
		{ id: '3', title: 'Cuenta Spotify Premium', price: '$8.00' },
		{ id: '4', title: 'Gift Card Steam', price: '$20.00' },
	]

	return (
		<View style={[containerStyles.subContainer]}>
			<ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

				{/* Search bar */}
				<QPInput value={search} onChangeText={setSearch} placeholder="Buscar en la tienda" prefixIconName="magnifying-glass" style={styles.searchInput} />

				{/* Mobile top-up plans */}
				<View style={[styles.section, { marginTop: 10 }]}>
					<QPSectionHeader title="Recargas móviles" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.MOBILE_RECHARGES)} />
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList} >
						{rechargePlans.map((plan) => (
							<Pressable key={plan.id} style={[styles.card, { backgroundColor: theme.colors.elevation }]}>
								<Text style={[textStyles.h6, styles.cardTitle]}>{plan.title}</Text>
								<Text style={[textStyles.caption, styles.cardSubtitle]}>{plan.description}</Text>
								<Text style={[textStyles.h5, styles.cardPrice]}>{plan.price}</Text>
							</Pressable>
						))}
					</ScrollView>
				</View>

				{/* Gift cards */}
				<View style={styles.section}>
					<QPSectionHeader title="Tarjetas de regalo" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.GIFT_CARDS)} />
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
						{giftCards.map((card) => (
							<Pressable key={card.id} style={[styles.card, { backgroundColor: theme.colors.surface }]}>
								<Text style={[textStyles.h6, styles.cardTitle]}>{card.title}</Text>
								<Text style={[textStyles.caption, styles.cardSubtitle]}>{card.tag}</Text>
								<Text style={[textStyles.h5, styles.cardPrice]}>{card.amount}</Text>
							</Pressable>
						))}
					</ScrollView>
				</View>

				{/* Popular products */}
				<View style={styles.section}>
					<QPSectionHeader title="Productos populares" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.POPULAR_PRODUCTS)} />
					<View style={styles.grid}>
						{popularProducts.map((product) => (
							<Pressable key={product.id} style={[styles.productCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
								<View style={styles.productImagePlaceholder} />
								<Text style={[textStyles.h6, styles.productTitle]} numberOfLines={2}>
									{product.title}
								</Text>
								<Text style={[textStyles.h5, styles.productPrice]}>{product.price}</Text>
							</Pressable>
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