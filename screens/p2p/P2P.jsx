import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native"

// Theme Context
import { useTheme } from "../../theme/ThemeContext"
import { createTextStyles, createContainerStyles } from "../../theme/themeUtils"

// User Context
import { useAuth } from "../../auth/AuthContext"

// API
import { p2pApi } from "../../api/p2pApi"

// UI
import P2POffer from "../../ui/P2POfferItem"
import QPLoader from "../../ui/particles/QPLoader"

// Toast
import Toast from "react-native-toast-message"

// Lottie
import LottieView from "lottie-react-native"

// P2P component
const P2P = ({ navigation }) => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// States
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingData, setIsLoadingData] = useState(true)
	const [p2pOffers, setP2pOffers] = useState([])
	const [refreshing, setRefreshing] = useState(false)
	const [error, setError] = useState(null)
	const lastFetchRef = useRef(0)
	const [p2pEnabled, setP2pEnabled] = useState(user.p2p_enabled)

	// Get the Latest P2P Offers
	const fetchP2POffers = async (isRefresh = false) => {

		// Prevent multiple fetches in 60 seconds
		const now = Date.now()
		if (lastFetchRef.current && now - lastFetchRef.current < 60000) { return }

		try {

			isRefresh ? setRefreshing(true) : setIsLoadingData(true)
			setError(null)

			lastFetchRef.current = now

			const response = await p2pApi.index({
				page: 1,
				take: 50,
				order: "desc",
			})

			if (response.success) {
				setP2pOffers(response.offers || [])
			} else {
				setError(response.error || "Error al cargar las ofertas P2P")
				Toast.show({ type: "error", text1: response.error || "Error al cargar las ofertas P2P" })
			}

		} catch (err) {
			const errorMessage = "Error de conexión"
			setError(errorMessage)
			Toast.show({ type: "error", text1: errorMessage })
		} finally {
			setIsLoadingData(false)
			setRefreshing(false)
		}
	}

	// Load data on component mount
	useEffect(() => {
		if (p2pEnabled) { fetchP2POffers() }
	}, [])

	// Handle refresh
	const onRefresh = () => { fetchP2POffers(true) }

	// Render offer item
	const renderOffer = ({ item }) => <P2POffer offer={item} navigation={navigation} />

	// Loading component
	if (isLoadingData && !refreshing) { return <QPLoader /> }

	return (
		<View style={[containerStyles.subContainer, { paddingTop: 5 }]}>
			{
				p2pEnabled ? (
					<FlatList
						data={p2pOffers}
						renderItem={renderOffer}
						keyExtractor={(item) => item.uuid}
						contentContainerStyle={styles.listContainer}
						refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
						showsVerticalScrollIndicator={false}
						ListEmptyComponent={
							<View style={styles.emptyContainer}>
								<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: "center" }]}>
									{error ? error : "No hay ofertas P2P disponibles"}
								</Text>
							</View>
						}
					/>
				) : (
					<View style={styles.emptyContainer}>
						<LottieView source={require("../../assets/lotties/cancelled.json")} autoPlay loop={false} style={{ width: 250, height: 250 }} />
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: "center" }]}>P2P no está habilitado</Text>
					</View>
				)
			}
		</View>
	)
}

const styles = StyleSheet.create({
	listContainer: {
		paddingBottom: 20,
	},
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 40,
	},
	offerHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
	},
	typeContainer: {
		flexDirection: "row",
		alignItems: "center",
	},
	typeBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
	},
	typeText: {
		fontSize: 10,
		fontWeight: "bold",
		textTransform: "uppercase",
	},
	amountContainer: {
		marginBottom: 12,
	},
	amountRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	userContainer: {
		marginBottom: 12,
	},
	userInfo: {
		marginBottom: 4,
	},
	userStats: {
		flexDirection: "row",
	},
	badgesContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginBottom: 8,
	},
	badge: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		marginRight: 6,
		marginBottom: 4,
	},
	badgeText: {
		fontSize: 10,
		fontWeight: "bold",
	},
	messageContainer: {
		marginTop: 8,
		paddingTop: 8,
		borderTopWidth: 1,
		borderTopColor: "rgba(0,0,0,0.1)",
	}
})

export default P2P
