import { useReducer, useState, useEffect, useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Share } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"

import { ROUTES } from "../../routes"

// Theme
import { useTheme } from "../../theme/ThemeContext"

// Hooks
import { useOnlineStatus } from "../../hooks/OnlineStatusContext"

// API
import { p2pApi } from "../../api/p2pApi"

// Helpers
import { maybeRequestReview } from "../../helpers/inAppReview"
import {
	isFlexibleOffer, isActiveOrder, findActiveOrder, findOrder, projectOrder, orderCancelKind,
	checkTakeAmount, checkFlexibleEdit, availableReceive, takeBounds, fromCents,
} from "./p2pFlexible"

// Toast
import { toast } from "sonner-native"

import type { NavigationProp } from "@react-navigation/native"
import type { MutableRefObject } from "react"
import type { P2POffer, P2POrder, P2PStatus, P2PUser, User } from "../../types/domain"
import type { RootStackParamList } from "../../types/navigation"
import type { PeerProfilePayload, PeerStats } from "./p2pQueries"

// Cache key prefix for P2P offers
const P2P_CACHE_KEY = "p2p_cache_"

/** Estado de la oferta en pantalla (la caché de AsyncStorage la puebla antes que el fetch). */
type OfferState = {
	p2p: P2POffer | null
	isLoading: boolean
	error: string | null | undefined
	refreshing: boolean
	rating: number
}

type OfferAction = { [K in keyof OfferState]: { type: "set", field: K, value: OfferState[K] } }[keyof OfferState]

const initialOffer: OfferState = { p2p: null, isLoading: false, error: null, refreshing: false, rating: 0 }
function offerReducer(state: OfferState, action: OfferAction): OfferState {
	switch (action.type) {
		case "set": return { ...state, [action.field]: action.value }
		default: return state
	}
}

/** Un flag por acción de trade: dos botones nunca comparten spinner. */
export type TradeActionLoading = { apply: boolean, cancel: boolean, received: boolean, markPaid: boolean }

type LoadingAction = { type: "set", field: keyof TradeActionLoading, value: boolean }

const initialLoading: TradeActionLoading = { apply: false, cancel: false, received: false, markPaid: false }
function loadingReducer(state: TradeActionLoading, action: LoadingAction): TradeActionLoading {
	switch (action.type) {
		case "set": return { ...state, [action.field]: action.value }
		default: return state
	}
}

/** Formulario del modal de edición (montos como string: son inputs). */
export type EditState = {
	show: boolean
	amount: string
	receive: string
	message: string
	onlyVip: boolean
	loading: boolean
	/** Por rango: nuevo disponible y límites por orden (`amount` no se usa ahí). */
	available: string
	orderMin: string
	orderMax: string
}

/** Setter por campo del formulario de edición, atado al tipo de cada uno. */
export type SetEditField = <K extends keyof EditState>(field: K, value: EditState[K]) => void

type EditAction =
	| { type: "open", amount: string, receive: string, message: string, onlyVip: boolean, available?: string, orderMin?: string, orderMax?: string }
	| { [K in keyof EditState]: { type: "set", field: K, value: EditState[K] } }[keyof EditState]

/** Aviso contextual del estado del trade (icono + copy + color del tema). */
export type StatusMessage = { icon: string, text: string, color: string }

/** Acción de trade pendiente de confirmación en el modal temático. */
export type ConfirmModalAction = "cancel" | "dispute" | "markPaid" | "received"

const initialEdit: EditState = { show: false, amount: "", receive: "", message: "", onlyVip: false, loading: false, available: "", orderMin: "", orderMax: "" }
function editReducer(state: EditState, action: EditAction): EditState {
	switch (action.type) {
		case "open": return { show: true, amount: action.amount, receive: action.receive, message: action.message, onlyVip: action.onlyVip, loading: false, available: action.available ?? "", orderMin: action.orderMin ?? "", orderMax: action.orderMax ?? "" }
		case "set": return { ...state, [action.field]: action.value }
		default: return state
	}
}

/**
 * Owns the P2P offer lifecycle for the P2POffer screen: cache-first load, 5s polling
 * on active statuses, derived role/permission flags, the counterparty profile, and
 * every trade action (apply, cancel, mark-paid, confirm-received, edit, rate, share).
 *
 * Loading is cache-first: the AsyncStorage snapshot (`p2p_cache_{uuid}`) renders
 * instantly, then `GET /p2p/{uuid}` (p2pApi.show) refreshes it and rewrites the cache.
 * While the offer status is open/processing/paid, a 5s interval:
 * - always refetches the offer silently (offer status has no SSE — polling is the
 *   only status transport), and
 * - calls the injected `fetchChat` ONLY when `chatStreamLiveRef.current` is false.
 *   That ref is the `connectedRef` handed to useP2PChatSSE, which mirrors the stream
 *   state into it; reading a ref (not state) lets the interval skip the chat fetch
 *   without re-creating itself on every connect/disconnect.
 * Pull-to-refresh (`onRefresh`) refetches offer + chat unconditionally. The peer
 * profile (`GET /p2p/user/{uuid}` via p2pApi.peerProfile) is fetched for whichever
 * user the viewer is evaluating (creator on open offers, counterparty otherwise).
 *
 * Range offers (`offer_kind: 'flexible'`): every part taken is an ORDER with its
 * own payment, chat and dispute. The screen works on ONE selected order at a time
 * — the route's `order` param, else the taker's own live order — projected over
 * its parent offer with the shape of a fixed offer (`projectOrder`), so the trade
 * room below is the same one. With no order selected the screen is the offer
 * overview (`isFlexibleOverview`): availability, range, the owner's order list,
 * and taking a part (`applyAmount`). Every trade action then carries `?order=`.
 *
 * @param params.p2p_uuid - Offer UUID (from the route / deep link).
 * @param params.orderUuid - Order UUID of a range offer (route param / push), if any.
 * @param params.user - Authenticated user (uuid + balance) for role flags and edit validation.
 * @param params.navigation - React Navigation object (peer profile pushes).
 * @param params.fetchChat - From useP2PChat: full chat refetch, used by the 5s poll and pull-to-refresh.
 * @param params.chatStreamLiveRef - Ref mirroring the SSE connected state (shared with useP2PChatSSE as `connectedRef`).
 * @returns Offer API for the screen:
 *   state — `p2p`, `isLoading`, `error`, `refreshing`, `rating`;
 *   derived — `isOwner`, `isPeer`, `isPayer`, `isReceiver`, `status`, `counterparty`,
 *   `canCancel`, `canMarkPaid`, `canConfirmReceived`, `canRatePeer`, `markedAsPaid`,
 *   `canApply`, `statusMessage`, `peerStats`, `peerReviewsCount`, `isUserOnline`;
 *   per-action `loading` flags; `txIdInput`/`setTxIdInput` (mark-paid tx id);
 *   `showApplyConfirm`/`setShowApplyConfirm` and `edit`/`setEdit` modal state;
 *   `confirmModal`/`closeConfirmModal`/`confirmModalAction` — the themed
 *   confirmation flow for cancel/mark-paid/release (handlers only open it);
 *   actions — `onRefresh`, `openPeerProfile`, `handleCancel`, `handleMarkPaid`,
 *   `handleConfirmReceived`, `handleApply`, `handleApplyConfirm`, `handleShareIntent`,
 *   `openEditModal`, `handleEdit`, `handleRate`.
 */
export default function useP2POfferDetail({ p2p_uuid, orderUuid = null, user, navigation, fetchChat, chatStreamLiveRef }: {
	p2p_uuid: string
	orderUuid?: string | null
	user: User | null
	navigation: NavigationProp<RootStackParamList>
	fetchChat: () => void | Promise<void>
	chatStreamLiveRef?: MutableRefObject<boolean>
}) {

	const { theme } = useTheme()
	// Idioma activo: statusMessage es copy de render y debe recalcularse al cambiarlo
	const { t } = useTranslation()
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	const [offer, dispatchOffer] = useReducer(offerReducer, initialOffer)
	// `rawP2p` = la oferta tal cual llega; `p2p` (abajo) = la que pinta la pantalla,
	// que en una oferta por rango con orden seleccionada es la proyección de la orden
	const { p2p: rawP2p, isLoading, error, refreshing, rating } = offer
	// Stable setters (dispatch is stable) so the fetch helpers below can be memoized.
	const setP2p = useCallback((v: P2POffer | null) => dispatchOffer({ type: "set", field: "p2p", value: v }), [])
	const setRating = useCallback((v: number) => dispatchOffer({ type: "set", field: "rating", value: v }), [])

	const [loading, dispatchLoading] = useReducer(loadingReducer, initialLoading)
	const setLoading = (field: keyof TradeActionLoading, value: boolean) => dispatchLoading({ type: "set", field, value })

	const [edit, dispatchEdit] = useReducer(editReducer, initialEdit)
	const setEdit: SetEditField = (field, value) => dispatchEdit({ type: "set", field, value } as EditAction)

	const [peerProfile, setPeerProfile] = useState<PeerProfilePayload | null>(null)
	const [txIdInput, setTxIdInput] = useState("")
	const [showApplyConfirm, setShowApplyConfirm] = useState(false)
	// Por rango: la parte que el taker quiere tomar (input del modal de aplicar)
	const [applyAmount, setApplyAmount] = useState("")
	// Orden elegida a mano: string = esa orden; null = la vista de la oferta (tras
	// "Ver oferta"); undefined = automático (la orden viva del taker, si tiene)
	const [explicitOrder, setExplicitOrder] = useState<string | null | undefined>(orderUuid ?? undefined)
	useEffect(() => { setExplicitOrder(orderUuid ?? undefined) }, [orderUuid])
	// Which trade action awaits confirmation in the themed modal: 'cancel' | 'markPaid' | 'received' | null
	const [confirmModal, setConfirmModal] = useState<ConfirmModalAction | null>(null)

	// Open peer profile screen, skipping self-taps
	const openPeerProfile = (u: P2PUser | null | undefined) => {
		if (!u?.uuid || u.uuid === user?.uuid) return
		navigation.navigate(ROUTES.P2P_USER_SCREEN, { uuid: u.uuid })
	}

	// Fetch P2P from server and cache
	const fetchP2P = useCallback(async () => {
		const cacheKey = `${P2P_CACHE_KEY}${p2p_uuid}`
		try {
			dispatchOffer({ type: "set", field: "isLoading", value: true })
			const response = await p2pApi.show(p2p_uuid)
			if (response.success) {
				// El detalle llega pelado o envuelto en `{ p2p }` (P2PShowPayload)
				const payload = ((response.data as { p2p?: P2POffer } | undefined)?.p2p || response.data) as P2POffer | null
				setP2p(payload)
				setRating(payload?.rating || 0)
				// Save fresh data to cache
				try { await AsyncStorage.setItem(cacheKey, JSON.stringify(payload)) } catch { /* ignore */ }
			} else { dispatchOffer({ type: "set", field: "error", value: response.error }) }
		} catch (err) {
			dispatchOffer({ type: "set", field: "error", value: (err as Error).message })
		} finally { dispatchOffer({ type: "set", field: "isLoading", value: false }) }
	}, [p2p_uuid, setP2p, setRating])

	// Load P2P data with cache-first strategy
	const loadP2PData = useCallback(async () => {
		const cacheKey = `${P2P_CACHE_KEY}${p2p_uuid}`
		// Step 1: Try to load from cache first (instant display)
		try {
			const cachedData = await AsyncStorage.getItem(cacheKey)
			if (cachedData) {
				const parsed = JSON.parse(cachedData) as P2POffer
				setP2p(parsed)
				setRating(parsed?.rating || 0)
			}
		} catch { /* ignore */ }
		// Step 2: Fetch fresh data from server
		await fetchP2P()
	}, [p2p_uuid, fetchP2P, setP2p, setRating])

	// Load on mount (and reload if the offer being viewed changes)
	useEffect(() => {
		loadP2PData()
	}, [loadP2PData])

	// Refetch and update cache (no loader)
	const refetchP2P = useCallback(async () => {
		const cacheKey = `${P2P_CACHE_KEY}${p2p_uuid}`
		try {
			const response = await p2pApi.show(p2p_uuid)
			if (response.success) {
				const payload = ((response.data as { p2p?: P2POffer } | undefined)?.p2p || response.data) as P2POffer | null
				setP2p(payload)
				try { await AsyncStorage.setItem(cacheKey, JSON.stringify(payload)) } catch { /* ignore */ }
			}
		} catch (e) { /* ignore */ }
	}, [p2p_uuid, setP2p])

	// ── Range offers: which order the screen is showing ──────────────────────
	const isFlexible = isFlexibleOffer(rawP2p)
	const isOfferOwner = !!(user?.uuid && rawP2p?.User?.uuid && user.uuid === rawP2p.User.uuid)
	// Un taker solo recibe SUS órdenes, y el backend le permite una viva por oferta
	const myActiveOrder = isFlexible && !isOfferOwner ? findActiveOrder(rawP2p?.Orders) : null
	const selectedOrderUuid = explicitOrder !== undefined ? explicitOrder : (myActiveOrder?.uuid ?? null)
	// Si la orden aún no llegó en `Orders` (push antes del refetch) se ve la oferta
	const selectedOrder: P2POrder | null = isFlexible ? findOrder(rawP2p, selectedOrderUuid) : null
	const isFlexibleOverview = isFlexible && !selectedOrder
	const p2p = useMemo(() => (rawP2p && selectedOrder ? projectOrder(rawP2p, selectedOrder) : rawP2p), [rawP2p, selectedOrder])
	const hasLiveOrders = isFlexible && (rawP2p?.Orders || []).some(isActiveOrder)

	// Auto-polling every 5s for active statuses (a range offer also while any order is live)
	const pollActive = !!p2p && (["open", "processing", "paid"].includes(p2p.status) || (isFlexible && (hasLiveOrders || ["open", "processing", "paid"].includes(rawP2p?.status || ""))))
	useEffect(() => {
		if (!pollActive) return
		const interval = setInterval(() => {
			refetchP2P() // offer status has no SSE — always poll
			if (!chatStreamLiveRef?.current) fetchChat()
		}, 5000)
		return () => clearInterval(interval)
	}, [pollActive, p2p_uuid, refetchP2P, fetchChat, chatStreamLiveRef])

	// Derived booleans
	const isOwner = useMemo(() => !!(user?.uuid && p2p?.User?.uuid && user.uuid === p2p.User.uuid), [user?.uuid, p2p?.User?.uuid])
	const isPeer = useMemo(() => !!(user?.uuid && p2p?.Peer?.uuid && user.uuid === p2p.Peer.uuid), [user?.uuid, p2p?.Peer?.uuid])
	const payerIsOwner = useMemo(() => (p2p?.type === "buy"), [p2p?.type])
	const isPayer = useMemo(() => (payerIsOwner ? isOwner : isPeer), [payerIsOwner, isOwner, isPeer])
	const isReceiver = useMemo(() => (!isPayer && (isOwner || isPeer)), [isPayer, isOwner, isPeer])

	// Track P2P users for online status
	useEffect(() => {
		const ids = [p2p?.User?.uuid, p2p?.Peer?.uuid].filter(Boolean) as string[]
		if (ids.length) trackUsers(ids)
		return () => { if (ids.length) untrackUsers(ids) }
	}, [p2p?.User?.uuid, p2p?.Peer?.uuid, trackUsers, untrackUsers])

	// Decide which user's stats to surface inline:
	// — on open offers, the viewer is evaluating the creator (p2p.User)
	// — on active offers, the viewer cares about the counterparty
	const displayedUserUuid = useMemo(() => {
		if (!p2p) return null
		if (p2p.status === "open" && !isOwner && !isPeer) return p2p?.User?.uuid || null
		if (isOwner) return p2p?.Peer?.uuid || null
		return p2p?.User?.uuid || null
	}, [p2p, isOwner, isPeer])

	// Fetch peer profile (rating/completion/ops/recent review) for the displayed user
	useEffect(() => {
		if (!displayedUserUuid) return
		let cancelled = false
			; (async () => {
				try {
					const res = await p2pApi.peerProfile(displayedUserUuid)
					if (cancelled) return
					// peerProfile está tipado `unknown` en el módulo de API — modelado en p2pQueries
					if (res.success) setPeerProfile(res.data as PeerProfilePayload)
				} catch { /* ignore — block hides itself when data is missing */ }
			})()
		return () => { cancelled = true }
	}, [displayedUserUuid])

	const peerStats: PeerStats | null = peerProfile?.stats || null
	const peerReviewsCount = peerProfile?.receivedRatings?.total || 0

	// Offer Status dynamics
	const status: P2PStatus = p2p?.status || "open"
	const counterparty = isOwner ? p2p?.Peer : p2p?.User

	// Actions Buttons
	// Una orden: quien paga el fiat cancela, quien lo recibe abre disputa (orderCancelKind).
	// La oferta por rango entera solo se cancela sin órdenes vivas (409 si no).
	const orderExit = selectedOrder && p2p ? orderCancelKind({ offerType: p2p.type, isOwner, status }) : null
	const canCancel = selectedOrder
		? orderExit === "cancel"
		: isFlexible
			? isOwner && status === "open" && !hasLiveOrders && !(rawP2p?.OrdersSummary?.active)
			: (isOwner || isPeer) && ["open", "paid", "processing"].includes(status)
	const canDispute = orderExit === "dispute"
	const canMarkPaid = isPayer && status === "processing"
	// En una orden en disputa quien recibe el fiat puede liberar igualmente
	const canConfirmReceived = isReceiver && (status === "paid" || status === "processing" || (!!selectedOrder && status === "revision"))
	// El rating es por oferta fixed: las órdenes por rango no se califican (sin ruta en qpweb)
	const canRatePeer = p2p?.status === "completed" && !isFlexible
	const markedAsPaid = p2p?.status === "paid"

	// Contextual status message
	const statusMessage = useMemo<StatusMessage | null>(() => {
		if (status === "processing" && isPayer) return { icon: "money-bill-wave", text: t('p2p.offer.status.processingPayer'), color: theme.colors.warning }
		if (status === "processing" && isReceiver) return { icon: "clock", text: t('p2p.offer.status.processingReceiver'), color: theme.colors.secondaryText }
		if (status === "paid" && isPayer) return { icon: "check-double", text: t('p2p.offer.status.paidPayer'), color: theme.colors.success }
		if (status === "paid" && isReceiver) return { icon: "bell", text: t('p2p.offer.status.paidReceiver'), color: theme.colors.warning }
		if (status === "revision" && selectedOrder && isPayer) return { icon: "shield-halved", text: t('p2p.flexible.status.revisionPayer'), color: theme.colors.danger }
		if (status === "revision" && selectedOrder && isReceiver) return { icon: "shield-halved", text: t('p2p.flexible.status.revisionReceiver'), color: theme.colors.danger }
		if (status === "revision") return { icon: "shield-halved", text: t('p2p.offer.status.revision'), color: theme.colors.danger }
		return null
	}, [status, isPayer, isReceiver, selectedOrder, theme, t])

	// canApply: only non-owner/non-peer users can apply to an open offer.
	// Por rango: además tiene que poder tomarlas (VIP), quedar al menos el mínimo
	// por orden y no tener ya una orden viva (con una, la pantalla ya está en ella)
	const flexibleTakeable = !!rawP2p && isFlexible && (() => { const b = takeBounds(rawP2p); return b.maxCents > 0 && b.maxCents >= b.minCents })()
	const canApply = isFlexible
		? isFlexibleOverview && status === "open" && !isOwner && rawP2p?.can_take_flexible !== false && flexibleTakeable && !myActiveOrder
		: status === "open" && !isOwner && !isPeer
	// Por rango sin permiso: en vez del botón, "disponible para cuentas VIP"
	const flexibleLocked = isFlexibleOverview && status === "open" && !isOwner && rawP2p?.can_take_flexible === false
	// Taker mirando una orden ya cerrada: puede volver a la oferta (y tomar otra parte)
	const canBackToOffer = !!selectedOrder && !isOwner && !isActiveOrder(selectedOrder)

	// Abrir una orden concreta (lista de órdenes): ruta propia (PUSH, no navigate:
	// es la misma pantalla), así el gesto de volver regresa a la vista de la oferta.
	// Acción literal = StackActions.push, sin importar @react-navigation/native
	// (ESM puro: rompería los tests node de este hook)
	const openOrder = (uuid: string) => {
		navigation.dispatch({ type: "PUSH", payload: { name: ROUTES.P2P_OFFER_SCREEN, params: { p2p_uuid, order: uuid } } })
	}
	const backToOffer = () => setExplicitOrder(null)

	// Refresh handler for pull-to-refresh
	const onRefresh = async () => {
		dispatchOffer({ type: "set", field: "refreshing", value: true })
		try {
			await Promise.all([refetchP2P(), fetchChat()])
		} catch (err) {
			// Error handling is done in individual fetch functions
		} finally { dispatchOffer({ type: "set", field: "refreshing", value: false }) }
	}

	// Trade actions run in two phases: the handler only OPENS the themed confirm
	// modal (P2PConfirmModal); confirmModalAction executes the pending action.

	// Cancelar (o, para quien recibe el fiat en una orden, abrir disputa: misma ruta)
	const doCancel = async () => {
		try {
			setLoading("cancel", true)
			const res = await p2pApi.cancel(p2p!.uuid, selectedOrder?.uuid)
			if (res.success) {
				if (res.data?.status === "revision") toast.success(t('p2p.flexible.toasts.disputeOpened'))
				else toast.success(selectedOrder ? t('p2p.flexible.toasts.orderCancelled') : t('p2p.offer.toasts.cancelled'))
				refetchP2P()
			} else {
				// 409 = disputa repetida u oferta con órdenes vivas: refrescar enseña el estado real
				if (res.status === 409) refetchP2P()
				toast.error(t('p2p.offer.toasts.cancelFailed'), { description: String(res.error || "") })
			}
		} catch (e) { toast.error(t('p2p.common.errorTitle'), { description: (e as Error).message }) }
		finally { setLoading("cancel", false) }
	}

	const doMarkPaid = async () => {
		try {
			setLoading("markPaid", true)
			const res = await p2pApi.markPaid(p2p!.uuid, txIdInput, selectedOrder?.uuid)
			if (res.success) {
				toast.success(t('p2p.offer.toasts.markedPaid'))
				refetchP2P()
			} else { toast.error(t('p2p.offer.toasts.markPaidFailed'), { description: String(res.error || "") }) }
		} catch (e) { toast.error(t('p2p.common.errorTitle'), { description: (e as Error).message }) }
		finally { setLoading("markPaid", false) }
	}

	const doConfirmReceived = async () => {
		try {
			setLoading("received", true)
			const res = await p2pApi.confirmReceived(p2p!.uuid, selectedOrder?.uuid)
			if (res.success) {
				toast.success(t('p2p.offer.toasts.received'))
				refetchP2P()
			} else { toast.error(t('p2p.offer.toasts.confirmFailed'), { description: String(res.error || "") }) }
		} catch (e) { toast.error(t('p2p.common.errorTitle'), { description: (e as Error).message }) }
		finally { setLoading("received", false) }
	}

	const handleCancel = () => setConfirmModal("cancel")
	const handleDispute = () => setConfirmModal("dispute")
	const handleMarkPaid = () => setConfirmModal("markPaid")
	const handleConfirmReceived = () => setConfirmModal("received")
	const closeConfirmModal = () => setConfirmModal(null)

	// Execute whichever action the open modal is confirming, then close it
	const confirmModalAction = async () => {
		try {
			if (confirmModal === "cancel" || confirmModal === "dispute") await doCancel()
			else if (confirmModal === "markPaid") await doMarkPaid()
			else if (confirmModal === "received") await doConfirmReceived()
		} finally { setConfirmModal(null) }
	}

	// Apply - core logic. Devuelve si el modal debe cerrarse.
	const doApply = async (): Promise<boolean> => {
		try {
			setLoading("apply", true)
			if (isFlexible) {
				const check = checkTakeAmount(applyAmount, rawP2p!, Number(user?.balance ?? 0))
				if (!check.ok) return false // el modal ya enseña el motivo y deshabilita el botón
				const res = await p2pApi.apply(rawP2p!.uuid, check.amount)
				if (res.success) {
					toast.success(t('p2p.flexible.toasts.taken', { amount: fromCents(check.cents).toFixed(2) }))
					// La pantalla pasa a la orden recién creada en cuanto llega en `Orders`
					if (res.data?.order) setExplicitOrder(res.data.order)
					setApplyAmount("")
					await refetchP2P()
					return true
				}
				const code = (res.details as { code?: string } | undefined)?.code
				if (code === "ORDER_ALREADY_ACTIVE") {
					// Ya tiene una parte viva: llevarlo a ella en vez de ofrecer otra
					toast.info(t('p2p.flexible.toasts.alreadyActive'))
					setExplicitOrder(undefined)
					await refetchP2P()
					return true
				}
				if (code === "FLEXIBLE_NOT_ENABLED") {
					toast.error(t('p2p.flexible.kycOnlyTitle'), { description: t('p2p.flexible.kycOnlyBody') })
					return true
				}
				// 409 sin código = otro tomó antes y ya no cabe: refrescar el disponible
				if (res.status === 409) refetchP2P()
				toast.error(t('p2p.offer.toasts.applyFailed'), { description: String(res.error || "") })
				return false
			}
			const res = await p2pApi.apply(p2p!.uuid)
			if (res.success) {
				toast.success(t('p2p.offer.toasts.applied'))
				refetchP2P()
			} else { toast.error(t('p2p.offer.toasts.applyFailed'), { description: String(res.error || "") }) }
			return true
		} catch (e) {
			toast.error(t('p2p.common.errorTitle'), { description: (e as Error).message })
			return true
		}
		finally { setLoading("apply", false) }
	}

	// Apply - opens our own confirmation modal (prevents accidental taps)
	const handleApply = () => { setShowApplyConfirm(true) }

	// Confirm apply from our modal (un error de monto deja el modal abierto para corregirlo)
	const handleApplyConfirm = async () => {
		const close = await doApply()
		if (close) setShowApplyConfirm(false)
	}

	// Share Offer
	const handleShareIntent = async () => {
		try {
			// `subject` no forma parte de ShareContent (va en las OPCIONES de iOS):
			// el runtime lo ignora desde siempre — el cast preserva ese comportamiento
			const result = await Share.share({
				url: `https://www.qvapay.com/p2p/${p2p_uuid}`,
				title: t('p2p.offer.share.title'),
				message: t('p2p.offer.share.message', { url: `https://www.qvapay.com/p2p/${p2p_uuid}` }),
				subject: t('p2p.offer.share.subject')
			} as Parameters<typeof Share.share>[0])
			if (result.action === Share.sharedAction) {
				toast.success(t('p2p.offer.toasts.shared'))
			} else if (result.action === Share.dismissedAction) { toast.info(t('p2p.offer.toasts.shareDismissed')) }
		} catch (err) { toast.error(t('p2p.offer.toasts.shareFailed'), { description: String((err as Error | undefined)?.message || err) }) }
	}

	// Open edit modal and populate fields from current offer
	const openEditModal = () => {
		if (!p2p) return
		if (isFlexible && rawP2p) {
			// Por rango se edita lo que QUEDA: el receive de partida es el del disponible
			dispatchEdit({
				type: "open",
				amount: "",
				receive: String(Number(availableReceive(rawP2p).toFixed(8))),
				message: rawP2p.message || "",
				onlyVip: !!rawP2p.only_vip,
				available: String(Number(rawP2p.available_amount || 0)),
				orderMin: String(Number(rawP2p.order_min || 0)),
				orderMax: String(Number(rawP2p.order_max || 0)),
			})
			return
		}
		dispatchEdit({
			type: "open",
			amount: String(p2p.amount || ""),
			receive: String(p2p.receive || ""),
			message: p2p.message || "",
			onlyVip: !!p2p.only_vip,
		})
	}

	// Submit edit of a range offer (only what is left to take)
	const handleFlexibleEdit = async () => {
		const check = checkFlexibleEdit(rawP2p!, { available: edit.available, receive: edit.receive, order_min: edit.orderMin, order_max: edit.orderMax }, Number(user?.balance ?? 0))
		if (!check.ok) {
			toast.error(t('p2p.flexible.edit.invalidTitle'), { description: t(`p2p.flexible.errors.${check.reason}`) })
			return
		}
		try {
			setEdit("loading", true)
			const res = await p2pApi.edit(rawP2p!.uuid, {
				...check.payload,
				only_vip: (edit.onlyVip ? 1 : 0) as 0 | 1,
				message: edit.message.trim(),
			})
			if (res.success) {
				toast.success(t('p2p.offer.toasts.updated'))
				setEdit("show", false)
				refetchP2P()
			} else { toast.error(t('p2p.offer.toasts.editFailed'), { description: String(res.error || "") }) }
		} catch (e) {
			toast.error(t('p2p.common.errorTitle'), { description: (e as Error).message })
		} finally { setEdit("loading", false) }
	}

	// Submit edit
	const handleEdit = async () => {
		if (isFlexible) return handleFlexibleEdit()
		const amt = parseFloat(edit.amount)
		const rcv = parseFloat(edit.receive)

		if (isNaN(amt) || amt < 0.1 || amt > 100000) {
			toast.error(t('p2p.offer.toasts.invalidAmountTitle'), { description: t('p2p.offer.toasts.invalidAmountBody') })
			return
		}
		if (isNaN(rcv) || rcv <= 0) {
			toast.error(t('p2p.offer.toasts.invalidValueTitle'), { description: t('p2p.offer.toasts.invalidValueBody') })
			return
		}

		// For SELL offers, check balance if amount increased
		if (p2p!.type === "sell") {
			// Los decimales del backend viajan como string: parseFloat los acepta, el cast es solo de tipos
			const amountIncrease = amt - parseFloat((p2p!.amount || 0) as string)
			if (amountIncrease > 0 && amountIncrease > parseFloat((user?.balance || 0) as string)) {
				toast.error(t('p2p.offer.toasts.insufficientBalanceTitle'), { description: t('p2p.offer.toasts.insufficientBalanceBody') })
				return
			}
		}

		try {
			setEdit("loading", true)
			const payload = {
				amount: amt,
				receive: rcv,
				only_vip: (edit.onlyVip ? 1 : 0) as 0 | 1,
				message: edit.message.trim(),
			}
			const res = await p2pApi.edit(p2p!.uuid, payload)
			if (res.success) {
				toast.success(t('p2p.offer.toasts.updated'))
				setEdit("show", false)
				refetchP2P()
			} else { toast.error(t('p2p.offer.toasts.editFailed'), { description: String(res.error || "") }) }
		} catch (e) {
			toast.error(t('p2p.common.errorTitle'), { description: (e as Error).message })
		} finally { setEdit("loading", false) }
	}

	// Rate peer
	const handleRate = async (newRating: number) => {
		try {
			setRating(newRating)
			const res = await p2pApi.rateOffer(p2p_uuid, { rating: newRating })
			if (res.success) {
				toast.success(t('p2p.offer.toasts.rated'))
				refetchP2P()
				if (newRating === 5) { setTimeout(() => { maybeRequestReview() }, 1500) }
			} else {
				toast.error(t('p2p.offer.toasts.rateFailed'), { description: String(res.error || "") })
				setRating(p2p?.rating || 0)
			}
		} catch (err) {
			toast.error(t('p2p.common.errorTitle'), { description: (err as Error).message })
			setRating(p2p?.rating || 0)
		}
	}

	return {
		// offer state (`p2p` = lo que se pinta; `rawP2p` = la oferta madre tal cual)
		p2p, rawP2p, isLoading, error, refreshing, rating,
		// range offers
		isFlexible, isFlexibleOverview, selectedOrder, flexibleLocked, canBackToOffer,
		applyAmount, setApplyAmount, openOrder, backToOffer,
		// derived
		isOwner, isPeer, isPayer, isReceiver, status, counterparty,
		canCancel, canDispute, canMarkPaid, canConfirmReceived, canRatePeer, markedAsPaid,
		canApply, statusMessage, peerStats, peerReviewsCount, isUserOnline,
		// loading flags
		loading,
		// markPaid tx id
		txIdInput, setTxIdInput,
		// apply modal
		showApplyConfirm, setShowApplyConfirm,
		// trade-action confirm modal
		confirmModal, closeConfirmModal, confirmModalAction,
		// edit modal
		edit, setEdit,
		// actions
		onRefresh, openPeerProfile, handleCancel, handleDispute, handleMarkPaid, handleConfirmReceived,
		handleApply, handleApplyConfirm, handleShareIntent, openEditModal, handleEdit, handleRate,
	}
}
