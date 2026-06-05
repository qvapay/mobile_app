import { useReducer, useState, useEffect, useMemo } from "react"
import { Alert, Share } from "react-native"
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

// Toast
import { toast } from "sonner-native"

// Cache key prefix for P2P offers
const P2P_CACHE_KEY = "p2p_cache_"

const initialOffer = { p2p: null, isLoading: false, error: null, refreshing: false, rating: 0 }
function offerReducer(state, action) {
	switch (action.type) {
		case "set": return { ...state, [action.field]: action.value }
		default: return state
	}
}

const initialLoading = { apply: false, cancel: false, received: false, markPaid: false }
function loadingReducer(state, action) {
	switch (action.type) {
		case "set": return { ...state, [action.field]: action.value }
		default: return state
	}
}

const initialEdit = { show: false, amount: "", receive: "", message: "", onlyVip: false, loading: false }
function editReducer(state, action) {
	switch (action.type) {
		case "open": return { show: true, amount: action.amount, receive: action.receive, message: action.message, onlyVip: action.onlyVip, loading: false }
		case "set": return { ...state, [action.field]: action.value }
		default: return state
	}
}

// Owns the P2P offer lifecycle: cache-first load, 5s polling on active statuses,
// derived role/permission flags, the counterparty profile, and every trade action
// (apply, cancel, mark-paid, confirm-received, edit, rate, share). `fetchChat` is
// injected so polling and pull-to-refresh keep the chat in sync.
export default function useP2POfferDetail({ p2p_uuid, user, navigation, fetchChat }) {

	const { theme } = useTheme()
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	const [offer, dispatchOffer] = useReducer(offerReducer, initialOffer)
	const { p2p, isLoading, error, refreshing, rating } = offer
	const setP2p = (v) => dispatchOffer({ type: "set", field: "p2p", value: v })
	const setRating = (v) => dispatchOffer({ type: "set", field: "rating", value: v })

	const [loading, dispatchLoading] = useReducer(loadingReducer, initialLoading)
	const setLoading = (field, value) => dispatchLoading({ type: "set", field, value })

	const [edit, dispatchEdit] = useReducer(editReducer, initialEdit)
	const setEdit = (field, value) => dispatchEdit({ type: "set", field, value })

	const [peerProfile, setPeerProfile] = useState(null)
	const [txIdInput, setTxIdInput] = useState("")
	const [showApplyConfirm, setShowApplyConfirm] = useState(false)

	// Open peer profile screen, skipping self-taps
	const openPeerProfile = (u) => {
		if (!u?.uuid || u.uuid === user?.uuid) return
		navigation.navigate(ROUTES.P2P_USER_SCREEN, { uuid: u.uuid })
	}

	// Fetch P2P from server and cache
	const fetchP2P = async () => {
		const cacheKey = `${P2P_CACHE_KEY}${p2p_uuid}`
		try {
			dispatchOffer({ type: "set", field: "isLoading", value: true })
			const response = await p2pApi.show(p2p_uuid)
			if (response.success) {
				const payload = response.data?.p2p || response.data
				setP2p(payload)
				setRating(payload?.rating || 0)
				// Save fresh data to cache
				try { await AsyncStorage.setItem(cacheKey, JSON.stringify(payload)) } catch { /* ignore */ }
			} else { dispatchOffer({ type: "set", field: "error", value: response.error }) }
		} catch (err) {
			dispatchOffer({ type: "set", field: "error", value: err.message })
		} finally { dispatchOffer({ type: "set", field: "isLoading", value: false }) }
	}

	// Load P2P data with cache-first strategy
	const loadP2PData = async () => {
		const cacheKey = `${P2P_CACHE_KEY}${p2p_uuid}`
		// Step 1: Try to load from cache first (instant display)
		try {
			const cachedData = await AsyncStorage.getItem(cacheKey)
			if (cachedData) {
				const parsed = JSON.parse(cachedData)
				setP2p(parsed)
				setRating(parsed?.rating || 0)
			}
		} catch { /* ignore */ }
		// Step 2: Fetch fresh data from server
		await fetchP2P()
	}

	// Load on mount
	useEffect(() => {
		loadP2PData()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Refetch and update cache (no loader)
	const refetchP2P = async () => {
		const cacheKey = `${P2P_CACHE_KEY}${p2p_uuid}`
		try {
			const response = await p2pApi.show(p2p_uuid)
			if (response.success) {
				const payload = response.data?.p2p || response.data
				setP2p(payload)
				try { await AsyncStorage.setItem(cacheKey, JSON.stringify(payload)) } catch { /* ignore */ }
			}
		} catch (e) { /* ignore */ }
	}

	// Auto-polling every 5s for active statuses
	useEffect(() => {
		const activeStatuses = ["open", "processing", "paid"]
		if (!p2p || !activeStatuses.includes(p2p.status)) return
		const interval = setInterval(() => {
			refetchP2P()
			fetchChat()
		}, 5000)
		return () => clearInterval(interval)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [p2p?.status, p2p_uuid])

	// Derived booleans
	const isOwner = useMemo(() => !!(user?.uuid && p2p?.User?.uuid && user.uuid === p2p.User.uuid), [user?.uuid, p2p?.User?.uuid])
	const isPeer = useMemo(() => !!(user?.uuid && p2p?.Peer?.uuid && user.uuid === p2p.Peer.uuid), [user?.uuid, p2p?.Peer?.uuid])
	const payerIsOwner = useMemo(() => (p2p?.type === "buy"), [p2p?.type])
	const isPayer = useMemo(() => (payerIsOwner ? isOwner : isPeer), [payerIsOwner, isOwner, isPeer])
	const isReceiver = useMemo(() => (!isPayer && (isOwner || isPeer)), [isPayer, isOwner, isPeer])

	// Track P2P users for online status
	useEffect(() => {
		const ids = [p2p?.User?.uuid, p2p?.Peer?.uuid].filter(Boolean)
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
					if (!cancelled && res.success) setPeerProfile(res.data)
				} catch { /* ignore — block hides itself when data is missing */ }
			})()
		return () => { cancelled = true }
	}, [displayedUserUuid])

	const peerStats = peerProfile?.stats || null
	const peerReviewsCount = peerProfile?.receivedRatings?.total || 0

	// Offer Status dynamics
	const status = p2p?.status || "open"
	const counterparty = isOwner ? p2p?.Peer : p2p?.User

	// Actions Buttons
	const canCancel = (isOwner || isPeer) && ["open", "paid", "processing"].includes(status)
	const canMarkPaid = isPayer && status === "processing"
	const canConfirmReceived = isReceiver && (status === "paid" || status === "processing")
	const canRatePeer = p2p?.status === "completed"
	const markedAsPaid = p2p?.status === "paid"

	// Contextual status message
	const statusMessage = useMemo(() => {
		if (status === "processing" && isPayer) return { icon: "money-bill-wave", text: "Realiza el pago y marca como pagado", color: theme.colors.warning }
		if (status === "processing" && isReceiver) return { icon: "clock", text: "Esperando que el comprador marque como pagado...", color: theme.colors.secondaryText }
		if (status === "paid" && isPayer) return { icon: "check-double", text: "Has marcado como pagado. Esperando confirmación...", color: theme.colors.success }
		if (status === "paid" && isReceiver) return { icon: "bell", text: "El comprador marcó como pagado. Verifica y confirma.", color: theme.colors.warning }
		if (status === "revision") return { icon: "shield-halved", text: "Esta oferta está en revisión por el equipo de soporte", color: theme.colors.danger }
		return null
	}, [status, isPayer, isReceiver, theme])

	// canApply: only non-owner/non-peer users can apply to an open offer
	const canApply = status === "open" && !isOwner && !isPeer

	// Refresh handler for pull-to-refresh
	const onRefresh = async () => {
		dispatchOffer({ type: "set", field: "refreshing", value: true })
		try {
			await Promise.all([refetchP2P(), fetchChat()])
		} catch (err) {
			// Error handling is done in individual fetch functions
		} finally { dispatchOffer({ type: "set", field: "refreshing", value: false }) }
	}

	// Cancel
	const handleCancel = () => {
		Alert.alert("Cancelar Oferta", "¿Estás seguro de que quieres cancelar esta oferta? Esta acción no se puede deshacer.", [
			{ text: "No", style: "cancel" },
			{
				text: "Sí, Cancelar",
				style: "destructive",
				onPress: async () => {
					try {
						setLoading("cancel", true)
						const res = await p2pApi.cancel(p2p.uuid)
						if (res.success) {
							toast.success("Oferta cancelada")
							refetchP2P()
						} else { toast.error("No se pudo cancelar", { description: String(res.error || "") }) }
					} catch (e) { toast.error("Error", { description: e.message }) }
					finally { setLoading("cancel", false) }
				}
			}
		])
	}

	// Mark paid
	const handleMarkPaid = () => {
		Alert.alert("Confirmar Pago", "¿Has realizado el pago al vendedor? Una vez confirmado, no podrás deshacer esta acción.", [
			{ text: "No", style: "cancel" },
			{
				text: "Sí, he pagado",
				style: "default",
				onPress: async () => {
					try {
						setLoading("markPaid", true)
						const res = await p2pApi.markPaid(p2p.uuid, txIdInput)
						if (res.success) {
							toast.success("Pago marcado como realizado")
							refetchP2P()
						} else { toast.error("No se pudo marcar pago", { description: String(res.error || "") }) }
					} catch (e) { toast.error("Error", { description: e.message }) }
					finally { setLoading("markPaid", false) }
				}
			}
		])
	}

	// Confirm received
	const handleConfirmReceived = () => {
		Alert.alert("Confirmar Recepción", "¿Has recibido el pago del comprador? Esta acción liberará los fondos en garantía.", [
			{ text: "No", style: "cancel" },
			{
				text: "Sí, he recibido", style: "default",
				onPress: async () => {
					try {
						setLoading("received", true)
						const res = await p2pApi.confirmReceived(p2p.uuid)
						if (res.success) {
							toast.success("Pago recibido. Fondos liberados")
							refetchP2P()
						} else { toast.error("No se pudo confirmar", { description: String(res.error || "") }) }
					} catch (e) { toast.error("Error", { description: e.message }) }
					finally { setLoading("received", false) }
				}
			}
		])
	}

	// Apply - core logic
	const doApply = async () => {
		try {
			setLoading("apply", true)
			const res = await p2pApi.apply(p2p.uuid)
			if (res.success) {
				toast.success("Aplicado")
				refetchP2P()
			} else { toast.error("No se pudo aplicar", { description: String(res.error || "") }) }
		} catch (e) { toast.error("Error", { description: e.message }) }
		finally { setLoading("apply", false) }
	}

	// Apply - opens our own confirmation modal (prevents accidental taps)
	const handleApply = () => { setShowApplyConfirm(true) }

	// Confirm apply from our modal
	const handleApplyConfirm = async () => {
		await doApply()
		setShowApplyConfirm(false)
	}

	// Share Offer
	const handleShareIntent = async () => {
		try {
			const result = await Share.share({
				url: `https://www.qvapay.com/p2p/${p2p_uuid}`,
				title: "Oferta P2P",
				message: `Mira esta oferta en QvaPay: https://www.qvapay.com/p2p/${p2p_uuid}`,
				subject: "Mira esta oferta P2P en QvaPay 🔥"
			})
			if (result.action === Share.sharedAction) {
				toast.success("Oferta compartida")
			} else if (result.action === Share.dismissedAction) { toast.info("Compartir cancelado") }
		} catch (err) { toast.error("No se pudo compartir", { description: String(err?.message || err) }) }
	}

	// Open edit modal and populate fields from current offer
	const openEditModal = () => {
		if (!p2p) return
		dispatchEdit({
			type: "open",
			amount: String(p2p.amount || ""),
			receive: String(p2p.receive || ""),
			message: p2p.message || "",
			onlyVip: !!p2p.only_vip,
		})
	}

	// Submit edit
	const handleEdit = async () => {
		const amt = parseFloat(edit.amount)
		const rcv = parseFloat(edit.receive)

		if (isNaN(amt) || amt < 0.1 || amt > 100000) {
			toast.error("Monto inválido", { description: "El monto debe ser entre 0.1 y 100,000" })
			return
		}
		if (isNaN(rcv) || rcv <= 0) {
			toast.error("Valor inválido", { description: "El valor a recibir debe ser mayor a 0" })
			return
		}

		// For SELL offers, check balance if amount increased
		if (p2p.type === "sell") {
			const amountIncrease = amt - parseFloat(p2p.amount || 0)
			if (amountIncrease > 0 && amountIncrease > parseFloat(user?.balance || 0)) {
				toast.error("Balance insuficiente", { description: "No tienes suficiente balance para aumentar el monto" })
				return
			}
		}

		try {
			setEdit("loading", true)
			const payload = {
				amount: amt,
				receive: rcv,
				only_vip: edit.onlyVip ? 1 : 0,
				message: edit.message.trim(),
			}
			const res = await p2pApi.edit(p2p.uuid, payload)
			if (res.success) {
				toast.success("Oferta actualizada")
				setEdit("show", false)
				refetchP2P()
			} else { toast.error("No se pudo editar", { description: String(res.error || "") }) }
		} catch (e) {
			toast.error("Error", { description: e.message })
		} finally { setEdit("loading", false) }
	}

	// Rate peer
	const handleRate = async (newRating) => {
		try {
			setRating(newRating)
			const res = await p2pApi.rateOffer(p2p_uuid, { rating: newRating })
			if (res.success) {
				toast.success("Oferta calificada")
				refetchP2P()
				if (newRating === 5) { setTimeout(() => { maybeRequestReview() }, 1500) }
			} else {
				toast.error("No se pudo calificar", { description: String(res.error || "") })
				setRating(p2p?.rating || 0)
			}
		} catch (err) {
			toast.error("Error", { description: err.message })
			setRating(p2p?.rating || 0)
		}
	}

	return {
		// offer state
		p2p, isLoading, error, refreshing, rating,
		// derived
		isOwner, isPeer, isPayer, isReceiver, status, counterparty,
		canCancel, canMarkPaid, canConfirmReceived, canRatePeer, markedAsPaid,
		canApply, statusMessage, peerStats, peerReviewsCount, isUserOnline,
		// loading flags
		loading,
		// markPaid tx id
		txIdInput, setTxIdInput,
		// apply modal
		showApplyConfirm, setShowApplyConfirm,
		// edit modal
		edit, setEdit,
		// actions
		onRefresh, openPeerProfile, handleCancel, handleMarkPaid, handleConfirmReceived,
		handleApply, handleApplyConfirm, handleShareIntent, openEditModal, handleEdit, handleRate,
	}
}
