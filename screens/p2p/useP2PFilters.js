import { useReducer, useMemo, useCallback } from "react"

const PAGE_SIZE = 30

/** Sort options the P2P screen cycles through; `sortIndex` indexes into this array. */
export const SORT_OPTIONS = [
	{ label: "Reciente", orderBy: "updated_at", orderType: "desc" },
	{ label: "Monto ↓", orderBy: "amount", orderType: "desc" },
	{ label: "Monto ↑", orderBy: "amount", orderType: "asc" },
	{ label: "Ratio ↓", orderBy: "ratio", orderType: "desc" },
	{ label: "Ratio ↑", orderBy: "ratio", orderType: "asc" },
]

const initialFilters = {
	typeFilter: null,
	selectedCoin: null,
	sortIndex: 0,
	showMine: false,
	minAmount: "",
	maxAmount: "",
	ratioMin: "",
	ratioMax: "",
	onlyVip: false,
}

function filtersReducer(state, action) {
	switch (action.type) {
		case "set":
			return { ...state, [action.field]: action.value }
		case "reset":
			return { ...initialFilters }
		default:
			return state
	}
}

/**
 * Owns the P2P marketplace filter state plus everything derived from it: the query
 * params for `GET /p2p/index`, the "any filter active" flag and the removable badges.
 *
 * Pure state — no requests happen here. The screen feeds `apiFilters` into
 * useP2POffers, which refetches when its `quickKey` (built from the quick filters)
 * changes; modal filters only apply when the screen calls fetch explicitly.
 * Numeric fields (`minAmount`, `maxAmount`, `ratioMin`, `ratioMax`) are kept as
 * strings for the inputs and only parsed into `apiFilters` when they hold a number.
 *
 * @param {object|null} initialCoin - Preselected coin (e.g. from navigation params); only `tick` is read.
 * @returns {object} Filter API:
 *   `filters` (raw state), `setFilter(field, value)` / `resetFilters()` (stable identities),
 *   `orderBy` + `orderType` (from the active SORT_OPTIONS entry),
 *   `hasActiveFilters` (any non-default filter set),
 *   `apiFilters` (memoized params for p2pApi.index: take, order, orderBy, type,
 *   my, coin, min, max, ratio_min, ratio_max, only_vip),
 *   `activeFilterBadges` (modal-filter chips, each with `label` + `onRemove`).
 */
export default function useP2PFilters(initialCoin) {

	const [filters, dispatch] = useReducer(filtersReducer, { ...initialFilters, selectedCoin: initialCoin })
	// Stable identities (dispatch is stable) so consumers can list them in deps safely.
	const setFilter = useCallback((field, value) => dispatch({ type: "set", field, value }), [])
	const resetFilters = useCallback(() => dispatch({ type: "reset" }), [])

	const { typeFilter, selectedCoin, sortIndex, showMine, minAmount, maxAmount, ratioMin, ratioMax, onlyVip } = filters

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
	const apiFilters = useMemo(() => {
		const out = {
			take: PAGE_SIZE,
			order: orderType,
			orderBy: orderBy,
			type: typeFilter,
		}
		if (showMine) { out.my = true }
		if (selectedCoin?.tick) { out.coin = selectedCoin.tick }
		if (minAmount !== "" && !isNaN(parseFloat(minAmount))) { out.min = parseFloat(minAmount) }
		if (maxAmount !== "" && !isNaN(parseFloat(maxAmount))) { out.max = parseFloat(maxAmount) }
		if (ratioMin !== "" && !isNaN(parseFloat(ratioMin))) { out.ratio_min = parseFloat(ratioMin) }
		if (ratioMax !== "" && !isNaN(parseFloat(ratioMax))) { out.ratio_max = parseFloat(ratioMax) }
		if (onlyVip) { out.only_vip = 1 }
		return out
	}, [typeFilter, selectedCoin?.tick, minAmount, maxAmount, ratioMin, ratioMax, showMine, onlyVip, orderBy, orderType])

	// Active filter badges (modal filters only) — onRemove clears that field
	const activeFilterBadges = useMemo(() => {
		const badges = []
		if (showMine) badges.push({ key: "showMine", label: "Mis ofertas", onRemove: () => setFilter("showMine", false) })
		if (minAmount !== "") badges.push({ key: "minAmount", label: `Min: $${minAmount}`, onRemove: () => setFilter("minAmount", "") })
		if (maxAmount !== "") badges.push({ key: "maxAmount", label: `Max: $${maxAmount}`, onRemove: () => setFilter("maxAmount", "") })
		if (ratioMin !== "") badges.push({ key: "ratioMin", label: `Ratio ≥ ${ratioMin}`, onRemove: () => setFilter("ratioMin", "") })
		if (ratioMax !== "") badges.push({ key: "ratioMax", label: `Ratio ≤ ${ratioMax}`, onRemove: () => setFilter("ratioMax", "") })
		if (onlyVip) badges.push({ key: "onlyVip", label: "Solo VIP", onRemove: () => setFilter("onlyVip", false) })
		return badges
	}, [showMine, minAmount, maxAmount, ratioMin, ratioMax, onlyVip, setFilter])

	return { filters, setFilter, resetFilters, orderBy, orderType, hasActiveFilters, apiFilters, activeFilterBadges }
}
