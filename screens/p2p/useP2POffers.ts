import { useReducer, useEffect, useCallback, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { p2pApi } from "../../api/p2pApi"
import { updateWidgetP2POffers, reloadWidgets } from "../../helpers/widgetBridge"
import { P2P_OFFERS_SNAPSHOT_KEY, useP2pMarketAveragesQuery } from "./p2pQueries"
import useCoins from "../../hooks/useCoins"

// Toast
import { toast } from "sonner-native"

// i18n en call time: fetchP2POffers mantiene identidad estable (deps vacías de
// filtros) y un `t` reactivo en sus deps re-dispararía los efectos de montaje
// al cambiar de idioma
import i18n from "../../i18n"

import type { P2PIndexFilters } from "../../api/p2pApi"
import type { P2POffer } from "../../types/domain"

const PAGE_SIZE = 30

/** Estado de la lista del marketplace (paginación y guardas viven en refs, fuera de aquí). */
type ListState = {
	p2pOffers: P2POffer[]
	isLoading: boolean
	error: string | null
	refreshing: boolean
}

/**
 * Acciones del reducer como unión discriminada. `start.kind` distingue las tres
 * entradas posibles: tirón del usuario, scroll infinito y carga inicial.
 */
type ListAction =
	| { type: "start", kind: "refresh" | "more" | "initial" }
	| { type: "setOffers", offers: P2POffer[] }
	| { type: "hydrate", offers: P2POffer[] | null | undefined }
	| { type: "appendOffers", offers: P2POffer[] }
	| { type: "error", error: string }
	| { type: "finish" }

/** Petición que llegó mientras había otra en vuelo (coalescing). */
type PendingFetch = { pageNum: number, isRefresh: boolean }

// Espera antes de refetchear al cambiar filtros: agrupa los toques seguidos en
// una sola petición (el índice permite 10/min por usuario)
const FILTER_DEBOUNCE_MS = 350

const initialList: ListState = { p2pOffers: [], isLoading: false, error: null, refreshing: false }

function listReducer(state: ListState, action: ListAction): ListState {
	switch (action.type) {
		case "start":
			// kind: 'refresh' | 'more' | 'initial'
			return { ...state, refreshing: action.kind === "refresh", isLoading: action.kind === "more", error: null }
		case "setOffers":
			return { ...state, p2pOffers: action.offers }
		case "hydrate":
			// Cached offers paint the cold start — never clobber a resolved fetch
			return state.p2pOffers.length === 0 && action.offers?.length ? { ...state, p2pOffers: action.offers } : state
		case "appendOffers":
			return { ...state, p2pOffers: [...state.p2pOffers, ...action.offers] }
		case "error":
			return { ...state, error: action.error }
		case "finish":
			return { ...state, isLoading: false, refreshing: false }
		default:
			return state
	}
}

/**
 * Owns the P2P marketplace offers list: fetching, pull-to-refresh, infinite-scroll
 * pagination, and the coin catalog for the picker.
 *
 * Offers come from `GET /p2p/index` (p2pApi.index) in pages of PAGE_SIZE (30);
 * `hasMore` is inferred from a full page coming back. Pagination cursors and the
 * in-flight guard live in refs (never rendered), and the latest `apiFilters` is
 * mirrored into a ref so `fetchP2POffers` keeps a stable identity (empty deps) —
 * concurrent fetches are dropped, not queued. Coins load once on mount via
 * `GET /coins/v2` (coinsApi.index, `enabled_p2p` only). When refreshing with the
 * `my` filter active, the user's own offers are pushed to the home-screen widget
 * (helpers/widgetBridge).
 *
 * @param params.apiFilters - Query params from useP2PFilters; read through a ref, so a changed
 *   object alone does NOT refetch — refreshes are driven by `quickKey` or explicit calls.
 * @param params.p2pEnabled - Gate from user settings; nothing is fetched while false.
 * @param params.quickKey - Key derived from the quick filters (type, coin, sort, showMine);
 *   a change auto-refreshes page 1 (skipped on first render — the mount effect covers it).
 * @returns List API:
 *   `p2pOffers`, `isLoading` (initial/load-more), `error`, `refreshing`,
 *   `availableCoins` + `loadingCoins` (coin picker),
 *   `fetchP2POffers(pageNum, isRefresh)` (used by the screen to apply modal filters),
 *   `onRefresh` (pull-to-refresh) and `handleLoadMore` (list end reached).
 */
export default function useP2POffers({ apiFilters, p2pEnabled, quickKey }: {
	apiFilters: P2PIndexFilters
	/** `user.p2p_enabled` llega del backend como boolean o 0/1. */
	p2pEnabled?: boolean | number
	quickKey: string
}) {

	const [list, dispatchList] = useReducer(listReducer, initialList)
	const { p2pOffers, isLoading, error, refreshing } = list

	// Pagination cursors — read only inside the fetch/load-more handlers, never rendered
	const pageRef = useRef(1)
	const hasMoreRef = useRef(true)

	// Latest apiFilters + in-flight flag kept in refs so fetchP2POffers can have a
	// stable identity (empty deps) — letting the effects below depend on it honestly.
	const apiFiltersRef = useRef(apiFilters)
	// En un efecto, no en render (el render debe ser puro) — el mismo idioma que
	// `fetchRef` más abajo. Corre antes que los efectos que disparan el fetch.
	useEffect(() => { apiFiltersRef.current = apiFilters })
	const inFlightRef = useRef(false)
	// Última petición que llegó mientras había otra en vuelo
	const pendingFetchRef = useRef<PendingFetch | null>(null)
	// Flipped on the first successful fetch — blocks late cache hydration
	const hasFreshOffersRef = useRef(false)

	const queryClient = useQueryClient()

	// Coins for the picker — el MISMO catálogo cacheado que Add/Withdraw/
	// P2PCreate (`['coins', 'p2p']`): entrar al P2P deja el picker de Crear
	// oferta ya caliente, y viceversa
	const { coins: availableCoins, isLoading: loadingCoins } = useCoins('p2p')

	// Medias de mercado 24h por moneda (`{ TICK: { average_buy, average_sell } }`):
	// permiten decir si la tasa de una oferta está por encima o por debajo del
	// mercado. Contexto opcional: un fallo deja `null` y la lista funciona igual
	const averagesQuery = useP2pMarketAveragesQuery()
	const marketAverages = averagesQuery.data || null

	// Get the Latest P2P Offers
	const fetchP2POffers = useCallback(async (pageNum: number = 1, isRefresh: boolean = false) => {
		// Si ya hay uno en vuelo, en vez de descartar la petición se anota como
		// pendiente y se relanza al terminar: cambiar de filtro mientras carga
		// dejaba la lista mostrando el filtro anterior
		if (inFlightRef.current) {
			pendingFetchRef.current = { pageNum, isRefresh }
			return
		}
		inFlightRef.current = true
		const apiFilters = apiFiltersRef.current
		try {
			dispatchList({ type: "start", kind: isRefresh ? "refresh" : pageNum === 1 ? "initial" : "more" })
			const response = await p2pApi.index({ ...apiFilters, page: pageNum })
			if (response.success) {
				hasFreshOffersRef.current = true
				const newData = response.offers || []
				if (isRefresh || pageNum === 1) {
					dispatchList({ type: "setOffers", offers: newData })
					// Persist the default marketplace view for instant cold-start
					// rendering (snapshot en la caché de queries — el persister global
					// lo escribe a disco)
					if (!apiFilters.my && newData.length > 0) { queryClient.setQueryData(P2P_OFFERS_SNAPSHOT_KEY, newData) }
					// Update widget with user's own active offers
					if (apiFilters.my && newData.length > 0) {
						updateWidgetP2POffers(newData)
						reloadWidgets()
					}
				} else {
					dispatchList({ type: "appendOffers", offers: newData })
				}
				hasMoreRef.current = newData.length >= PAGE_SIZE
				pageRef.current = pageNum
			} else {
				dispatchList({ type: "error", error: response.error || i18n.t('p2p.market.toasts.loadFailed') })
				toast.error(response.error || i18n.t('p2p.market.toasts.loadFailed'))
			}
		} catch (err) {
			dispatchList({ type: "error", error: i18n.t('p2p.market.toasts.connectionError') })
			toast.error(i18n.t('p2p.market.toasts.connectionError'))
		} finally {
			inFlightRef.current = false
			dispatchList({ type: "finish" })
			const pending = pendingFetchRef.current
			if (pending) {
				pendingFetchRef.current = null
				// Un "cargar más" encolado durante un refresh apunta a una página
				// del listado ANTERIOR: al terminar el refresh la lista ya volvió
				// a la página 1, así que servirlo pegaría la página N+1 detrás de
				// la 1 saltándose las intermedias. Solo se replayean refrescos.
				const wasReset = isRefresh || pageNum === 1
				if (!wasReset || pending.isRefresh || pending.pageNum === 1) {
					fetchRef.current?.(pending.pageNum, pending.isRefresh)
				}
			}
		}
	}, [queryClient])

	// Auto-referencia para relanzar el pendiente sin romper la identidad estable
	// de fetchP2POffers (deps vacías). Se asigna en un efecto, no en el cuerpo:
	// React puede descartar o repetir un render, y una escritura de ref hecha
	// ahí se escaparía de trabajo que nunca llega a pintarse. Va antes que los
	// efectos que disparan fetch, así que ya está puesta cuando hacen falta.
	const fetchRef = useRef<typeof fetchP2POffers | null>(null)
	useEffect(() => { fetchRef.current = fetchP2POffers })

	// Cold-start hydration: paint the cached marketplace while the fetch
	// revalidates (el snapshot llega restaurado por el persister global)
	useEffect(() => {
		if (!p2pEnabled) return
		const offers = queryClient.getQueryData<P2POffer[]>(P2P_OFFERS_SNAPSHOT_KEY)
		if (offers && !hasFreshOffersRef.current) { dispatchList({ type: "hydrate", offers }) }
	}, [p2pEnabled, queryClient])

	// Load data on mount (and if P2P becomes enabled)
	useEffect(() => {
		if (p2pEnabled) { fetchP2POffers(1) }
	}, [p2pEnabled, fetchP2POffers])

	// Auto-fetch when quick filters change (type, coin, sort, showMine, monto).
	// Con debounce: el backend permite 10 peticiones por minuto y usuario, y
	// tocar varios filtros seguidos disparaba una por cada toque — suficiente
	// para agotar la cuota y comerse un 429 en media docena de segundos
	const isFirstRender = useRef(true)
	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false
			return
		}
		if (!p2pEnabled) return
		const timer = setTimeout(() => fetchP2POffers(1, true), FILTER_DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [quickKey, p2pEnabled, fetchP2POffers])

	// Handle refresh
	const onRefresh = () => { hasMoreRef.current = true; fetchP2POffers(1, true) }

	// Load more on scroll end
	const handleLoadMore = useCallback(() => {
		if (!isLoading && hasMoreRef.current) { fetchP2POffers(pageRef.current + 1) }
	}, [isLoading, fetchP2POffers])

	return { p2pOffers, isLoading, error, refreshing, availableCoins, loadingCoins, marketAverages, fetchP2POffers, onRefresh, handleLoadMore }
}
