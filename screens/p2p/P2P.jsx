import { FlashList } from "@shopify/flash-list"
import { useEffect, useReducer, useCallback, useRef } from "react"
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions, ActivityIndicator } from "react-native"

// Reanimated
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from "react-native-reanimated"

// Theme Context
import { useTheme } from "../../theme/ThemeContext"
import { useTextStyles, useContainerStyles } from "../../theme/themeUtils"

// User Context
import { useAuth } from "../../auth/AuthContext"

// UI
import P2POffer from "../../ui/P2POfferItem"
import QPCoinPicker from "../../ui/QPCoinPicker"
import QPSwitch from "../../ui/particles/QPSwitch"
import P2PRequirementsGate from "./P2PRequirementsGate"
import P2PFilterBar from "./P2PFilterBar"
import P2PFiltersModal from "./P2PFiltersModal"
import useP2PFilters from "./useP2PFilters"
import useP2POffers from "./useP2POffers"

// Icons
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// Routes
import { ROUTES } from "../../routes"
import { useFocusEffect } from "@react-navigation/native"

// Pull-to-refresh
import { createHiddenRefreshControl } from "../../ui/QPRefreshIndicator"

// Online Status
import { useOnlineStatus } from "../../hooks/OnlineStatusContext"

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

function modalsReducer(state, action) {
	switch (action.type) {
		case "set":
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/**
 * P2P marketplace tab: paginated FlashList of buy/sell offers with filters.
 * Offers load via `GET /p2p/index` (useP2POffers) filtered by type, coin, sort and
 * "mine"; accepts `route.params.coin`/`coinName` (e.g. from Invest) to pre-select
 * the coin filter. Access is gated by `user.p2p_enabled` (P2PRequirementsGate).
 * Offer creators/peers are tracked for live online presence, and the filter bar
 * hides on scroll (Twitter-style) along with the Android bottom bar.
 */
const P2P = ({ navigation, route }) => {

	// User
	const { user } = useAuth()

	// Theme Context
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const insets = useSafeAreaInsets()
	const { height: windowHeight, width: windowWidth } = useWindowDimensions()

	// Ancho del switch del header: lo más generoso que quepa sin acercarse al
	// avatar ni a los botones (reservamos ~190px para ellos), con tope para que
	// en pantallas anchas no se estire de más
	const headerSwitchWidth = Math.max(132, Math.min(168, windowWidth - 190))

	// Online status
	const { trackUsers, untrackUsers } = useOnlineStatus()

	// Bottom bar (Android scroll-hide)
	const { bottomBarVisible } = useBottomBar()

	// p2p access gate
	const p2pEnabled = user.p2p_enabled

	// Filters + derived API filters/badges
	const initialCoin = route?.params?.coin ? { tick: route.params.coin, name: route.params.coinName || route.params.coin, logo: route.params.coin } : null
	const { filters, setFilter, resetFilters, orderBy, orderType, hasActiveFilters, apiFilters, activeFilterBadges } = useP2PFilters(initialCoin)
	const { typeFilter, selectedCoin, sortIndex, showMine } = filters

	// Offers list + pagination + fetch
	const quickKey = `${typeFilter}|${selectedCoin?.tick}|${orderBy}|${orderType}|${showMine}`
	const { p2pOffers, isLoading, error, refreshing, availableCoins, loadingCoins, fetchP2POffers, onRefresh, handleLoadMore } = useP2POffers({ apiFilters, p2pEnabled, quickKey })

	// Modal visibility
	const [modals, dispatchModals] = useReducer(modalsReducer, { showFiltersModal: false, showCoinPicker: false, showSortMenu: false })
	const { showFiltersModal, showCoinPicker, showSortMenu } = modals
	const setShowFiltersModal = (value) => dispatchModals({ type: "set", field: "showFiltersModal", value })
	const setShowCoinPicker = (value) => dispatchModals({ type: "set", field: "showCoinPicker", value })
	const setShowSortMenu = (value) => dispatchModals({ type: "set", field: "showSortMenu", value })

	// Track P2P offer users for online status
	useEffect(() => {
		const ids = p2pOffers.flatMap(o => [o.User?.uuid, o.Peer?.uuid]).filter(Boolean)
		const unique = [...new Set(ids)]
		if (unique.length) trackUsers(unique)
		return () => { if (unique.length) untrackUsers(unique) }
	}, [p2pOffers, trackUsers, untrackUsers])

	// Update coin filter when navigating back with different params
	useEffect(() => {
		if (route?.params?.coin) {
			const tick = route.params.coin
			setFilter("selectedCoin", { tick, name: route.params.coinName || tick, logo: tick })
		}
	}, [route?.params?.coin, route?.params?.coinName, setFilter])

	// Scroll-hide filter bar (Twitter-style)
	const lastScrollY = useSharedValue(0)
	const filterBarVisible = useSharedValue(1)
	const filterBarHeight = useSharedValue(50)
	const scrollDirection = useSharedValue(0)
	const accumulatedDelta = useSharedValue(0)

	// Estado OBJETIVO de la barra (1 visible / 0 oculta). Imprescindible como
	// guardia: `filterBarVisible.value` devuelve el valor EN CURSO de la
	// animación (0.7, 0.4…), nunca exactamente 0 hasta que termina, así que
	// comparándolo se re-disparaba `withTiming` en cada evento de scroll y la
	// animación se reiniciaba ~15 veces seguidas — de ahí que el ocultado se
	// sintiera lento y elástico en vez de limpio.
	const filterBarTarget = useRef(1)

	const setBarsVisible = useCallback((visible) => {
		if (filterBarTarget.current === visible) return
		filterBarTarget.current = visible
		filterBarVisible.value = withTiming(visible, { duration: 250 })
		bottomBarVisible.value = withTiming(visible, { duration: 250 })
	}, [filterBarVisible, bottomBarVisible])

	const handleScroll = useCallback((event) => {
		const currentY = event.nativeEvent.contentOffset.y
		const diff = currentY - lastScrollY.value

		if (currentY <= 0) {
			setBarsVisible(1)
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
					setBarsVisible(dir === 1 ? 0 : 1)
				}
			}
		}

		lastScrollY.value = currentY
	}, [lastScrollY, accumulatedDelta, scrollDirection, setBarsVisible])

	// Al salir del tab se restauran AMBAS barras y el estado de scroll: antes
	// solo se reponía la bottom bar, así que al volver con la lista scrolleada
	// los filtros seguían escondidos y el `target` quedaba desincronizado (el
	// siguiente scroll hacia abajo ya no ocultaba la bottom bar)
	useFocusEffect(
		useCallback(() => {
			return () => {
				filterBarTarget.current = 1
				filterBarVisible.value = 1
				bottomBarVisible.value = withTiming(1, { duration: 250 })
				accumulatedDelta.value = 0
				scrollDirection.value = 0
				lastScrollY.value = 0
			}
		}, [filterBarVisible, bottomBarVisible, accumulatedDelta, scrollDirection, lastScrollY])
	)

	const filterBarStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: interpolate(filterBarVisible.value, [0, 1], [-filterBarHeight.value, 0]) }],
		marginBottom: interpolate(filterBarVisible.value, [0, 1], [-filterBarHeight.value, 0]),
		opacity: filterBarVisible.value,
	}))

	// Configure header buttons locally to avoid non-serializable params.
	// El switch Comprar/Vender vive en el TopBar como headerTitle (patrón de
	// los P2P de la industria: el lado del mercado se elige arriba del todo,
	// no entre los filtros)
	useEffect(() => {
		navigation.setOptions({
			// El header reparte el ancho entre izquierda/título/derecha, así que
			// con 1 elemento a la izquierda y 2 a la derecha el título nunca cae
			// en el centro real. Se saca de ese reparto con position absolute a
			// ancho completo: el switch queda centrado respecto a la PANTALLA.
			// El contenedor del header es `pointerEvents="box-none"`, así que la
			// franja vacía a los lados no roba toques a los botones.
			headerTitleAlign: 'center',
			headerTitleContainerStyle: styles.headerTitleContainer,
			headerTitle: () => (
				<View style={styles.headerSwitchWrap}>
					<QPSwitch
						value={typeFilter === "sell" ? "left" : typeFilter === "buy" ? "right" : null}
						onChange={(side) => setFilter("typeFilter", side === "left" ? "sell" : side === "right" ? "buy" : null)}
						leftText="Comprar"
						rightText="Vender"
						leftColor={theme.colors.danger}
						rightColor={theme.colors.successFill}
						rightTextColor={theme.colors.successFillText}
						style={[styles.headerSwitch, { width: headerSwitchWidth }]}
					/>
				</View>
			),
			// Solo dos botones: "Mis ofertas" era redundante (vive dentro del
			// modal de Filtros, que además enciende su icono y muestra el badge
			// activo) y su ancho hacía que el switch centrado se solapara
			headerRight: () => (
				<>
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
					{ type: 'button', label: 'Filtros', icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease.circle' }, onPress: () => setShowFiltersModal(true), tintColor: hasActiveFilters ? theme.colors.primary : theme.colors.primaryText },
					{ type: 'button', label: 'Crear', icon: { type: 'sfSymbol', name: 'plus' }, onPress: () => navigation.navigate(ROUTES.P2P_CREATE_SCREEN) },
				],
			}),
		})
	}, [navigation, theme, hasActiveFilters, containerStyles, typeFilter, setFilter, headerSwitchWidth])

	// Remove a filter badge and re-fetch
	const handleRemoveBadge = (badge) => {
		badge.onRemove()
		setTimeout(() => fetchP2POffers(1, true), 0)
	}

	// Footer loader
	const renderFooter = () => {
		if (!isLoading || p2pOffers.length === 0) return null
		return (
			<View style={{ paddingVertical: 20, alignItems: 'center' }}>
				<ActivityIndicator size="small" color={theme.colors.primary} />
			</View>
		)
	}

	const renderOffer = ({ item }) => <P2POffer offer={item} navigation={navigation} />

	if (!p2pEnabled) { return <P2PRequirementsGate user={user} navigation={navigation} theme={theme} textStyles={textStyles} containerStyles={containerStyles} /> }

	return (
		<View style={containerStyles.subContainer}>
			{/* Quick Filters Bar (scroll-hide) */}
			<Animated.View onLayout={(e) => { filterBarHeight.value = e.nativeEvent.layout.height }} style={filterBarStyle}>
				<P2PFilterBar
					selectedCoin={selectedCoin}
					sortIndex={sortIndex}
					showSortMenu={showSortMenu}
					activeFilterBadges={activeFilterBadges}
					onOpenCoinPicker={() => setShowCoinPicker(true)}
					onClearCoin={() => setFilter("selectedCoin", null)}
					onToggleSortMenu={() => setShowSortMenu(!showSortMenu)}
					onSelectSort={(idx) => { setFilter("sortIndex", idx); setShowSortMenu(false) }}
					onClearSort={() => setFilter("sortIndex", 0)}
					onRemoveBadge={handleRemoveBadge}
					theme={theme}
					textStyles={textStyles}
				/>
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

			{/* Filters Modal */}
			<P2PFiltersModal
				visible={showFiltersModal}
				onClose={() => setShowFiltersModal(false)}
				filters={filters}
				setFilter={setFilter}
				onOpenCoinPicker={() => { setShowCoinPicker(true); setShowFiltersModal(false) }}
				onClear={resetFilters}
				onApply={() => { setShowFiltersModal(false); fetchP2POffers(1, true) }}
				windowHeight={windowHeight}
				theme={theme}
				textStyles={textStyles}
			/>

			{/* Coin Picker Modal */}
			<QPCoinPicker
				visible={showCoinPicker}
				onClose={() => setShowCoinPicker(false)}
				onSelect={(coin) => { setFilter("selectedCoin", coin); setShowCoinPicker(false) }}
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
	headerTitleContainer: {
		position: 'absolute',
		left: 0,
		right: 0,
		// Sin top/bottom el contenedor absolute toma la altura de su contenido y
		// se ancla arriba: hay que estirarlo a toda la altura para que el
		// justifyContent 'center' centre de verdad contra los botones
		top: 0,
		bottom: 0,
		// El header calcula un maxWidth para el título restando el ancho de los
		// botones ((80 + 16) * 2 ≈ 192px): sin anularlo, el contenedor absolute
		// se queda con ~168px anclados a la izquierda y el switch aparece
		// pegado al avatar. Igual con el marginHorizontal 16 que aplica solo.
		maxWidth: '100%',
		marginHorizontal: 0,
		alignItems: 'center',
		justifyContent: 'center',
		// Los iconos del header llevan paddingBottom 10 (containerStyles
		// .headerLeft/.headerRight): el switch necesita el mismo para compartir
		// línea base con ellos, si no queda "flotando" más abajo
		paddingBottom: 10,
	},
	headerSwitchWrap: {
		alignItems: 'center',
		justifyContent: 'center',
	},
	// El ancho lo calcula la pantalla (headerSwitchWidth): comparte espacio con
	// el avatar y los botones del header
	headerSwitch: {
		height: 34,
	},
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 40,
	},
})

export default P2P
