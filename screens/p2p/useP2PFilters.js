import { useReducer, useMemo, useCallback } from "react"

const PAGE_SIZE = 30

// Cuando el orden se resuelve en el cliente pedimos una tanda grande de una vez
// en lugar de paginar: ordenar página a página reordenaría la lista cada vez que
// llega una nueva tanda, que es peor que mostrar un top honesto.
const CLIENT_SORT_PAGE_SIZE = 100

/**
 * Orden de la lista. `server: true` lo resuelve el backend (paginable);
 * `server: false` se ordena en el cliente sobre la tanda cargada.
 *
 * "Tasa" y "Reputación" van en cliente a propósito:
 * - el `orderBy=ratio` del backend solo mira las 50 ofertas más recientes y
 *   luego pagina, así que devuelve páginas vacías y no es un ranking real;
 * - por reputación no existe orden en el backend, pero cada oferta ya trae
 *   `User.rating_avg` y sus operaciones completadas.
 */
export const SORT_OPTIONS = [
	{ label: "Reciente", orderBy: "updated_at", orderType: "desc", server: true },
	{ label: "Monto ↓", orderBy: "amount", orderType: "desc", server: true },
	{ label: "Monto ↑", orderBy: "amount", orderType: "asc", server: true },
	{ label: "Mejor tasa", key: "rate", orderType: "desc", server: false },
	{ label: "Reputación", key: "reputation", orderType: "desc", server: false },
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

/** Tasa de una oferta (lo que se compara entre ellas). */
export const offerRate = (offer) => {
	const amount = parseFloat(offer?.amount)
	const receive = parseFloat(offer?.receive)
	if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(receive)) return null
	return receive / amount
}

/** Operaciones completadas de la contraparte (como creador + como peer). */
export const offerUserOps = (offer) => {
	const user = offer?.Peer?.uuid ? offer.Peer : offer?.User
	return (user?._count?.P2P || 0) + (user?._count?.P2P_Peer || 0)
}

/**
 * Aplica los filtros y el orden que el backend NO resuelve, sobre las ofertas
 * ya cargadas. Se exporta para poder testearlo aislado.
 *
 * @param {Array} offers - Ofertas tal cual llegan de la API.
 * @param {object} clientFilters - `{ ratioMin, ratioMax, onlyVip, sort }`.
 * @returns {Array} Ofertas filtradas y ordenadas.
 */
export const applyClientFilters = (offers, { ratioMin, ratioMax, onlyVip, sort } = {}) => {
	let out = offers || []

	if (onlyVip) { out = out.filter((offer) => !!offer.only_vip) }

	if (ratioMin != null) { out = out.filter((offer) => { const r = offerRate(offer); return r != null && r >= ratioMin }) }
	if (ratioMax != null) { out = out.filter((offer) => { const r = offerRate(offer); return r != null && r <= ratioMax }) }

	if (sort === "rate" || sort === "reputation") {
		const score = sort === "rate"
			? (offer) => offerRate(offer) ?? -Infinity
			: (offer) => {
				// Rating primero; a igual rating (o sin valoraciones), manda la
				// experiencia: un 5.0 con 2 operaciones no vale lo que un 4.8 con 300
				const user = offer?.Peer?.uuid ? offer.Peer : offer?.User
				return (Number(user?.rating_avg) || 0) * 1000 + Math.min(offerUserOps(offer), 999)
			}
		// Copia antes de ordenar: `offers` viene del estado de la lista
		out = [...out].sort((a, b) => score(b) - score(a))
	}

	return out
}

/**
 * Owns the P2P marketplace filter state plus everything derived from it: the query
 * params for `GET /p2p/index`, the client-side filters the backend does not
 * support, the "any filter active" flag and the removable badges.
 *
 * Pure state — no requests happen here. The screen feeds `apiFilters` into
 * useP2POffers, which refetches when its `quickKey` changes; modal filters only
 * apply when the screen calls fetch explicitly.
 *
 * IMPORTANTE — reparto servidor/cliente: el backend ignora `ratio_min`,
 * `ratio_max` y `only_vip` (los aceptaba en la URL pero nunca llegaban al
 * WHERE, así que esos filtros no hacían nada). Se resuelven aquí sobre la tanda
 * cargada, y por eso los órdenes de cliente piden una tanda grande.
 *
 * @param {object|null} initialCoin - Preselected coin (e.g. from navigation params); only `tick` is read.
 * @returns {object} Filter API: `filters`, `setFilter`, `resetFilters`, `orderBy`,
 *   `orderType`, `hasActiveFilters`, `apiFilters`, `clientFilters`,
 *   `isClientSorted`, `activeFilterBadges`.
 */
export default function useP2PFilters(initialCoin) {

	const [filters, dispatch] = useReducer(filtersReducer, { ...initialFilters, selectedCoin: initialCoin })
	// Stable identities (dispatch is stable) so consumers can list them in deps safely.
	const setFilter = useCallback((field, value) => dispatch({ type: "set", field, value }), [])
	const resetFilters = useCallback(() => dispatch({ type: "reset" }), [])

	const { typeFilter, selectedCoin, sortIndex, showMine, opAmount, ratioMin, ratioMax, onlyVip } = filters

	const sortOption = SORT_OPTIONS[sortIndex] || SORT_OPTIONS[0]
	const isClientSorted = !sortOption.server
	// Con orden de cliente no se pagina: se pide una tanda grande y se ordena
	const orderBy = sortOption.server ? sortOption.orderBy : "updated_at"
	const orderType = sortOption.server ? sortOption.orderType : "desc"

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

	// Params que el backend SÍ entiende
	const apiFilters = useMemo(() => {
		const out = {
			take: isClientSorted ? CLIENT_SORT_PAGE_SIZE : PAGE_SIZE,
			order: orderType,
			orderBy,
			type: typeFilter,
		}
		if (showMine) { out.my = true }
		if (selectedCoin?.tick) { out.coin = selectedCoin.tick }
		// "Quiero operar $X" → ofertas con al menos ese monto
		const amount = num(opAmount)
		if (amount != null) { out.min = amount }
		return out
	}, [typeFilter, selectedCoin?.tick, opAmount, showMine, orderBy, orderType, isClientSorted])

	// Filtros y orden que resolvemos en el cliente
	const clientFilters = useMemo(() => ({
		ratioMin: num(ratioMin),
		ratioMax: num(ratioMax),
		onlyVip,
		sort: sortOption.server ? null : sortOption.key,
	}), [ratioMin, ratioMax, onlyVip, sortOption])

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

	return { filters, setFilter, resetFilters, orderBy, orderType, hasActiveFilters, apiFilters, clientFilters, isClientSorted, activeFilterBadges }
}
