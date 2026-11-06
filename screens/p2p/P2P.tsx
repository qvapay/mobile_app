import { FlashList } from "@shopify/flash-list"
import type { FlashListProps, FlashListRef } from "@shopify/flash-list"
import { useEffect, useLayoutEffect, useReducer, useCallback, useMemo, useRef } from "react"
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
import P2POffer, { P2POfferItemSkeleton } from "../../ui/P2POfferItem"
import QPCoinPicker from "../../ui/QPCoinPicker"
import QPSwitch from "../../ui/particles/QPSwitch"
import P2PRequirementsGate from "./P2PRequirementsGate"
import { missingP2PRequirements } from "./p2pRequirements"
import P2PFilterBar from "./P2PFilterBar"
import P2PFiltersModal from "./P2PFiltersModal"
import P2PMarketModal from "./P2PMarketModal"
import P2PHeaderMenu from "./P2PHeaderMenu"
import { DEFAULT_POPULAR_COINS, RECENT_COINS_KEY } from "./p2pQuickCoins"
import HeaderIdentity from "../../ui/HeaderIdentity"
import { supportsLiquidGlass } from "../../helpers/liquidGlass"
import useTabBarClearance from "../../hooks/useTabBarClearance"
import useTabScrollToTop from "../../hooks/useTabScrollToTop"
import useP2PFilters, { SORT_OPTIONS } from "./useP2PFilters"
import useP2POffers from "./useP2POffers"
import P2PPromotedSlot from "./P2PPromotedSlot"
import { useP2PPromoQuery } from "./p2pQueries"
import { freeSlotFor, withoutPromoted } from "./p2pPromo"

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
import type { ComponentType, ReactElement, Ref } from "react"
import type { CompositeScreenProps, NavigationProp } from "@react-navigation/native"
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { MainTabParamList, RootStackParamList } from "../../types/navigation"
// `P2POffer` ya nombra al COMPONENTE de item importado arriba: el tipo entra con alias
import type { Coin, P2POffer as P2POfferModel } from "../../types/domain"
import type { P2PFilterBadge } from "./useP2PFilters"
import type { P2PMenuItem, P2PMenuKey } from "./P2PHeaderMenu"

/**
 * P2P vive en el bottom-tab de MainStack pero navega al stack raíz
 * (P2PCreate/P2POffer), de ahí el composite.
 */
type P2PScreenProps = CompositeScreenProps<
	BottomTabScreenProps<MainTabParamList, 'P2P'>,
	NativeStackScreenProps<RootStackParamList>
>

/** Visibilidad de los modales de la pantalla. */
type ModalsState = { showFiltersModal: boolean, showCoinPicker: boolean, showSortMenu: boolean, showMarketModal: boolean, showHeaderMenu: boolean }

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
 * `ref` hay que declararlo aquí: el cast a ComponentType pierde el que trae el genérico.
 */
const OffersFlashList = FlashList as ComponentType<FlashListProps<P2POfferModel> & { estimatedItemSize?: number, ref?: Ref<FlashListRef<P2POfferModel>> }>

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

	// En iOS 26+ el hueco va calibrado contra la barra nativa; en el resto la
	// barra emulada flota sobre la lista y se le deja su sitio más un margen
	// Tocar P2P estando ya en P2P vuelve al principio de las ofertas
	const listRef = useRef<FlashListRef<P2POfferModel>>(null)
	useTabScrollToTop(listRef)

	const tabBarClearance = useTabBarClearance()
	const contentPadding = useMemo(
		() => ({ paddingBottom: supportsLiquidGlass ? 64 + insets.bottom : insets.bottom + tabBarClearance + 24 }),
		[insets.bottom, tabBarClearance]
	)

	// Ancho del switch del header: lo más generoso que quepa sin acercarse al
	// avatar ni a los botones, con tope para que en pantallas anchas no se
	// estire de más. Con DOS botones (Mis ofertas + ⋯) el header JS de Android
	// reserva ~210px entre ambos lados; en iOS < 26 el header es nativo y agrupa
	// los items en su propia píldora.
	//
	// En iOS 26+ el switch es un item `custom` del header dentro del cristal
	// compartido (liquid glass), a la derecha del avatar: su ancho es FIJO y por
	// debajo de lo que cabe, porque en iOS 27 un custom que no cabe hace que UIKit
	// tire el grupo entero (ver useNativeMiniAppHeader): ancho − márgenes (2·20) −
	// avatar (36 + 12 de hueco) − dos botones (44 + 12 cada uno) − 16 de margen
	const headerSwitchWidth = supportsLiquidGlass
		? Math.max(132, Math.min(168, windowWidth - 40 - 48 - 112 - 16))
		: Platform.OS === 'ios'
			? Math.max(132, Math.min(168, windowWidth - 190))
			: Math.max(120, Math.min(168, windowWidth - 210))

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
	const { filters, setFilter, resetFilters, apiFilters, activeFilterBadges } = useP2PFilters(initialCoin)
	const { typeFilter, selectedCoin, sortIndex, showMine, opAmount, ratioMin, ratioMax, onlyVip } = filters
	// Filtros que solo se ponen desde el modal: tiñen el ⋯ del header para que se sepa
	// que ahí dentro hay algo puesto (moneda, orden y «Mis ofertas» ya se ven fuera)
	const modalFiltersActive = opAmount !== "" || ratioMin !== "" || ratioMax !== "" || onlyVip

	// Offers list + pagination + fetch
	// Todos los filtros son de servidor: cualquiera de ellos debe refetchear
	const quickKey = JSON.stringify(apiFilters)
	const { p2pOffers, promoted, isLoading, error, requirement, refreshing, availableCoins, loadingCoins, marketAverages, onRefresh, handleLoadMore } = useP2POffers({ apiFilters, p2pEnabled, quickKey })

	// Puesto promocionado del par visible: la oferta pagada va arriba en su tarjeta y no se
	// repite en el ranking. Sin titular, si el puesto está libre se ofrece en una línea (eso
	// sale de GET /p2p/promo, que solo se pide con moneda elegida y sin "Mis ofertas")
	const listedOffers = useMemo(() => withoutPromoted(p2pOffers, promoted), [p2pOffers, promoted])
	// Con `peer` el backend no manda `promoted`: ofrecer ahí el puesto libre sería un error
	const promoCoin = apiFilters.coin && !apiFilters.my && !apiFilters.peer ? apiFilters.coin : null
	const promoQuery = useP2PPromoQuery(promoCoin, p2pEnabled && !promoted)
	const freeSlot = !promoted && promoCoin ? freeSlotFor(promoQuery.data, typeFilter) : null

	// Modal visibility
	const [modals, dispatchModals] = useReducer(modalsReducer, { showFiltersModal: false, showCoinPicker: false, showSortMenu: false, showMarketModal: false, showHeaderMenu: false })
	const { showFiltersModal, showCoinPicker, showSortMenu, showMarketModal, showHeaderMenu } = modals
	const setShowFiltersModal = (value: boolean) => dispatchModals({ type: "set", field: "showFiltersModal", value })
	const setShowCoinPicker = (value: boolean) => dispatchModals({ type: "set", field: "showCoinPicker", value })
	const setShowSortMenu = (value: boolean) => dispatchModals({ type: "set", field: "showSortMenu", value })
	const setShowMarketModal = (value: boolean) => dispatchModals({ type: "set", field: "showMarketModal", value })
	const setShowHeaderMenu = (value: boolean) => dispatchModals({ type: "set", field: "showHeaderMenu", value })
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

	// Chip de moneda de la barra: «Todas» limpia; una moneda entra como la
	// sintética de los params (tick/name/logo), igual que desde un enlace
	const handleQuickCoin = useCallback((coin: { tick: string, label: string } | null) => {
		if (!coin) { handleClearCoin(); return }
		setFilter("selectedCoin", { tick: coin.tick, name: coin.label, logo: coin.tick })
	}, [handleClearCoin, setFilter])

	// Track P2P offer users for online status
	useEffect(() => {
		const ids = p2pOffers.flatMap(o => [o.User?.uuid, o.Peer?.uuid]).filter(Boolean) as string[]
		const unique = [...new Set(ids)]
		if (unique.length) trackUsers(unique)
		return () => { if (unique.length) untrackUsers(unique) }
	}, [p2pOffers, trackUsers, untrackUsers])

	// Preselección por params (CoinDetail, «Ver todas» del depósito Vía P2P, deep link
	// `/p2p?coin=&offer_type=&peer=`): moneda, lado, comerciante y orden. `key` cambia en
	// cada enlace para que repetirlo con los mismos params vuelva a aplicarlos
	const paramType = route?.params?.type ?? route?.params?.offer_type
	const paramPeer = route?.params?.peer
	const paramSort = route?.params?.sort
	const paramKey = route?.params?.key
	useEffect(() => {
		const tick = route?.params?.coin
		if (tick) setFilter("selectedCoin", { tick, name: route?.params?.coinName || tick, logo: tick })
		if (paramType === "buy" || paramType === "sell") setFilter("typeFilter", paramType)
		if (paramPeer !== undefined) setFilter("peer", paramPeer || null)
		// "Mejor tasa" exige moneda: sin ella el hook degradaría al orden por defecto
		if (paramSort === "best_rate" && tick) setFilter("sortIndex", Math.max(0, SORT_OPTIONS.findIndex(o => o.orderBy === "best_rate")))
	}, [route?.params?.coin, route?.params?.coinName, paramType, paramPeer, paramSort, paramKey, setFilter])

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

	// Gate por un 400 del servidor (el perfil local decía que todo estaba hecho):
	// al volver a la pestaña, normalmente tras completar el paso en otra
	// pantalla, se pregunta otra vez. Solo con ESE gate a la vista: si el perfil
	// local ya dice que falta algo (`p2pEnabled` false), preguntar daría 400
	// seguro, y completar el paso cambia el perfil, que ya relanza la carga.
	// Por ref: el efecto de foco no puede depender de `requirement`, o volver a
	// preguntar lo re-dispararía
	const recheckGateRef = useRef<(() => void) | null>(null)
	useEffect(() => { recheckGateRef.current = requirement && p2pEnabled ? onRefresh : null })
	useFocusEffect(useCallback(() => { recheckGateRef.current?.() }, []))

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

	// Menú ⋯ del header (patrón del host de mini-apps): Crear oferta, Mercado y
	// Filtros. En iOS es un UIMenu nativo; en Android el Modal propio P2PHeaderMenu.
	// Sin acceso al P2P la lista no existe: Filtros no se ofrece (el modal de
	// filtros no se monta en el gate); Crear y Mercado sí (tienen su propio gate)
	const menuItems = useMemo<P2PMenuItem[]>(() => [
		{ key: 'create', label: t('p2p.market.headerCreate'), icon: 'plus' },
		{ key: 'market', label: t('p2p.market.headerMarket'), icon: 'chart-simple' },
		...(p2pEnabled && !requirement ? [{ key: 'filters' as const, label: t('p2p.market.headerFilters'), icon: 'sliders' as const, active: modalFiltersActive }] : []),
	], [t, p2pEnabled, requirement, modalFiltersActive])
	const runMenu = useCallback((key: P2PMenuKey) => {
		switch (key) {
			case 'create': navigation.navigate(ROUTES.P2P_CREATE_SCREEN); break
			case 'market': dispatchModals({ type: "set", field: "showMarketModal", value: true }); break
			case 'filters': dispatchModals({ type: "set", field: "showFiltersModal", value: true }); break
		}
	}, [navigation])
	// Desde el menú propio, en iOS lo que se abre (otro Modal o una pantalla) espera al
	// onDismiss del menú: presentarlo mientras el anterior aún se va deja un modal zombi
	// (ver ui/useModalGate). Android no lo necesita. El UIMenu nativo no es un modal
	const afterMenuRef = useRef<(() => void) | null>(null)
	const runFromMenu = useCallback((key: P2PMenuKey) => {
		dispatchModals({ type: "set", field: "showHeaderMenu", value: false })
		if (Platform.OS === 'ios') afterMenuRef.current = () => runMenu(key)
		else runMenu(key)
	}, [runMenu])
	const onMenuDismiss = useCallback(() => {
		const pending = afterMenuRef.current
		afterMenuRef.current = null
		pending?.()
	}, [])
	// «Mis ofertas» es un MODO con su propio botón de entrada/salida en el header
	// (como el «Ads»/«My Ads» de Binance y Bybit), no un filtro escondido en el modal
	const toggleMine = useCallback(() => setFilter("showMine", !showMine), [setFilter, showMine])

	// Configure header buttons locally to avoid non-serializable params.
	// El switch Comprar/Vender vive en el TopBar como headerTitle (patrón de
	// los P2P de la industria: el lado del mercado se elige arriba del todo,
	// no entre los filtros).
	// useLayoutEffect y NO useEffect: es la convención del repo para setOptions
	// (Transactions, Transaction, Onboard, PhoneTopupBrand…), y evita que el
	// header JS de Android llegue a pintarse con la forma heredada de MainStack.
	// OJO: en iOS 26+ el header es nativo y esto NO evita el brinco del avatar
	// — ver la nota de abajo.
	useLayoutEffect(() => {
		const sideSwitch = (bare: boolean) => (
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
				bare={bare}
				style={[bare ? styles.headerSwitchGlass : styles.headerSwitch, { width: headerSwitchWidth }]}
			/>
		)
		navigation.setOptions({
			// iOS 26+: el switch va DENTRO del header nativo como item `custom` del
			// grupo izquierdo, junto al avatar, y el sistema le pinta su propia
			// cápsula de cristal (sin `hidesSharedBackground`), a la misma altura
			// que los botones de la derecha. Lo que antes era un título custom
			// flotando con su fondo propio no casaba con la barra de liquid glass.
			// El avatar se repite aquí porque `setOptions` sustituye el grupo
			// entero que puso MainStack
			...(supportsLiquidGlass ? {
				headerTitle: '',
				unstable_headerLeftItems: () => [
					{
						type: 'custom',
						// `avatarOnly` como en MainStack: con nombre e insignias el grupo
						// no cabe junto al switch, y en iOS 27 UIKit lo descarta ENTERO
						// (avatar incluido) en vez de truncarlo
						element: <HeaderIdentity user={user} avatarOnly native onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)} />,
						hidesSharedBackground: true,
					},
					{ type: 'custom', element: sideSwitch(true) },
				],
			} : {
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
						{sideSwitch(false)}
					</View>
				),
			}),
			// Derecha, como en los P2P de la industria: «Mis ofertas» (entrada y
			// salida del modo, teñido mientras estás dentro) y el ⋯ con el resto
			// (Crear oferta, Mercado, Filtros). Dos iconos en vez de tres dejan
			// sitio al switch centrado (ver headerSwitchWidth)
			headerRight: () => (
				<View style={[containerStyles.headerRight, styles.headerRightGroup]}>
					<Pressable style={styles.headerIcon} hitSlop={6} onPress={toggleMine} accessibilityRole="button" accessibilityState={{ selected: showMine }} accessibilityLabel={t('p2p.filters.myOffers')}>
						<FontAwesome6 name="rectangle-list" size={20} color={showMine ? theme.colors.primary : theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
					<Pressable style={styles.headerIcon} hitSlop={6} onPress={() => setShowHeaderMenu(true)} accessibilityRole="button" accessibilityLabel={t('p2p.market.headerMenu')}>
						<FontAwesome6 name="ellipsis" size={20} color={modalFiltersActive ? theme.colors.primary : theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</View>
			),
			...(Platform.OS === 'ios' && {
				unstable_headerRightItems: () => [
					{ type: 'button', label: t('p2p.filters.myOffers'), icon: { type: 'sfSymbol', name: 'person.crop.rectangle.stack' }, onPress: toggleMine, selected: showMine, tintColor: showMine ? theme.colors.primary : theme.colors.primaryText },
					{
						type: 'menu',
						label: t('p2p.market.headerMenu'),
						icon: { type: 'sfSymbol', name: 'ellipsis' },
						tintColor: modalFiltersActive ? theme.colors.primary : theme.colors.primaryText,
						menu: {
							items: menuItems.map(item => ({
								type: 'action' as const,
								label: item.label,
								icon: { type: 'sfSymbol' as const, name: MENU_SF_SYMBOLS[item.key] },
								// El checkmark de UIMenu: Filtros "activo" = hay filtros puestos
								...(item.active ? { state: 'on' as const } : null),
								onPress: () => runMenu(item.key),
							})),
						},
					},
				],
			}),
		})
	}, [navigation, theme, user, modalFiltersActive, showMine, toggleMine, menuItems, runMenu, containerStyles, typeFilter, setFilter, headerSwitchWidth, t])

	// Footer loader
	const renderFooter = () => {
		if (!isLoading || p2pOffers.length === 0) return null
		return (
			<View style={{ paddingVertical: 20, alignItems: 'center' }}>
				<ActivityIndicator size="small" color={theme.colors.primary} />
			</View>
		)
	}

	// Bloque continuo: solo la primera y la última card llevan esquinas redondeadas
	const listCardStyle = (index: number, count: number) => [
		styles.listCard,
		index === 0 && styles.listCardFirst,
		index === count - 1 && styles.listCardLast,
	]

	const renderOffer = ({ item, index }: { item: P2POfferModel, index: number }) => (
		<P2POffer offer={item} navigation={navigation as unknown as RootNav} marketAverage={marketAverages?.[item.coin]} style={listCardStyle(index, listedOffers.length)} />
	)

	// Lista continua con divisores finos (como la web), no tarjetas sueltas
	const renderSeparator = () => <View style={[styles.listDivider, { backgroundColor: theme.colors.border }]} />

	if (!p2pEnabled || requirement) {
		// Las medias del mercado son informativas: el botón del header funciona
		// también sin los requisitos del P2P (sin filtro al elegir moneda)
		return (
			<>
				<P2PRequirementsGate user={user!} navigation={navigation as unknown as RootNav} theme={theme} textStyles={textStyles} containerStyles={containerStyles} serverMissing={requirement} />
				<P2PMarketModal visible={showMarketModal} onClose={() => setShowMarketModal(false)} onSelectCoin={() => setShowMarketModal(false)} />
				<P2PHeaderMenu visible={showHeaderMenu} items={menuItems} onSelect={runFromMenu} onClose={() => setShowHeaderMenu(false)} onDismiss={onMenuDismiss} />
			</>
		)
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
					onSelectCoin={handleQuickCoin}
					onToggleSortMenu={() => setShowSortMenu(!showSortMenu)}
					onSelectSort={handleSelectSort}
					onRemoveBadge={handleRemoveBadge}
					theme={theme}
					textStyles={textStyles}
				/>
			</Animated.View>

			<OffersFlashList
				ref={listRef}
				data={listedOffers}
				renderItem={renderOffer}
				ListHeaderComponent={<P2PPromotedSlot promoted={promoted} freeSlot={freeSlot} navigation={navigation as unknown as RootNav} marketAverages={marketAverages} />}
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
				ItemSeparatorComponent={renderSeparator}
				// Si la única oferta del par es la promocionada, el "No hay ofertas" la contradiría
				ListEmptyComponent={promoted ? null : isLoading && !error ? (
					<View>
						{[0, 1, 2, 3, 4].map(i => (
							<View key={i}>
								{i > 0 && renderSeparator()}
								<P2POfferItemSkeleton style={listCardStyle(i, 5)} />
							</View>
						))}
					</View>
				) : (
					<View style={styles.emptyContainer}>
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: "center" }]}>
							{error ? error : t('p2p.market.empty')}
						</Text>
					</View>
				)}
				estimatedItemSize={140}
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

			{/* Mercado P2P: medias por moneda; tocar una filtra la lista */}
			<P2PMarketModal
				visible={showMarketModal}
				onClose={() => setShowMarketModal(false)}
				onSelectCoin={(tick, name) => {
					setShowMarketModal(false)
					setFilter("selectedCoin", { tick, name, logo: tick })
				}}
			/>

			{/* Menú ⋯ del header (solo fuera de iOS: ahí es un UIMenu nativo) */}
			<P2PHeaderMenu visible={showHeaderMenu} items={menuItems} onSelect={runFromMenu} onClose={() => setShowHeaderMenu(false)} onDismiss={onMenuDismiss} />

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

/** SF Symbol de cada entrada del UIMenu nativo de iOS (el FA6 del menú propio va en el item). */
const MENU_SF_SYMBOLS: Record<P2PMenuKey, string> = {
	create: 'plus',
	market: 'chart.bar',
	filters: 'line.3.horizontal.decrease.circle',
}

const styles = StyleSheet.create({
	headerRightGroup: {
		gap: 12,
	},
	headerIcon: {
		minWidth: 32,
		alignItems: 'center',
		justifyContent: 'center',
	},
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
	// Dentro del cristal del header de iOS 26: la altura de los botones nativos (44)
	headerSwitchGlass: {
		height: 44,
	},
	listCard: {
		borderRadius: 0,
		marginBottom: 0,
	},
	listCardFirst: {
		borderTopLeftRadius: 12,
		borderTopRightRadius: 12,
	},
	listCardLast: {
		borderBottomLeftRadius: 12,
		borderBottomRightRadius: 12,
	},
	listDivider: {
		height: StyleSheet.hairlineWidth,
	},
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 40,
	},
})

export default P2P
