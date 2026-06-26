import { useReducer, useEffect, useCallback, useRef, useState } from "react"

import { p2pApi } from "../../api/p2pApi"
import coinsApi from "../../api/coinsApi"
import { updateWidgetP2POffers, reloadWidgets } from "../../helpers/widgetBridge"
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

// Owns the offers list, pagination cursors (refs — never rendered) and the fetch +
// coin-catalog loading. `quickKey` is a string that changes when quick filters change,
// triggering an auto-refresh (modal filters apply via the explicit fetch call).
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
				const newData = response.offers || []
				if (isRefresh || pageNum === 1) {
					dispatchList({ type: "setOffers", offers: newData })
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

	// Load coins for coin picker (once on mount)
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
