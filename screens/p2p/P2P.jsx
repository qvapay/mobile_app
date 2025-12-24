import { useState, useEffect, useRef, useMemo } from "react"
import { View, Text, StyleSheet, FlatList, RefreshControl, Modal, Pressable, Switch, ScrollView } from "react-native"

// Theme Context
import { useTheme } from "../../theme/ThemeContext"
import { createTextStyles, createContainerStyles } from "../../theme/themeUtils"

// User Context
import { useAuth } from "../../auth/AuthContext"

// API
import { p2pApi } from "../../api/p2pApi"
import coinsApi from "../../api/coinsApi"

// UI
import P2POffer from "../../ui/P2POfferItem"
import QPLoader from "../../ui/particles/QPLoader"
import QPInput from "../../ui/particles/QPInput"
import QPSwitch from "../../ui/particles/QPSwitch"
import QPCoin from "../../ui/particles/QPCoin"
import QPButton from "../../ui/particles/QPButton"

// Toast
import Toast from "react-native-toast-message"

// Lottie
import LottieView from "lottie-react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

// Routes
import { ROUTES } from "../../routes"

// P2P component
const P2P = ({ navigation, route }) => {

	// User
	const { user } = useAuth()

	// Theme Context
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// States
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingData, setIsLoadingData] = useState(true)
	const [p2pOffers, setP2pOffers] = useState([])
	const [refreshing, setRefreshing] = useState(false)
	const [error, setError] = useState(null)
	const lastFetchRef = useRef(0)
	const [p2pEnabled, setP2pEnabled] = useState(user.p2p_enabled)

	// modal Show Hide
	const [showFiltersModal, setShowFiltersModal] = useState(false)
	const [showCoinPicker, setShowCoinPicker] = useState(false)

	// Filters state
	const [showMine, setShowMine] = useState(false)
	const [typeFilter, setTypeFilter] = useState(null)
	const [selectedCoin, setSelectedCoin] = useState(null)
	const [minAmount, setMinAmount] = useState("")
	const [maxAmount, setMaxAmount] = useState("")
	const [ratioMin, setRatioMin] = useState("")
	const [ratioMax, setRatioMax] = useState("")
	const [onlyKyc, setOnlyKyc] = useState(false)
	const [onlyVip, setOnlyVip] = useState(false)

	// Whether any non-default filter is active
	const hasActiveFilters = useMemo(() => {
		return (
			showMine ||
			!!selectedCoin?.tick ||
			minAmount !== "" ||
			maxAmount !== "" ||
			ratioMin !== "" ||
			ratioMax !== "" ||
			onlyKyc ||
			onlyVip ||
			typeFilter
		)
	}, [showMine, selectedCoin?.tick, minAmount, maxAmount, ratioMin, ratioMax, onlyKyc, onlyVip, typeFilter])

	// Filters object used for API
	const apiFilters = useMemo(() => {
		const filters = {
			page: 1,
			take: 30,
			order: "desc",
			type: typeFilter,
		}
		if (showMine) { filters.my = true }
		if (selectedCoin?.tick) { filters.coin = selectedCoin.tick }
		if (minAmount !== "" && !isNaN(parseFloat(minAmount))) { filters.min = parseFloat(minAmount) }
		if (maxAmount !== "" && !isNaN(parseFloat(maxAmount))) { filters.max = parseFloat(maxAmount) }
		if (ratioMin !== "" && !isNaN(parseFloat(ratioMin))) { filters.ratio_min = parseFloat(ratioMin) }
		if (ratioMax !== "" && !isNaN(parseFloat(ratioMax))) { filters.ratio_max = parseFloat(ratioMax) }
		if (onlyKyc) { filters.only_kyc = 1 }
		if (onlyVip) { filters.only_vip = 1 }
		return filters
	}, [typeFilter, selectedCoin?.tick, minAmount, maxAmount, ratioMin, ratioMax, showMine, onlyKyc, onlyVip])

	// Coins for selector
	const [availableCoins, setAvailableCoins] = useState([])
	const [coinSearch, setCoinSearch] = useState("")
	const [loadingCoins, setLoadingCoins] = useState(false)

	// Get the Latest P2P Offers
	const fetchP2POffers = async (isRefresh = false) => {
		try {
			isRefresh ? setRefreshing(true) : setIsLoadingData(true)
			setError(null)
			const response = await p2pApi.index(apiFilters)
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
		else { setIsLoadingData(false) }
	}, [])

	// Configure header buttons locally to avoid non-serializable params
	useEffect(() => {
		navigation.setOptions({
			headerRight: () => (
				<>
					<Pressable style={containerStyles.headerRight} onPress={() => setShowFiltersModal(true)}>
						<FontAwesome6 name="filter" size={20} color={hasActiveFilters ? theme.colors.primary : theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
					<Pressable style={containerStyles.headerRight} onPress={() => navigation.navigate(ROUTES.P2P_CREATE_SCREEN)}>
						<FontAwesome6 name="plus" size={24} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</>
			)
		})
	}, [navigation, theme, hasActiveFilters])

	// Load coins for coin picker (on demand)
	useEffect(() => {
		let mounted = true
		const loadCoins = async () => {
			try {
				setLoadingCoins(true)
				const res = await coinsApi.index({ enabled_p2p: true })
				if (mounted && res.success) { setAvailableCoins(res.data || []) }
			} catch (e) { /* ignore */ }
			finally { if (mounted) setLoadingCoins(false) }
		}
		// Preload coins once on mount
		loadCoins()
		return () => { mounted = false }
	}, [])

	// Handle refresh
	const onRefresh = () => { fetchP2POffers(true) }

	// Render offer item
	const renderOffer = ({ item }) => <P2POffer offer={item} navigation={navigation} />

	// Loading component
	if (isLoadingData && !refreshing) { return <QPLoader /> }

	return (
		<View style={containerStyles.subContainer}>

			{p2pEnabled ? (
				<FlatList
					data={p2pOffers}
					renderItem={renderOffer}
					keyExtractor={(item) => item.uuid}
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
			)}

			{/* Filters Modal */}
			<Modal visible={showFiltersModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowFiltersModal(false) }}>
				<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>

					<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
						<Text style={textStyles.h4}>Filtros</Text>
						<Pressable onPress={() => setShowFiltersModal(false)} style={styles.closeButton}>
							<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					</View>

					<ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
						{/* Show My Offers */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Mis ofertas</Text>
							<Switch
								value={showMine}
								onValueChange={setShowMine}
								trackColor={{ true: theme.colors.primary }}
								style={{ width: 50, height: 30 }}
							/>
						</View>

						{/* Type */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Tipo</Text>
							<QPSwitch
								value={typeFilter === "buy" ? "left" : typeFilter === "sell" ? "right" : null}
								onChange={(side) => setTypeFilter(side === "left" ? "buy" : side === "right" ? "sell" : null)}
								leftText="Comprar"
								rightText="Vender"
								leftColor={theme.colors.success}
								rightColor={theme.colors.danger}
								style={{ width: 160, height: 30 }}
							/>
						</View>

						{/* Coin */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Moneda</Text>
							<Pressable style={[styles.coinSelector, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border, width: 160 }]} onPress={() => { setShowCoinPicker(true); setShowFiltersModal(false) }}>
								{selectedCoin ? (
									<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
										<QPCoin coin={selectedCoin.logo} size={20} />
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: "600" }]}>{selectedCoin.tick}</Text>
										<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
									</View>
								) : (
									<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
										<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>Seleccionar</Text>
										<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
									</View>
								)}
							</Pressable>
						</View>

						{/* Min / Max */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Mínimo</Text>
							<View style={{ width: 160 }}>
								<QPInput value={minAmount} onChangeText={setMinAmount} placeholder="0" keyboardType="numeric" />
							</View>
						</View>
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Máximo</Text>
							<View style={{ width: 160 }}>
								<QPInput value={maxAmount} onChangeText={setMaxAmount} placeholder="0" keyboardType="numeric" />
							</View>
						</View>

						{/* Ratio Min / Max */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Ratio mín</Text>
							<View style={{ width: 160 }}>
								<QPInput value={ratioMin} onChangeText={setRatioMin} placeholder="0" keyboardType="numeric" />
							</View>
						</View>
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Ratio máx</Text>
							<View style={{ width: 160 }}>
								<QPInput value={ratioMax} onChangeText={setRatioMax} placeholder="0" keyboardType="numeric" />
							</View>
						</View>

						{/* Only KYC / VIP */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Solo KYC</Text>
							<View style={{ marginLeft: 16 }}>
								<Switch
									value={onlyKyc}
									onValueChange={setOnlyKyc}
									trackColor={{ true: theme.colors.primary }}
									style={{ width: 50, height: 30 }}
								/>
							</View>
						</View>
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Solo VIP</Text>
							<View style={{ marginLeft: 16 }}>
								<Switch
									value={onlyVip}
									onValueChange={setOnlyVip}
									trackColor={{ true: theme.colors.primary }}
									style={{ width: 50, height: 30 }}
								/>
							</View>
						</View>
					</ScrollView>

					{/* Bottom buttons */}
					<View style={[{ paddingHorizontal: 10, paddingBottom: insets.bottom || 20, flexDirection: "row", justifyContent: "space-between", gap: 10 }]}>
						<QPButton
							title="Limpiar"
							onPress={() => { setShowMine(false); setTypeFilter(null); setSelectedCoin(null); setMinAmount(""); setMaxAmount(""); setRatioMin(""); setRatioMax(""); setOnlyKyc(false); setOnlyVip(false); }}
							style={[styles.clearButton, { borderColor: theme.colors.border, backgroundColor: "transparent" }]}
							textStyle={{ color: theme.colors.secondaryText }}
						/>
						<QPButton
							title="Aplicar"
							onPress={() => { setShowFiltersModal(false); fetchP2POffers(true) }}
							style={[styles.applyButton, { backgroundColor: theme.colors.primary }]}
							textStyle={{ color: theme.colors.primaryText }}
						/>
					</View>
				</SafeAreaView>
			</Modal>

			{/* Coin Picker Modal */}
			<Modal visible={showCoinPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowCoinPicker(false); setShowFiltersModal(true) }}>
				<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
					<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
						<Text style={textStyles.h4}>Seleccionar Moneda</Text>
						<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
							<Pressable onPress={() => { setShowCoinPicker(false); setShowFiltersModal(true) }} style={styles.closeButton}>
								<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						</View>
					</View>
					<View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
						<QPInput value={coinSearch} onChangeText={setCoinSearch} placeholder="Buscar moneda..." prefixIconName="magnifying-glass" />
					</View>
					<ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true}>
						{loadingCoins ? (
							<View style={styles.loadingContainer}>
								<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>Cargando monedas...</Text>
							</View>
						) : (availableCoins || []).length > 0 ? (
							(availableCoins || [])
								.filter((coin) => coin.name.toLowerCase().includes((coinSearch || "").toLowerCase()) || coin.tick.toLowerCase().includes((coinSearch || "").toLowerCase()))
								.map((coin) => (
									<Pressable key={coin.id} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]} onPress={() => { setSelectedCoin(coin); setShowCoinPicker(false); setShowFiltersModal(true) }}>
										<QPCoin coin={coin.logo} size={40} />
										<View style={{ marginLeft: 12, flex: 1 }}>
											<Text style={textStyles.h4}>{coin.name}</Text>
											<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Ticker: {coin.tick}</Text>
										</View>
									</Pressable>
								))
						) : (
							<View style={styles.loadingContainer}>
								<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>No hay monedas disponibles</Text>
							</View>
						)}
					</ScrollView>
				</SafeAreaView>
			</Modal>

		</View>
	)
}

const styles = StyleSheet.create({
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 40,
	},
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	coinSelector: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 0.5,
		minWidth: 140,
		alignItems: "center",
		justifyContent: "center",
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
	},
	// Modal styles
	modalContainer: {
		flex: 1
	},
	modalHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingVertical: 15,
		borderBottomWidth: 0.5,
	},
	closeButton: { padding: 5 },
	coinList: { flex: 1 },
	coinListContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
	coinItem: {
		flexDirection: "row",
		alignItems: "center",
		padding: 15,
		borderRadius: 10,
		marginBottom: 10,
		borderWidth: 0.5,
		borderColor: "rgba(255, 255, 255, 0.2)",
	},
	loadingContainer: {
		alignItems: "center",
		justifyContent: "center",
		padding: 40,
	},
	clearButton: {
		flex: 1,
		borderWidth: 1,
	},
	applyButton: {
		flex: 1,
	}
})

export default P2P
