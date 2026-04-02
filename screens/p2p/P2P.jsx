import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { View, Text, StyleSheet, Modal, Pressable, Switch, ScrollView, Platform, useWindowDimensions, ActivityIndicator } from "react-native"
import { FlashList } from "@shopify/flash-list"

// Reanimated
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from "react-native-reanimated"

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
import QPInput from "../../ui/particles/QPInput"
import QPSwitch from "../../ui/particles/QPSwitch"
import QPCoin from "../../ui/particles/QPCoin"
import QPCoinPicker from "../../ui/QPCoinPicker"

// Toast
import { toast } from "sonner-native"

// Lottie
import LottieView from "lottie-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"


// Routes
import { ROUTES } from "../../routes"
import { useFocusEffect } from "@react-navigation/native"

// Pull-to-refresh
import { createHiddenRefreshControl } from "../../ui/QPRefreshIndicator"

// Bottom bar hide on scroll (Android only)
import { useBottomBar } from "../../ui/BottomBarContext"

// Default popular coins for quick select pills
const DEFAULT_POPULAR_COINS = [
	{ tick: "BANK_CUP", label: "CUP" },
	{ tick: "BANK_MLC", label: "MLC" },
	{ tick: "CLASICA", label: "Clásica" },
	{ tick: "ETECSA", label: "ETECSA" },
]
const RECENT_COINS_KEY = "qp_recent_p2p_coins"

// Sort options for cycling
const SORT_OPTIONS = [
	{ label: "Reciente", orderBy: "updated_at", orderType: "desc" },
	{ label: "Monto ↓", orderBy: "amount", orderType: "desc" },
	{ label: "Monto ↑", orderBy: "amount", orderType: "asc" },
	{ label: "Ratio ↓", orderBy: "ratio", orderType: "desc" },
	{ label: "Ratio ↑", orderBy: "ratio", orderType: "asc" },
]

// P2P component
const P2P = ({ navigation, route }) => {

	// User
	const { user } = useAuth()

	// Theme Context
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()
	const { height: windowHeight } = useWindowDimensions()

	// Bottom bar (Android scroll-hide)
	const { bottomBarVisible } = useBottomBar()

	// Reset bottom bar when leaving P2P tab
	useFocusEffect(
		useCallback(() => {
			return () => { bottomBarVisible.value = withTiming(1, { duration: 250 }) }
		}, [bottomBarVisible])
	)

	// States
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingData, setIsLoadingData] = useState(true)
	const [p2pOffers, setP2pOffers] = useState([])
	const [refreshing, setRefreshing] = useState(false)
	const [error, setError] = useState(null)
	const lastFetchRef = useRef(0)
	const [p2pEnabled, setP2pEnabled] = useState(user.p2p_enabled)
	const [page, setPage] = useState(1)
	const [hasMore, setHasMore] = useState(true)

	// modal Show Hide
	const [showFiltersModal, setShowFiltersModal] = useState(false)
	const [showCoinPicker, setShowCoinPicker] = useState(false)
	const [showSortMenu, setShowSortMenu] = useState(false)

	// Quick filter states — accept initial coin from navigation params
	const [typeFilter, setTypeFilter] = useState(null)
	const [selectedCoin, setSelectedCoin] = useState(route?.params?.coin ? { tick: route.params.coin, name: route.params.coinName || route.params.coin, logo: route.params.coin } : null)
	const [sortIndex, setSortIndex] = useState(0)

	// Update coin filter when navigating back with different params
	useEffect(() => {
		if (route?.params?.coin) {
			const tick = route.params.coin
			setSelectedCoin({ tick, name: route.params.coinName || tick, logo: tick })
		}
	}, [route?.params?.coin, route?.params?.coinName])

	// Modal filter states
	const [showMine, setShowMine] = useState(false)
	const [minAmount, setMinAmount] = useState("")
	const [maxAmount, setMaxAmount] = useState("")
	const [ratioMin, setRatioMin] = useState("")
	const [ratioMax, setRatioMax] = useState("")
	const [onlyVip, setOnlyVip] = useState(false)

	// Scroll-hide filter bar (Twitter-style)
	const lastScrollY = useSharedValue(0)
	const filterBarVisible = useSharedValue(1)
	const filterBarHeight = useSharedValue(50)
	const scrollDirection = useSharedValue(0)
	const accumulatedDelta = useSharedValue(0)

	const handleScroll = useCallback((event) => {
		const currentY = event.nativeEvent.contentOffset.y
		const diff = currentY - lastScrollY.value

		if (currentY <= 0) {
			filterBarVisible.value = withTiming(1, { duration: 250 })
			bottomBarVisible.value = withTiming(1, { duration: 250 })
			accumulatedDelta.value = 0
		} else {
			const dir = diff > 0 ? 1 : diff < 0 ? -1 : 0
			if (dir !== 0) {
				if (dir === scrollDirection.value) {
					accumulatedDelta.value += Math.abs(diff)
				} else {
					accumulatedDelta.value = Math.abs(diff)
					scrollDirection.value = dir
				}
				if (accumulatedDelta.value > 20) {
					if (dir === 1 && filterBarVisible.value !== 0) {
						filterBarVisible.value = withTiming(0, { duration: 250 })
						bottomBarVisible.value = withTiming(0, { duration: 250 })
					} else if (dir === -1 && filterBarVisible.value !== 1) {
						filterBarVisible.value = withTiming(1, { duration: 250 })
						bottomBarVisible.value = withTiming(1, { duration: 250 })
					}
				}
			}
		}

		lastScrollY.value = currentY
	}, [lastScrollY, filterBarVisible, bottomBarVisible, accumulatedDelta, scrollDirection])

	const filterBarStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: interpolate(filterBarVisible.value, [0, 1], [-filterBarHeight.value, 0]) }],
		marginBottom: interpolate(filterBarVisible.value, [0, 1], [-filterBarHeight.value, 0]),
		opacity: filterBarVisible.value,
	}))

	// Derived sort values
	const orderBy = SORT_OPTIONS[sortIndex].orderBy
	const orderType = SORT_OPTIONS[sortIndex].orderType

	// Whether any non-default filter is active
	const hasActiveFilters = useMemo(() => {
		return (
			showMine ||
			!!selectedCoin?.tick ||
			minAmount !== "" ||
			maxAmount !== "" ||
			ratioMin !== "" ||
			ratioMax !== "" ||
			onlyVip ||
			typeFilter
		)
	}, [showMine, selectedCoin?.tick, minAmount, maxAmount, ratioMin, ratioMax, onlyVip, typeFilter])

	// Filters object used for API
	const PAGE_SIZE = 30
	const apiFilters = useMemo(() => {
		const filters = {
			take: PAGE_SIZE,
			order: orderType,
			orderBy: orderBy,
			type: typeFilter,
		}
		if (showMine) { filters.my = true }
		if (selectedCoin?.tick) { filters.coin = selectedCoin.tick }
		if (minAmount !== "" && !isNaN(parseFloat(minAmount))) { filters.min = parseFloat(minAmount) }
		if (maxAmount !== "" && !isNaN(parseFloat(maxAmount))) { filters.max = parseFloat(maxAmount) }
		if (ratioMin !== "" && !isNaN(parseFloat(ratioMin))) { filters.ratio_min = parseFloat(ratioMin) }
		if (ratioMax !== "" && !isNaN(parseFloat(ratioMax))) { filters.ratio_max = parseFloat(ratioMax) }
		if (onlyVip) { filters.only_vip = 1 }
		return filters
	}, [typeFilter, selectedCoin?.tick, minAmount, maxAmount, ratioMin, ratioMax, showMine, onlyVip, orderBy, orderType])

	// Coins for selector
	const [availableCoins, setAvailableCoins] = useState([])
	const [loadingCoins, setLoadingCoins] = useState(false)

	// Get the Latest P2P Offers
	const fetchP2POffers = useCallback(async (pageNum = 1, isRefresh = false) => {
		if (isLoading) return
		try {
			if (isRefresh) { setRefreshing(true) }
			else if (pageNum === 1) { setIsLoadingData(true) }
			else { setIsLoading(true) }
			setError(null)
			const response = await p2pApi.index({ ...apiFilters, page: pageNum })
			if (response.success) {
				const newData = response.offers || []
				if (isRefresh || pageNum === 1) {
					setP2pOffers(newData)
				} else {
					setP2pOffers(prev => [...prev, ...newData])
				}
				setHasMore(newData.length >= PAGE_SIZE)
				setPage(pageNum)
			} else {
				setError(response.error || "Error al cargar las ofertas P2P")
				toast.error(response.error || "Error al cargar las ofertas P2P")
			}
		} catch (err) {
			const errorMessage = "Error de conexión"
			setError(errorMessage)
			toast.error(errorMessage)
		} finally {
			setIsLoadingData(false)
			setIsLoading(false)
			setRefreshing(false)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [apiFilters])

	// Load data on component mount
	useEffect(() => {
		if (p2pEnabled) { fetchP2POffers(1) }
		else { setIsLoadingData(false) }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Auto-fetch when quick filters change (type, coin, sort)
	const isFirstRender = useRef(true)
	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false
			return
		}
		if (p2pEnabled) { fetchP2POffers(1, true) }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [typeFilter, selectedCoin?.tick, orderBy, orderType, showMine])

	// Toggle my offers filter
	const toggleMyOffers = useCallback(() => {
		setShowMine(prev => !prev)
	}, [])

	// Configure header buttons locally to avoid non-serializable params
	useEffect(() => {
		navigation.setOptions({
			headerRight: () => (
				<>
					<Pressable style={containerStyles.headerRight} onPress={toggleMyOffers}>
						<FontAwesome6 name="rectangle-list" size={20} color={showMine ? theme.colors.primary : theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
					<Pressable style={containerStyles.headerRight} onPress={() => setShowFiltersModal(true)}>
						<FontAwesome6 name="filter" size={20} color={hasActiveFilters ? theme.colors.primary : theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
					<Pressable style={containerStyles.headerRight} onPress={() => navigation.navigate(ROUTES.P2P_CREATE_SCREEN)}>
						<FontAwesome6 name="plus" size={24} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</>
			),
			...(Platform.OS === 'ios' && {
				unstable_headerRightItems: () => [
					{
						type: 'button',
						label: 'Mis Ofertas',
						icon: { type: 'sfSymbol', name: 'list.bullet.rectangle' },
						onPress: toggleMyOffers,
						tintColor: showMine ? theme.colors.primary : theme.colors.primaryText,
					},
					{
						type: 'button',
						label: 'Filtros',
						icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease.circle' },
						onPress: () => setShowFiltersModal(true),
						tintColor: hasActiveFilters ? theme.colors.primary : theme.colors.primaryText,
					},
					{
						type: 'button',
						label: 'Crear',
						icon: { type: 'sfSymbol', name: 'plus' },
						onPress: () => navigation.navigate(ROUTES.P2P_CREATE_SCREEN),
					},
				],
			}),
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [navigation, theme, hasActiveFilters, showMine, toggleMyOffers])

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
	const onRefresh = () => { setHasMore(true); fetchP2POffers(1, true) }

	// Load more on scroll end
	const handleLoadMore = useCallback(() => {
		if (!isLoading && hasMore) { fetchP2POffers(page + 1) }
	}, [isLoading, hasMore, page, fetchP2POffers])

	// Footer loader
	const renderFooter = () => {
		if (!isLoading || p2pOffers.length === 0) return null
		return (
			<View style={{ paddingVertical: 20, alignItems: 'center' }}>
				<ActivityIndicator size="small" color={theme.colors.primary} />
			</View>
		)
	}

	// Active filters badges (for modal filters only)
	const activeFilterBadges = useMemo(() => {
		const badges = []
		if (showMine) badges.push({ key: "showMine", label: "Mis ofertas", onRemove: () => setShowMine(false) })
		if (minAmount !== "") badges.push({ key: "minAmount", label: `Min: $${minAmount}`, onRemove: () => setMinAmount("") })
		if (maxAmount !== "") badges.push({ key: "maxAmount", label: `Max: $${maxAmount}`, onRemove: () => setMaxAmount("") })
		if (ratioMin !== "") badges.push({ key: "ratioMin", label: `Ratio ≥ ${ratioMin}`, onRemove: () => setRatioMin("") })
		if (ratioMax !== "") badges.push({ key: "ratioMax", label: `Ratio ≤ ${ratioMax}`, onRemove: () => setRatioMax("") })
		if (onlyVip) badges.push({ key: "onlyVip", label: "Solo VIP", onRemove: () => setOnlyVip(false) })
		return badges
	}, [showMine, minAmount, maxAmount, ratioMin, ratioMax, onlyVip])

	// Remove a filter badge and re-fetch
	const handleRemoveBadge = (badge) => {
		badge.onRemove()
		// Schedule re-fetch after state update
		setTimeout(() => fetchP2POffers(1, true), 0)
	}

	// Render offer item
	const renderOffer = ({ item }) => <P2POffer offer={item} navigation={navigation} />

	return (
		<View style={containerStyles.subContainer}>
			{p2pEnabled ? (
				<>
					{/* Quick Filters Bar */}
					<Animated.View onLayout={(e) => { filterBarHeight.value = e.nativeEvent.layout.height }} style={filterBarStyle}>

						<View style={styles.quickFiltersBar}>

							{/* Buy/Sell Switch */}
							<QPSwitch
								value={typeFilter === "sell" ? "left" : typeFilter === "buy" ? "right" : null}
								onChange={(side) => setTypeFilter(side === "left" ? "sell" : side === "right" ? "buy" : null)}
								leftText="Comprar"
								rightText="Vender"
								leftColor={theme.colors.danger}
								rightColor={theme.colors.success}
								rightTextColor={theme.colors.almostBlack}
								style={{ width: 150, height: 32 }}
							/>

							<View style={{ flex: 1 }} />

							{/* Coin Pill */}
							<Pressable style={[styles.filterPill, { backgroundColor: selectedCoin ? theme.colors.primary : theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => setShowCoinPicker(true)} >
								{selectedCoin ? (
									<View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
										<QPCoin coin={selectedCoin.logo} size={16} />
										<Text style={[textStyles.caption, { color: theme.colors.almostWhite, fontWeight: "600" }]}>{selectedCoin.tick}</Text>
										<Pressable onPress={() => setSelectedCoin(null)} hitSlop={8}>
											<FontAwesome6 name="xmark" size={10} color={theme.colors.almostWhite} iconStyle="solid" />
										</Pressable>
									</View>
								) : (
									<View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
										<FontAwesome6 name="coins" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
										<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Moneda</Text>
									</View>
								)}
							</Pressable>

							{/* Sort Pill */}
							<Pressable style={[styles.filterPill, { backgroundColor: sortIndex > 0 || showSortMenu ? theme.colors.primary : theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => setShowSortMenu((prev) => !prev)}>
								<FontAwesome6 name="arrow-down-short-wide" size={12} color={sortIndex > 0 || showSortMenu ? theme.colors.almostWhite : theme.colors.secondaryText} iconStyle="solid" />
							</Pressable>
						</View>

						{/* Sort Menu */}
						{showSortMenu && (
							<View style={styles.activeBadgesBar}>
								{SORT_OPTIONS.map((option, idx) => (
									<Pressable key={idx} style={[styles.activeBadge, { backgroundColor: sortIndex === idx ? theme.colors.primary : theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border }]} onPress={() => { setSortIndex(idx); setShowSortMenu(false) }} >
										<Text style={[textStyles.caption, { color: sortIndex === idx ? theme.colors.almostWhite : theme.colors.primaryText, fontSize: theme.typography.fontSize.xs }]}>{option.label}</Text>
									</Pressable>
								))}
							</View>
						)}

						{/* Active Filter & Sort Badges */}
						{(activeFilterBadges.length > 0 || sortIndex > 0) && (
							<View style={styles.activeBadgesBar}>
								{sortIndex > 0 && (
									<Pressable style={[styles.activeBadge, { backgroundColor: theme.colors.primary }]} onPress={() => setSortIndex(0)} >
										<Text style={[textStyles.caption, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.xs }]}>{SORT_OPTIONS[sortIndex].label}</Text>
										<FontAwesome6 name="xmark" size={10} color={theme.colors.almostWhite} iconStyle="solid" />
									</Pressable>
								)}
								{activeFilterBadges.map((badge) => (
									<Pressable key={badge.key} style={[styles.activeBadge, { backgroundColor: theme.colors.primary }]} onPress={() => handleRemoveBadge(badge)} >
										<Text style={[textStyles.caption, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.xs }]}>{badge.label}</Text>
										<FontAwesome6 name="xmark" size={10} color={theme.colors.almostWhite} iconStyle="solid" />
									</Pressable>
								))}
							</View>
						)}
					</Animated.View>

					<FlashList
						data={p2pOffers}
						renderItem={renderOffer}
						keyExtractor={(item) => item.uuid}
						onScroll={handleScroll}
						scrollEventThrottle={16}
						refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 64 + insets.bottom : 24 }}
						onEndReached={handleLoadMore}
						onEndReachedThreshold={0.3}
						ListFooterComponent={renderFooter}
						ListEmptyComponent={
							<View style={styles.emptyContainer}>
								<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: "center" }]}>
									{error ? error : "No hay ofertas P2P disponibles"}
								</Text>
							</View>
						}
						estimatedItemSize={120}
					/>
				</>
			) : (
				<View style={styles.emptyContainer}>
					<LottieView source={require("../../assets/lotties/cancelled.json")} autoPlay loop={false} style={{ width: 250, height: 250 }} />
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: "center" }]}>P2P no está habilitado</Text>
				</View>
			)}

			{/* Filters Modal */}
			<Modal visible={showFiltersModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { setShowFiltersModal(false) }}>
				<Pressable style={styles.overlay} onPress={() => setShowFiltersModal(false)}>
					<Pressable style={[styles.filterCard, { backgroundColor: theme.colors.surface, maxHeight: windowHeight * 0.75 }]} onPress={() => { }}>

						{/* Header */}
						<View style={styles.filterCardHeader}>
							<FontAwesome6 name="sliders" size={20} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.h3, { flex: 1, marginLeft: 12 }]}>Filtros</Text>
							<Pressable onPress={() => setShowFiltersModal(false)} hitSlop={12}>
								<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						</View>

						<ScrollView showsVerticalScrollIndicator={false} bounces={false}>
							{/* Show My Offers */}
							<View style={styles.rowBetween}>
								<Text style={textStyles.h6}>Mis ofertas</Text>
								<Switch
									value={showMine}
									onValueChange={setShowMine}
									trackColor={{ true: theme.colors.primary }}
									style={{ transform: [{ scale: 0.85 }] }}
								/>
							</View>

							{/* Type */}
							<View style={styles.rowBetween}>
								<Text style={textStyles.h6}>Tipo</Text>
								<QPSwitch
									value={typeFilter === "sell" ? "left" : typeFilter === "buy" ? "right" : null}
									onChange={(side) => setTypeFilter(side === "left" ? "sell" : side === "right" ? "buy" : null)}
									leftText="Comprar"
									rightText="Vender"
									leftColor={theme.colors.danger}
									rightColor={theme.colors.success}
									rightTextColor={theme.colors.almostBlack}
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

							{/* Only VIP */}
							<View style={styles.rowBetween}>
								<Text style={textStyles.h6}>Solo VIP</Text>
								<Switch
									value={onlyVip}
									onValueChange={setOnlyVip}
									trackColor={{ true: theme.colors.primary }}
									style={{ transform: [{ scale: 0.85 }] }}
								/>
							</View>
						</ScrollView>

						{/* Action buttons */}
						<View style={styles.filterCardActions}>
							<Pressable
								onPress={() => { setShowMine(false); setTypeFilter(null); setSelectedCoin(null); setMinAmount(""); setMaxAmount(""); setRatioMin(""); setRatioMax(""); setOnlyVip(false); setSortIndex(0); }}
								style={[styles.filterCardActionButton, { backgroundColor: theme.colors.elevation }]}
							>
								<Text style={[styles.filterCardActionText, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>Limpiar</Text>
							</Pressable>
							<Pressable
								onPress={() => { setShowFiltersModal(false); fetchP2POffers(1, true) }}
								style={[styles.filterCardActionButton, { backgroundColor: theme.colors.primary, flex: 1 }]}
							>
								<Text style={[styles.filterCardActionText, { color: "#FFFFFF", fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>Aplicar</Text>
							</Pressable>
						</View>

					</Pressable>
				</Pressable>
			</Modal>

			{/* Coin Picker Modal */}
			<QPCoinPicker
				visible={showCoinPicker}
				onClose={() => setShowCoinPicker(false)}
				onSelect={(coin) => { setSelectedCoin(coin); setShowCoinPicker(false) }}
				coins={availableCoins}
				selectedCoin={selectedCoin}
				isLoading={loadingCoins}
				showFees={false}
				recentKey={RECENT_COINS_KEY}
				defaultCoins={DEFAULT_POPULAR_COINS}
			/>

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
	quickFiltersBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 6,
		paddingHorizontal: 2,
	},
	filterPill: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 10,
		height: 32,
		borderRadius: 16,
		borderWidth: 0.5,
	},
	activeBadgesBar: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 6,
		paddingHorizontal: 2,
		marginBottom: 4,
	},
	activeBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
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
	// Filter card modal (Contacts-style)
	overlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.6)",
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	filterCard: {
		width: "100%",
		borderRadius: 16,
		padding: 24,
	},
	filterCardHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 8,
	},
	filterCardActions: {
		flexDirection: "row",
		gap: 12,
		marginTop: 16,
	},
	filterCardActionButton: {
		paddingVertical: 14,
		paddingHorizontal: 24,
		borderRadius: 25,
		alignItems: "center",
		justifyContent: "center",
	},
	filterCardActionText: {},
})

export default P2P
