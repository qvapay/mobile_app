import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Platform, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPProduct from '../../ui/particles/QPProduct'
import QPSectionHeader from '../../ui/particles/QPSectionHeader'
import QPLoader from '../../ui/particles/QPLoader'

// Routes
import { ROUTES } from '../../routes'

// API
import { storeApi } from '../../api/storeApi'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Toast
import { toast } from 'sonner-native'

// Store component
const Store = ({ navigation }) => {

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
	const [externalPlans, setExternalPlans] = useState([])
	const [microPlans, setMicroPlans] = useState([])
	const [giftCards, setGiftCards] = useState([])
	const [, setMyPurchases] = useState([])
	const [isLoading, setIsLoading] = useState(true)
	const [isRefreshing, setIsRefreshing] = useState(false)

	// Fetch store data
	const fetchData = useCallback(async (refresh = false) => {

		if (refresh) { setIsRefreshing(true) }
		else { setIsLoading(true) }

		try {

			const [topupResponse, giftCardResponse, purchasesResponse] = await Promise.all([
				storeApi.phonePackages(),
				storeApi.getGiftCards({ featured: true, take: 6 }),
				storeApi.getMyPurchases(),
			])

			if (topupResponse.success) {
				const all = topupResponse.data || []
				setExternalPlans(all.filter((p) => p.external === true))
				setMicroPlans(all.filter((p) => p.external === false))
			} else { toast.error('Recargas', { description: topupResponse.error || 'No se pudieron cargar las recargas' }) }

			if (giftCardResponse.success) {
				const cards = Array.isArray(giftCardResponse.data) ? giftCardResponse.data : []
				setGiftCards(cards)
			} else { toast.error('Tarjetas', { description: giftCardResponse.error || 'No se pudieron cargar las tarjetas de regalo' }) }

			if (purchasesResponse.success) { setMyPurchases(purchasesResponse.data || []) }

		} catch (error) {
			toast.error('Error', { description: 'No se pudo conectar con el servidor' })
		} finally {
			setIsLoading(false)
			setIsRefreshing(false)
		}
	}, [])

	// Initial load
	useEffect(() => { fetchData() }, [fetchData])

	// Loading state
	if (isLoading) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	return (
		<View style={[containerStyles.subContainer]}>
			<ScrollView
				style={styles.scrollView}
				contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(isRefreshing, () => fetchData(true))}
			>

				{/* Search bar */}
				<QPInput value={search} onChangeText={setSearch} placeholder="Buscar en la tienda" prefixIconName="magnifying-glass" style={[styles.searchInput, { fontSize: theme.typography.fontSize.md }]} />

				{/* Microrecargas */}
				<View style={[styles.section, { marginTop: 10, gap: 5 }]}>
					<QPSectionHeader title="Microrecargas" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX, { external: false })} />
					{microPlans.length > 0 ? (
						Platform.OS === 'ios' ? (
							<View style={styles.grid}>
								{microPlans.map((plan) => (
									<QPProduct key={plan.id} name={plan.name} price={plan.price} goldPrice={plan.gold_price} details={plan.details} logo={plan.logo} onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_PURCHASE, { package: plan })} style={{ width: itemWidth, marginRight: 0 }} />
								))}
							</View>
						) : (
							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
								{microPlans.map((plan) => (
									<QPProduct key={plan.id} name={plan.name} price={plan.price} goldPrice={plan.gold_price} details={plan.details} logo={plan.logo} onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_PURCHASE, { package: plan })} />
								))}
							</ScrollView>
						)
					) : (
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center', paddingVertical: 20 }]}>
							No hay microrecargas disponibles
						</Text>
					)}
				</View>

				{/* Recargas del exterior */}
				<View style={[styles.section, { gap: 5 }]}>
					<QPSectionHeader title="Recargas del exterior" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX, { external: true })} />
					{externalPlans.length > 0 ? (
						Platform.OS === 'ios' ? (
							<View style={styles.grid}>
								{externalPlans.map((plan) => (
									<QPProduct key={plan.id} name={plan.name} price={plan.price} goldPrice={plan.gold_price} details={plan.details} logo={plan.logo} onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_PURCHASE, { package: plan })} style={{ width: itemWidth, marginRight: 0 }} />
								))}
							</View>
						) : (
							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
								{externalPlans.map((plan) => (
									<QPProduct key={plan.id} name={plan.name} price={plan.price} goldPrice={plan.gold_price} details={plan.details} logo={plan.logo} onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_PURCHASE, { package: plan })} />
								))}
							</ScrollView>
						)
					) : (
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center', paddingVertical: 20 }]}>
							No hay recargas del exterior disponibles
						</Text>
					)}
				</View>

				{/* Gift cards (hidden on iOS per App Store Guideline 3.1.1) */}
				{Platform.OS !== 'ios' && (
					<View style={[styles.section, { gap: 5 }]}>
						<QPSectionHeader title="Tarjetas de regalo" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.GIFT_CARDS)} />
						{giftCards.length > 0 ? (
							<View style={styles.grid}>
								{giftCards.map((card) => (
									<QPProduct key={card.uuid || card.id} name={card.name} price={null} details={[card.lead || card.category].filter(Boolean)} logo={card.logo} onPress={() => navigation.navigate(ROUTES.GIFT_CARD_DETAIL, { uuid: card.uuid })} style={{ width: itemWidth, marginRight: 0 }} />
								))}
							</View>
						) : (
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center', paddingVertical: 20 }]}>
								No hay tarjetas disponibles
							</Text>
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
	section: {
		marginBottom: 24,
	},
	horizontalList: {
		paddingRight: 8,
	},
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		rowGap: 16,
	},
})

export default Store
