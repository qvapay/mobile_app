import { useReducer, useMemo, useCallback } from "react"

const PAGE_SIZE = 30

/**
 * Orden de la lista. Todos se resuelven en el servidor: desde 2026-08-16 el
 * backend ordena `ratio` (receive/amount), `rating` y `trades` en SQL con
 * paginación real, así que no queda nada que ordenar en el cliente.
 */
export const SORT_OPTIONS = [
	{ label: "Reciente", orderBy: "updated_at", orderType: "desc" },
	{ label: "Monto ↓", orderBy: "amount", orderType: "desc" },
	{ label: "Monto ↑", orderBy: "amount", orderType: "asc" },
	{ label: "Mejor tasa", orderBy: "ratio", orderType: "desc" },
	{ label: "Reputación", orderBy: "rating", orderType: "desc" },
]

const initialFilters = {
	typeFilter: null,
	selectedCoin: null,
	sortIndex: 0,
	showMine: false,
	// "Quiero operar $X": muestra ofertas con al menos ese monto disponible
	// (modelo de Binance; sustituye al antiguo rango min/max, que obligaba a
	// pensar en los límites de la oferta ajena en vez de en lo tuyo)
	opAmount: "",
	ratioMin: "",
	ratioMax: "",
	onlyVip: false,
}

function filtersReducer(state, action) {
	switch (action.type) {
		case "set":
			return { ...state, [action.field]: action.value }
		case "reset":
			// El lado del mercado (typeFilter) NO se limpia: vive en el switch del
			// TopBar y es el modo en el que estás, no un filtro más
			return { ...initialFilters, typeFilter: state.typeFilter }
		default:
			return state
	}
}

const num = (value) => {
	const parsed = parseFloat(value)
	return Number.isFinite(parsed) ? parsed : null
}

/**
 * Owns the P2P marketplace filter state plus everything derived from it: the
 * query params for `GET /p2p/index`, the "any filter active" flag and the
 * removable badges.
 *
 * Pure state — no requests happen here. The screen feeds `apiFilters` into
 * useP2POffers, which refetches when its `quickKey` changes; modal filters only
 * apply when the screen calls fetch explicitly.
 *
 * Todo el filtrado y el orden se resuelven en el servidor. Hubo una etapa en
 * la que ratio/VIP y los órdenes por tasa y reputación se calculaban aquí
 * porque el backend los ignoraba; eso solo alcanzaba a la página cargada (una
 * lista podía salir vacía teniendo resultados más allá) y se revirtió en
 * cuanto el servidor pasó a soportarlos.
 *
 * @param {object|null} initialCoin - Preselected coin (e.g. from navigation params); only `tick` is read.
 * @returns {object} Filter API: `filters`, `setFilter`, `resetFilters`, `orderBy`,
 *   `orderType`, `hasActiveFilters`, `apiFilters`, `activeFilterBadges`.
 */
export default function useP2PFilters(initialCoin) {

	const [filters, dispatch] = useReducer(filtersReducer, { ...initialFilters, selectedCoin: initialCoin })
	// Stable identities (dispatch is stable) so consumers can list them in deps safely.
	const setFilter = useCallback((field, value) => dispatch({ type: "set", field, value }), [])
	const resetFilters = useCallback(() => dispatch({ type: "reset" }), [])

	const { typeFilter, selectedCoin, sortIndex, showMine, opAmount, ratioMin, ratioMax, onlyVip } = filters

	const sortOption = SORT_OPTIONS[sortIndex] || SORT_OPTIONS[0]
	const orderBy = sortOption.orderBy
	const orderType = sortOption.orderType

	// Cualquier filtro activo. NO cuenta `typeFilter`: el lado del mercado vive
	// en el switch del TopBar, y contarlo encendía el icono de Filtros por el
	// simple hecho de elegir Comprar o Vender
	const hasActiveFilters = useMemo(() => (
		showMine ||
		!!selectedCoin?.tick ||
		opAmount !== "" ||
		ratioMin !== "" ||
		ratioMax !== "" ||
		onlyVip
	), [showMine, selectedCoin?.tick, opAmount, ratioMin, ratioMax, onlyVip])

	// Todos los filtros viajan al servidor: filtrarlos en el cliente solo
	// alcanzaba a la página cargada, así que una lista podía salir vacía
	// teniendo resultados en las siguientes
	const apiFilters = useMemo(() => {
		const out = {
			take: PAGE_SIZE,
			order: orderType,
			orderBy,
			type: typeFilter,
		}
		if (showMine) { out.my = true }
		if (selectedCoin?.tick) { out.coin = selectedCoin.tick }
		// "Quiero operar $X" → ofertas con al menos ese monto
		const amount = num(opAmount)
		if (amount != null) { out.min = amount }
		const rMin = num(ratioMin)
		if (rMin != null) { out.ratio_min = rMin }
		const rMax = num(ratioMax)
		if (rMax != null) { out.ratio_max = rMax }
		if (onlyVip) { out.only_vip = true }
		return out
	}, [typeFilter, selectedCoin?.tick, opAmount, ratioMin, ratioMax, onlyVip, showMine, orderBy, orderType])

	// Active filter badges (modal filters only) — onRemove clears that field
	const activeFilterBadges = useMemo(() => {
		const badges = []
		if (showMine) badges.push({ key: "showMine", label: "Mis ofertas", onRemove: () => setFilter("showMine", false) })
		if (opAmount !== "") badges.push({ key: "opAmount", label: `Opero $${opAmount}`, onRemove: () => setFilter("opAmount", "") })
		if (ratioMin !== "") badges.push({ key: "ratioMin", label: `Tasa ≥ ${ratioMin}`, onRemove: () => setFilter("ratioMin", "") })
		if (ratioMax !== "") badges.push({ key: "ratioMax", label: `Tasa ≤ ${ratioMax}`, onRemove: () => setFilter("ratioMax", "") })
		if (onlyVip) badges.push({ key: "onlyVip", label: "Solo VIP", onRemove: () => setFilter("onlyVip", false) })
		return badges
	}, [showMine, opAmount, ratioMin, ratioMax, onlyVip, setFilter])

	return { filters, setFilter, resetFilters, orderBy, orderType, hasActiveFilters, apiFilters, activeFilterBadges }
}
