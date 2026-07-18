import { useReducer, useEffect, useCallback, useRef, useState } from "react"

import { p2pApi } from "../../api/p2pApi"
import coinsApi from "../../api/coinsApi"
import { updateWidgetP2POffers, reloadWidgets } from "../../helpers/widgetBridge"
import { CACHE_KEYS, readCache, writeCache } from "../../helpers/dataCache"
import { toast } from "sonner-native"

const PAGE_SIZE = 30

const initialList = { p2pOffers: [], isLoading: false, error: null, refreshing: false }

function listReducer(state, action) {
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
 * @param {object} params
 * @param {object} params.apiFilters - Query params from useP2PFilters; read through a ref, so a changed
 *   object alone does NOT refetch — refreshes are driven by `quickKey` or explicit calls.
 * @param {boolean} params.p2pEnabled - Gate from user settings; nothing is fetched while false.
 * @param {string} params.quickKey - Key derived from the quick filters (type, coin, sort, showMine);
 *   a change auto-refreshes page 1 (skipped on first render — the mount effect covers it).
 * @returns {object} List API:
 *   `p2pOffers`, `isLoading` (initial/load-more), `error`, `refreshing`,
 *   `availableCoins` + `loadingCoins` (coin picker),
 *   `fetchP2POffers(pageNum, isRefresh)` (used by the screen to apply modal filters),
 *   `onRefresh` (pull-to-refresh) and `handleLoadMore` (list end reached).
 */
export default function useP2POffers({ apiFilters, p2pEnabled, quickKey }) {

	const [list, dispatchList] = useReducer(listReducer, initialList)
	const { p2pOffers, isLoading, error, refreshing } = list

	// Pagination cursors — read only inside the fetch/load-more handlers, never rendered
	const pageRef = useRef(1)
	const hasMoreRef = useRef(true)

	// Latest apiFilters + in-flight flag kept in refs so fetchP2POffers can have a
	// stable identity (empty deps) — letting the effects below depend on it honestly.
	const apiFiltersRef = useRef(apiFilters)
	apiFiltersRef.current = apiFilters
	const inFlightRef = useRef(false)
	// Flipped on the first successful fetch — blocks late cache hydration
	const hasFreshOffersRef = useRef(false)

	// Coins for the picker
	const [availableCoins, setAvailableCoins] = useState([])
	const [loadingCoins, setLoadingCoins] = useState(false)

	// Get the Latest P2P Offers
	const fetchP2POffers = useCallback(async (pageNum = 1, isRefresh = false) => {
		if (inFlightRef.current) return
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
					// Persist the default marketplace view for instant cold-start rendering
					if (!apiFilters.my && newData.length > 0) { writeCache(CACHE_KEYS.P2P_OFFERS, newData) }
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
				dispatchList({ type: "error", error: response.error || "Error al cargar las ofertas P2P" })
				toast.error(response.error || "Error al cargar las ofertas P2P")
			}
		} catch (err) {
			dispatchList({ type: "error", error: "Error de conexión" })
			toast.error("Error de conexión")
		} finally {
			inFlightRef.current = false
			dispatchList({ type: "finish" })
		}
	}, [])

	// Cold-start hydration: paint the cached marketplace while the fetch revalidates
	useEffect(() => {
		if (!p2pEnabled) return
		readCache(CACHE_KEYS.P2P_OFFERS).then(offers => {
			if (offers && !hasFreshOffersRef.current) { dispatchList({ type: "hydrate", offers }) }
		})
	}, [p2pEnabled])

	// Load data on mount (and if P2P becomes enabled)
	useEffect(() => {
		if (p2pEnabled) { fetchP2POffers(1) }
	}, [p2pEnabled, fetchP2POffers])

	// Auto-fetch when quick filters change (type, coin, sort, showMine)
	const isFirstRender = useRef(true)
	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false
			return
		}
		if (p2pEnabled) { fetchP2POffers(1, true) }
	}, [quickKey, p2pEnabled, fetchP2POffers])

	// Load coins for coin picker (once on mount) — cached so the picker is
	// instantly usable on cold start and offline
	useEffect(() => {
		let mounted = true
		let hasFreshCoins = false
		readCache(CACHE_KEYS.P2P_COINS).then(coins => {
			if (mounted && coins?.length && !hasFreshCoins) { setAvailableCoins(coins) }
		})
		const loadCoins = async () => {
			try {
				setLoadingCoins(true)
				const res = await coinsApi.index({ enabled_p2p: true })
				if (mounted && res.success) {
					hasFreshCoins = true
					setAvailableCoins(res.data || [])
					writeCache(CACHE_KEYS.P2P_COINS, res.data || [])
				}
			} catch (e) { /* ignore */ }
			finally { if (mounted) setLoadingCoins(false) }
		}
		loadCoins()
		return () => { mounted = false }
	}, [])

	// Handle refresh
	const onRefresh = () => { hasMoreRef.current = true; fetchP2POffers(1, true) }

	// Load more on scroll end
	const handleLoadMore = useCallback(() => {
		if (!isLoading && hasMoreRef.current) { fetchP2POffers(pageRef.current + 1) }
	}, [isLoading, fetchP2POffers])

	return { p2pOffers, isLoading, error, refreshing, availableCoins, loadingCoins, fetchP2POffers, onRefresh, handleLoadMore }
}
