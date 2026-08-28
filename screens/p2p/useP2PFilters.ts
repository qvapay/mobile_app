import { useReducer, useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"

import type { P2PIndexFilters } from "../../api/p2pApi"
import type { Coin } from "../../types/domain"

const PAGE_SIZE = 30

/** Opción de orden: `labelKey` se resuelve con t() en render (nunca en módulo). */
export type SortOption = {
	labelKey: string
	orderBy: string
	orderType: 'asc' | 'desc'
	/** El orden solo es aplicable con una moneda elegida (ver `best_rate`). */
	requiresCoin?: boolean
}

/** Moneda del picker: el catálogo completo, o el `{ tick, name, logo }` sintético que arma P2P.tsx desde route.params. */
export type FilterCoin = Pick<Coin, 'tick'> & Partial<Coin>

/** Estado de los filtros del marketplace (los numéricos viven como string: son inputs). */
export type P2PFiltersState = {
	/**
	 * Lado del mercado. NUNCA es null: el switch del TopBar es un modo, no un
	 * filtro — sin lado elegido la lista mezclaba compras y ventas mientras la
	 * píldora del switch se quedaba transparente, y volver a tocar el lado ya
	 * activo devolvía a ese estado sin nombre.
	 */
	typeFilter: 'buy' | 'sell'
	selectedCoin: FilterCoin | null
	sortIndex: number
	showMine: boolean
	/** "Quiero operar $X" — viaja al backend como `min`. */
	opAmount: string
	ratioMin: string
	ratioMax: string
	onlyVip: boolean
}

/** Campo de `P2PFiltersState` con su valor: mantiene `setFilter` honesto por clave. */
export type P2PFilterAction = {
	[K in keyof P2PFiltersState]: { type: "set", field: K, value: P2PFiltersState[K] }
}[keyof P2PFiltersState] | { type: "reset" }

/** Badge de filtro activo pintado en la barra (tocarlo limpia su campo). */
export type P2PFilterBadge = { key: string, label: string, onRemove: () => void }

/**
 * Orden de la lista. Todos se resuelven en el servidor: desde 2026-08-16 el
 * backend ordena `ratio` (receive/amount), `rating` y `trades` en SQL con
 * paginación real, así que no queda nada que ordenar en el cliente.
 *
 * "Mejor tasa" NO ordena por `ratio`: el ratio es siempre "moneda por USD",
 * pero su dirección se invierte según el lado del mercado — en una oferta de
 * venta (pestaña Comprar) el ratio es lo que PAGAS por dólar, así que menos es
 * mejor; en una de compra es lo que RECIBES, y más es mejor. Pedir `ratio` desc
 * devolvía por tanto las PEORES ofertas primero en la pestaña Comprar. El
 * backend expone `best_rate`, que normaliza el signo por tipo para que `desc`
 * sea siempre "mejor primero" — y exige `type` y `coin` (entre monedas
 * distintas los ratios no son comparables: 400 CUP/USD vs 1.2 MLC/USD
 * ordenarían por moneda, no por tasa), de ahí el `requiresCoin`.
 *
 * El copy no vive aquí: `labelKey` se resuelve con t() en el render (constante
 * de módulo — un literal quedaría congelado en el idioma del arranque).
 */
export const SORT_OPTIONS: SortOption[] = [
	{ labelKey: "p2p.filters.sort.recent", orderBy: "updated_at", orderType: "desc" },
	{ labelKey: "p2p.filters.sort.amountDesc", orderBy: "amount", orderType: "desc" },
	{ labelKey: "p2p.filters.sort.amountAsc", orderBy: "amount", orderType: "asc" },
	{ labelKey: "p2p.filters.sort.bestRate", orderBy: "best_rate", orderType: "desc", requiresCoin: true },
	{ labelKey: "p2p.filters.sort.reputation", orderBy: "rating", orderType: "desc" },
]

const initialFilters: P2PFiltersState = {
	// Comprar por defecto (lado izquierdo del switch = ofertas de VENTA ajenas),
	// como en los P2P de la industria: se entra a comprar
	typeFilter: "sell",
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

function filtersReducer(state: P2PFiltersState, action: P2PFilterAction): P2PFiltersState {
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

const num = (value: string): number | null => {
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
 * @param initialCoin - Preselected coin (e.g. from navigation params); only `tick` is read.
 * @returns Filter API: `filters`, `setFilter`, `resetFilters`, `orderBy`,
 *   `orderType`, `hasActiveFilters`, `apiFilters`, `activeFilterBadges`.
 */
export default function useP2PFilters(initialCoin: FilterCoin | null) {

	// Idioma activo: los badges son copy de render y deben recalcularse al cambiarlo
	const { t } = useTranslation()

	const [filters, dispatch] = useReducer(filtersReducer, { ...initialFilters, selectedCoin: initialCoin })
	// Stable identities (dispatch is stable) so consumers can list them in deps safely.
	// La firma genérica ata `value` al campo: setFilter("showMine", "sí") no compila.
	const setFilter = useCallback(<K extends keyof P2PFiltersState>(field: K, value: P2PFiltersState[K]) => dispatch({ type: "set", field, value } as P2PFilterAction), [])
	const resetFilters = useCallback(() => dispatch({ type: "reset" }), [])

	const { typeFilter, selectedCoin, sortIndex, showMine, opAmount, ratioMin, ratioMax, onlyVip } = filters

	// Orden efectivo: `best_rate` se degrada al de por defecto cuando no es
	// aplicable — sin moneda, o en "Mis ofertas" (mide la conveniencia de QUIEN
	// TOMA la oferta, no la del dueño; el backend responde 400 en ambos casos).
	// La pantalla pide la moneda ANTES de aplicarlo, así que esto es la red de
	// seguridad: sin ella saldría una petición que el servidor rechaza y la
	// lista quedaría vacía.
	const rawSortOption = SORT_OPTIONS[sortIndex] || SORT_OPTIONS[0]
	const sortUnavailable = !!rawSortOption.requiresCoin && (!selectedCoin?.tick || showMine)
	const sortOption = sortUnavailable ? SORT_OPTIONS[0] : rawSortOption
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
	const apiFilters = useMemo<P2PIndexFilters>(() => {
		const out: P2PIndexFilters = {
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
	const activeFilterBadges = useMemo<P2PFilterBadge[]>(() => {
		const badges: P2PFilterBadge[] = []
		if (showMine) badges.push({ key: "showMine", label: t('p2p.filters.myOffers'), onRemove: () => setFilter("showMine", false) })
		if (opAmount !== "") badges.push({ key: "opAmount", label: t('p2p.filters.badges.operate', { amount: opAmount }), onRemove: () => setFilter("opAmount", "") })
		if (ratioMin !== "") badges.push({ key: "ratioMin", label: t('p2p.filters.badges.rateMin', { value: ratioMin }), onRemove: () => setFilter("ratioMin", "") })
		if (ratioMax !== "") badges.push({ key: "ratioMax", label: t('p2p.filters.badges.rateMax', { value: ratioMax }), onRemove: () => setFilter("ratioMax", "") })
		if (onlyVip) badges.push({ key: "onlyVip", label: t('p2p.filters.onlyVip'), onRemove: () => setFilter("onlyVip", false) })
		return badges
	}, [showMine, opAmount, ratioMin, ratioMax, onlyVip, setFilter, t])

	return { filters, setFilter, resetFilters, orderBy, orderType, hasActiveFilters, apiFilters, activeFilterBadges }
}
