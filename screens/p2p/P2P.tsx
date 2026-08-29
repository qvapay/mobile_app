import { FlashList } from "@shopify/flash-list"
import type { FlashListProps } from "@shopify/flash-list"
import { useEffect, useReducer, useCallback, useMemo, useRef } from "react"
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions, ActivityIndicator } from "react-native"
import { useTranslation } from "react-i18next"

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
import { missingP2PRequirements } from "./p2pRequirements"
import P2PFilterBar from "./P2PFilterBar"
import P2PFiltersModal from "./P2PFiltersModal"
import useP2PFilters, { SORT_OPTIONS } from "./useP2PFilters"
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

import type { NativeScrollEvent, NativeSyntheticEvent, RefreshControlProps } from "react-native"
import type { ComponentType, ReactElement } from "react"
import type { CompositeScreenProps, NavigationProp } from "@react-navigation/native"
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { MainTabParamList, RootStackParamList } from "../../types/navigation"
// `P2POffer` ya nombra al COMPONENTE de item importado arriba: el tipo entra con alias
import type { Coin, P2POffer as P2POfferModel } from "../../types/domain"
import type { P2PFilterBadge } from "./useP2PFilters"

/**
 * P2P vive en el bottom-tab de MainStack pero navega al stack raíz
 * (P2PCreate/P2POffer), de ahí el composite.
 */
type P2PScreenProps = CompositeScreenProps<
	BottomTabScreenProps<MainTabParamList, 'P2P'>,
	NativeStackScreenProps<RootStackParamList>
>

/** Visibilidad de los tres modales de la pantalla. */
type ModalsState = { showFiltersModal: boolean, showCoinPicker: boolean, showSortMenu: boolean }

type ModalsAction = { type: "set", field: keyof ModalsState, value: boolean }

/**
 * P2POfferItem y P2PRequirementsGate tipan su `navigation` como el
 * `NavigationProp` del stack RAÍZ; aquí llega la composite del tab, que navega
 * a las mismas rutas pero no es asignable estructuralmente. Alias del cast.
 */
type RootNav = NavigationProp<RootStackParamList>

/**
 * FlashList 2 ya no declara `estimatedItemSize` (mide sola), pero la pantalla lo
 * sigue pasando: se preserva el runtime tal cual ensanchando el tipo del componente.
 */
const OffersFlashList = FlashList as ComponentType<FlashListProps<P2POfferModel> & { estimatedItemSize?: number }>

// Default popular coins for quick select pills
const DEFAULT_POPULAR_COINS = [
	{ tick: "BANK_CUP", label: "CUP" },
	{ tick: "BANK_MLC", label: "MLC" },
	{ tick: "CLASICA", label: "Clásica" },
	{ tick: "ETECSA", label: "ETECSA" },
]
const RECENT_COINS_KEY = "qp_recent_p2p_coins"

function modalsReducer(state: ModalsState, action: ModalsAction): ModalsState {
	switch (action.type) {
		case "set":
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

// Quitar un badge cambia los filtros, y de eso ya se encarga el refetch con
// debounce del quickKey: forzar aquí otro fetch costaba dos peticiones
const handleRemoveBadge = (badge: P2PFilterBadge) => { badge.onRemove() }

/**
 * P2P marketplace tab: paginated FlashList of buy/sell offers with filters.
 * Offers load via `GET /p2p/index` (useP2POffers) filtered by type, coin, sort and
 * "mine"; accepts `route.params.coin`/`coinName` (e.g. from Invest) to pre-select
 * the coin filter. Access is gated by `user.p2p_enabled` (P2PRequirementsGate).
 * Offer creators/peers are tracked for live online presence, and the filter bar
 * hides on scroll (Twitter-style) along with the Android bottom bar.
 */
const P2P = ({ navigation, route }: P2PScreenProps) => {

	// Idioma activo (el switch del header y el vacío se re-renderizan al cambiar)
	const { t } = useTranslation()

	// User
	const { user } = useAuth()

	// Theme Context
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const insets = useSafeAreaInsets()
	const { height: windowHeight, width: windowWidth } = useWindowDimensions()

	// No usa useContentPadding porque Android no suma el inset: ahí la barra
	// inferior propia ya cubre esa zona y sumarlo dejaba un hueco doble
	const contentPadding = useMemo(
		() => ({ paddingBottom: Platform.OS === 'ios' ? 64 + insets.bottom : 24 }),
		[insets.bottom]
	)

	// Ancho del switch del header: lo más generoso que quepa sin acercarse al
	// avatar ni a los botones (reservamos ~190px para ellos), con tope para que
	// en pantallas anchas no se estire de más
	const headerSwitchWidth = Math.max(132, Math.min(168, windowWidth - 190))

	// Online status
	const { trackUsers, untrackUsers } = useOnlineStatus()

	// Bottom bar (Android scroll-hide)
	const { bottomBarVisible } = useBottomBar()

	// p2p access gate: el backend exige los CUATRO requisitos antes de servir
	// /p2p/index (cuenta habilitada, KYC, teléfono y Telegram). Comprobarlos
	// aquí evita pedir un listado que va a volver 400 — y el 400 que llegue
	// igualmente (perfil local desfasado) lo traduce `requirement`.
	// El `!` es solo de tipos: el tab solo se monta con sesión iniciada
	const missingRequirements = useMemo(() => missingP2PRequirements(user!), [user])
	const p2pEnabled = missingRequirements.length === 0

	// Filters + derived API filters/badges
	const initialCoin = route?.params?.coin ? { tick: route.params.coin, name: route.params.coinName || route.params.coin, logo: route.params.coin } : null
	const { filters, setFilter, resetFilters, hasActiveFilters, apiFilters, activeFilterBadges } = useP2PFilters(initialCoin)
	const { typeFilter, selectedCoin, sortIndex, showMine: _showMine } = filters

	// Offers list + pagination + fetch
	// Todos los filtros son de servidor: cualquiera de ellos debe refetchear
	const quickKey = JSON.stringify(apiFilters)
	const { p2pOffers, isLoading, error, requirement, refreshing, availableCoins, loadingCoins, marketAverages, onRefresh, handleLoadMore } = useP2POffers({ apiFilters, p2pEnabled, quickKey })

	// Modal visibility
	const [modals, dispatchModals] = useReducer(modalsReducer, { showFiltersModal: false, showCoinPicker: false, showSortMenu: false })
	const { showFiltersModal, showCoinPicker, showSortMenu } = modals
	const setShowFiltersModal = (value: boolean) => dispatchModals({ type: "set", field: "showFiltersModal", value })
	const setShowCoinPicker = (value: boolean) => dispatchModals({ type: "set", field: "showCoinPicker", value })
	const setShowSortMenu = (value: boolean) => dispatchModals({ type: "set", field: "showSortMenu", value })
	// El picker de moneda se abre a veces desde el modal de filtros (y ese modal
	// se cierra, porque dos modales a la vez dan problemas): se anota para
	// devolver al usuario donde estaba, elija moneda o descarte
	const returnToFiltersRef = useRef(false)
	// "Mejor tasa" solo existe con una moneda elegida (los ratios de monedas
	// distintas no son comparables): elegirlo sin moneda abre el picker y deja el
	// orden anotado para aplicarlo en cuanto se elija una. Descartar el picker
	// cancela el orden en vez de dejarlo pedido y sin efecto.
	const pendingSortRef = useRef<number | null>(null)
	const closeCoinPicker = useCallback(() => {
		setShowCoinPicker(false)
		pendingSortRef.current = null
		if (returnToFiltersRef.current) {
			returnToFiltersRef.current = false
			setShowFiltersModal(true)
		}
	}, [])

	const handleSelectCoin = useCallback((coin: Coin) => {
		setFilter("selectedCoin", coin)
		// Se lee ANTES de cerrar: closeCoinPicker limpia el pendiente
		const pendingSort = pendingSortRef.current
		if (pendingSort != null) { setFilter("sortIndex", pendingSort) }
		closeCoinPicker()
	}, [setFilter, closeCoinPicker])

	const handleSelectSort = useCallback((index: number) => {
		setShowSortMenu(false)
		if (SORT_OPTIONS[index]?.requiresCoin && !selectedCoin?.tick) {
			pendingSortRef.current = index
			setShowCoinPicker(true)
			return
		}
		setFilter("sortIndex", index)
	}, [selectedCoin?.tick, setFilter])

	// Quitar la moneda deja sin sentido un orden que la exige: se vuelve al de
	// por defecto en vez de dejar un badge de orden que no se está aplicando
	const handleClearCoin = useCallback(() => {
		setFilter("selectedCoin", null)
		if (SORT_OPTIONS[sortIndex]?.requiresCoin) { setFilter("sortIndex", 0) }
	}, [sortIndex, setFilter])

	// Track P2P offer users for online status
	useEffect(() => {
		const ids = p2pOffers.flatMap(o => [o.User?.uuid, o.Peer?.uuid]).filter(Boolean) as string[]
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

	const setBarsVisible = useCallback((visible: number) => {
		if (filterBarTarget.current === visible) return
		filterBarTarget.current = visible
		filterBarVisible.value = withTiming(visible, { duration: 250 })
		bottomBarVisible.value = withTiming(visible, { duration: 250 })
	}, [filterBarVisible, bottomBarVisible])

	const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
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
						value={typeFilter === "sell" ? "left" : "right"}
						/* El lado del mercado es un modo, no un filtro: volver a tocar
						   el lado activo (QPSwitch responde con null) no lo apaga */
						onChange={(side) => { if (side) { setFilter("typeFilter", side === "left" ? "sell" : "buy") } }}
						leftText={t('p2p.common.buy')}
						rightText={t('p2p.common.sell')}
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
					{ type: 'button', label: t('p2p.market.headerFilters'), icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease.circle' }, onPress: () => setShowFiltersModal(true), tintColor: hasActiveFilters ? theme.colors.primary : theme.colors.primaryText },
					{ type: 'button', label: t('p2p.market.headerCreate'), icon: { type: 'sfSymbol', name: 'plus' }, onPress: () => navigation.navigate(ROUTES.P2P_CREATE_SCREEN) },
				],
			}),
		})
	}, [navigation, theme, hasActiveFilters, containerStyles, typeFilter, setFilter, headerSwitchWidth, t])

	// Footer loader
	const renderFooter = () => {
		if (!isLoading || p2pOffers.length === 0) return null
		return (
			<View style={{ paddingVertical: 20, alignItems: 'center' }}>
				<ActivityIndicator size="small" color={theme.colors.primary} />
			</View>
		)
	}

	const renderOffer = ({ item }: { item: P2POfferModel }) => (
		<P2POffer offer={item} navigation={navigation as unknown as RootNav} marketAverage={marketAverages?.[item.coin]} />
	)

	if (!p2pEnabled || requirement) {
		return <P2PRequirementsGate user={user!} navigation={navigation as unknown as RootNav} theme={theme} textStyles={textStyles} containerStyles={containerStyles} serverMissing={requirement} />
	}

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
					onClearCoin={handleClearCoin}
					onToggleSortMenu={() => setShowSortMenu(!showSortMenu)}
					onSelectSort={handleSelectSort}
					onClearSort={() => setFilter("sortIndex", 0)}
					onRemoveBadge={handleRemoveBadge}
					theme={theme}
					textStyles={textStyles}
				/>
			</Animated.View>

			<OffersFlashList
				data={p2pOffers}
				renderItem={renderOffer}
				keyExtractor={(item) => item.uuid}
				onScroll={handleScroll}
				scrollEventThrottle={16}
				// createHiddenRefreshControl se tipa ReactElement genérico; la lista exige
				// el elemento parametrizado con RefreshControlProps — cast solo de tipos
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
				showsVerticalScrollIndicator={false}
				contentContainerStyle={contentPadding}
				onEndReached={handleLoadMore}
				onEndReachedThreshold={0.3}
				ListFooterComponent={renderFooter}
				ListEmptyComponent={
					<View style={styles.emptyContainer}>
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: "center" }]}>
							{error ? error : t('p2p.market.empty')}
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
				onOpenCoinPicker={() => { returnToFiltersRef.current = true; setShowCoinPicker(true); setShowFiltersModal(false) }}
				onClear={resetFilters}
				onApply={() => setShowFiltersModal(false)}
				windowHeight={windowHeight}
				theme={theme}
				textStyles={textStyles}
			/>

			{/* Coin Picker Modal */}
			<QPCoinPicker
				visible={showCoinPicker}
				onClose={closeCoinPicker}
				onSelect={handleSelectCoin}
				coins={availableCoins}
				/* El filtro guarda una moneda SINTÉTICA cuando llega por route.params
				   (solo tick/name/logo): el picker la tipa como Coin completa */
				selectedCoin={selectedCoin as Coin | null}
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
