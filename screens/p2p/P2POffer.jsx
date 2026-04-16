import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { View, Text, StyleSheet, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, TextInput, Pressable, Animated, TouchableOpacity, Alert, Share, Modal, FlatList, Linking, Switch, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import AsyncStorage from "@react-native-async-storage/async-storage"

// Theme
import { useTheme } from "../../theme/ThemeContext"
import { createContainerStyles, createTextStyles } from "../../theme/themeUtils"

// UI Particles
import P2POfferItem from "../../ui/P2POfferItem"
import QPButton from "../../ui/particles/QPButton"
import QPAvatar from "../../ui/particles/QPAvatar"
import QPInput from "../../ui/particles/QPInput"
import QPLoader from "../../ui/particles/QPLoader"
import QPRate from "../../ui/particles/QPRate"
import ProfileContainerHorizontal from "../../ui/ProfileContainerHorizontal"

// Icons
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

// User context
import { useAuth } from "../../auth/AuthContext"

// API
import { p2pApi } from "../../api/p2pApi"

// Toast
import { toast } from "sonner-native"

// Online Status
import { useOnlineStatus } from "../../hooks/OnlineStatusContext"

// Helpers
import { maybeRequestReview } from "../../helpers/inAppReview"
import { getShortDateTime, reduceStringInside, copyTextToClipboard, detectCopyableText } from "../../helpers"

// Haptic
import ReactNativeHapticFeedback from "react-native-haptic-feedback"

// Pull-to-refresh
import { createHiddenRefreshControl } from "../../ui/QPRefreshIndicator"

// Lottie
import LottieView from "lottie-react-native"

// Image picker
import { launchImageLibrary } from "react-native-image-picker"

// FastImage for chat images and sticker GIFs
import FastImage from "@d11/react-native-fast-image"

// Bouncy Checkbox for apply warning modal
import BouncyCheckbox from "react-native-bouncy-checkbox"

// Stickers list (GOLD exclusive)
const P2P_STICKERS = [
	"angry", "bro", "clown", "cry", "cuba", "facepalm", "finger", "guest", "hum", "joy",
	"like", "loading", "lol", "love", "money", "ok", "search", "upset", "who", "yeah"
]
const STICKER_BASE_URL = "https://media.qvapay.com/qvi/"
const CHAT_MEDIA_BASE_URL = "https://media.qvapay.com/"
const MAX_IMAGE_SIZE_MB = 10

// Chat message text with tappable patterns (phones, cards, emails)
const ChatMessageText = ({ text, textStyle, highlightColor }) => {
	const matches = detectCopyableText(text)
	if (matches.length === 0) return <Text style={textStyle}>{text}</Text>

	const parts = []
	let cursor = 0
	for (const m of matches) {
		if (m.start > cursor) parts.push({ text: text.slice(cursor, m.start), copyable: false })
		parts.push({ text: m.value, copyable: true, type: m.type })
		cursor = m.end
	}
	if (cursor < text.length) parts.push({ text: text.slice(cursor), copyable: false })

	return (
		<Text style={textStyle}>
			{parts.map((p, i) =>
				p.copyable ? (
					<Text
						key={i}
						style={{ textDecorationLine: 'underline', color: highlightColor }}
						onPress={() => {
							ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
							// For emails keep original, for phones/cards strip spaces and dashes
							const cleaned = p.type === 'email' ? p.text : p.text.replace(/[\s-]/g, '')
							copyTextToClipboard(cleaned)
						}}
					>
						{p.text}
					</Text>
				) : (
					<Text key={i}>{p.text}</Text>
				)
			)}
		</Text>
	)
}

// Cache key prefix for P2P offers
const P2P_CACHE_KEY = "p2p_cache_"

// P2P Offer Component
const P2POffer = ({ route }) => {

	// User context
	const { user } = useAuth()

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// Online status
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	// States
	const [p2p, setP2p] = useState(null)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState(null)
	const [refreshing, setRefreshing] = useState(false)
	const [rating, setRating] = useState(0)

	// Loading states for actions
	const [loadingApply, setLoadingApply] = useState(false)
	const [loadingCancel, setLoadingCancel] = useState(false)
	const [loadingReceived, setLoadingReceived] = useState(false)
	const [loadingMarkPaid, setLoadingMarkPaid] = useState(false)

	// Chat state
	const [chatMessages, setChatMessages] = useState([])
	const [chatLoading, setChatLoading] = useState(false)
	const [chatError, setChatError] = useState(null)
	const [chatText, setChatText] = useState("")
	const chatScrollRef = useRef(null)

	const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
	const [visibleTimestamps, setVisibleTimestamps] = useState(new Set())
	const messageAnimations = useRef({})

	// Image picker state
	const [selectedImage, setSelectedImage] = useState(null)
	const [sendingImage, setSendingImage] = useState(false)

	// Sticker panel state
	const [showStickerPanel, setShowStickerPanel] = useState(false)

	// Edit modal state
	const [showEditModal, setShowEditModal] = useState(false)
	const [editAmount, setEditAmount] = useState("")
	const [editReceive, setEditReceive] = useState("")
	const [editMessage, setEditMessage] = useState("")
	const [editOnlyVip, setEditOnlyVip] = useState(false)
	const [editLoading, setEditLoading] = useState(false)
	const { height: windowHeight } = useWindowDimensions()

	// Apply warning modal state (30-min limit for sell offers)
	const [showApplyWarning, setShowApplyWarning] = useState(false)
	const [applyWarningAccepted, setApplyWarningAccepted] = useState(false)

	// TX ID input for markPaid
	const [txIdInput, setTxIdInput] = useState("")

	// Keyboard height tracking
	const [keyboardHeight, setKeyboardHeight] = useState(0)
	useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
		const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height))
		const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0))
		return () => { showSub.remove(); hideSub.remove() }
	}, [])
	const keyboardVisible = keyboardHeight > 0

	// Get the P2P UUID
	const { p2p_uuid } = route.params

	// Fetch P2P data - load from cache first, then fetch fresh
	useEffect(() => {
		loadP2PData()
		fetchChat()
		return () => { /* cleanup */ }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Helpers
	const sortMessagesAscending = (messagesArray) => {
		if (!Array.isArray(messagesArray)) return []
		return [...messagesArray].sort((a, b) => {
			const aTime = a.created_at ? new Date(a.created_at).getTime() : (parseInt(a.id, 10) || 0)
			const bTime = b.created_at ? new Date(b.created_at).getTime() : (parseInt(b.id, 10) || 0)
			return aTime - bTime
		})
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
		} catch (err) {
			// error loading cached P2P
		}

		// Step 2: Fetch fresh data from server
		await fetchP2P()
	}

	// Fetch P2P from server and cache
	const fetchP2P = async () => {
		const cacheKey = `${P2P_CACHE_KEY}${p2p_uuid}`
		try {
			setIsLoading(true)
			const response = await p2pApi.show(p2p_uuid)
			if (response.success) {
				const payload = response.data?.p2p || response.data
				setP2p(payload)
				setRating(payload?.rating || 0)

				// Step 3: Save fresh data to cache
				try {
					await AsyncStorage.setItem(cacheKey, JSON.stringify(payload))
				} catch (cacheError) {
					// error caching P2P
				}
			} else {
				setError(response.error)
			}
		} catch (err) {
			setError(err.message)
		} finally { setIsLoading(false) }
	}

	// Fetch chat
	const fetchChat = async () => {
		try {
			setChatLoading(true)
			setChatError(null)
			const response = await p2pApi.getChat(p2p_uuid)
			if (response.success) {
				const raw = response.data?.chat || response.data
				setChatMessages(sortMessagesAscending(raw))
			}
		} catch (err) {
			setChatError(err.message)
			toast.error("Error", { description: err.message })
		} finally { setChatLoading(false) }
	}

	// Auto-scroll to bottom when messages change (only if enabled)
	useEffect(() => {
		if (!autoScrollEnabled) return
		const t = setTimeout(() => { chatScrollRef.current?.scrollToEnd({ animated: true }) }, 50)
		return () => clearTimeout(t)
	}, [chatMessages?.length, autoScrollEnabled])

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

	// Actions - refetch and update cache
	const refetchP2P = async () => {
		const cacheKey = `${P2P_CACHE_KEY}${p2p_uuid}`
		try {
			const response = await p2pApi.show(p2p_uuid)
			if (response.success) {
				const payload = response.data?.p2p || response.data
				setP2p(payload)
				// Update cache with fresh data
				try {
					await AsyncStorage.setItem(cacheKey, JSON.stringify(payload))
				} catch (cacheError) {
					// error updating P2P cache
				}
			}
		} catch (e) { /* ignore */ }
	}

	// Refresh handler for pull-to-refresh
	const onRefresh = async () => {
		setRefreshing(true)
		try {
			await Promise.all([refetchP2P(), fetchChat()])
		} catch (err) {
			// Error handling is done in individual fetch functions
		} finally { setRefreshing(false) }
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
						setLoadingCancel(true)
						const res = await p2pApi.cancel(p2p.uuid)
						if (res.success) {
							toast.success("Oferta cancelada")
							refetchP2P()
						} else { toast.error("No se pudo cancelar", { description: String(res.error || "") }) }
					} catch (e) { toast.error("Error", { description: e.message }) }
					finally { setLoadingCancel(false) }
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
						setLoadingMarkPaid(true)
						const res = await p2pApi.markPaid(p2p.uuid, txIdInput)
						if (res.success) {
							toast.success("Pago marcado como realizado")
							refetchP2P()
						} else { toast.error("No se pudo marcar pago", { description: String(res.error || "") }) }
					} catch (e) { toast.error("Error", { description: e.message }) }
					finally { setLoadingMarkPaid(false) }
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
						setLoadingReceived(true)
						const res = await p2pApi.confirmReceived(p2p.uuid)
						if (res.success) {
							toast.success("Pago recibido. Fondos liberados")
							refetchP2P()
						} else { toast.error("No se pudo confirmar", { description: String(res.error || "") }) }
					} catch (e) { toast.error("Error", { description: e.message }) }
					finally { setLoadingReceived(false) }
				}
			}
		])
	}

	// Apply - core logic
	const doApply = async () => {
		try {
			setLoadingApply(true)
			const res = await p2pApi.apply(p2p.uuid)
			if (res.success) {
				toast.success("Aplicado")
				refetchP2P()
			} else { toast.error("No se pudo aplicar", { description: String(res.error || "") }) }
		} catch (e) { toast.error("Error", { description: e.message }) }
		finally { setLoadingApply(false) }
	}

	// Apply - sell offers show 30-min warning modal, buy offers use simple Alert
	const handleApply = () => {
		if (p2p?.type === "sell" && !user?.vip) {
			setApplyWarningAccepted(false)
			setShowApplyWarning(true)
		} else {
			Alert.alert("Aplicar", "¿Estás seguro de que quieres aplicar a esta oferta?", [
				{ text: "No", style: "cancel" },
				{ text: "Sí, aplicar", style: "default", onPress: doApply }
			])
		}
	}

	// Confirm apply from warning modal
	const handleApplyWarningConfirm = () => {
		setShowApplyWarning(false)
		setApplyWarningAccepted(false)
		doApply()
	}

	// Share Offer
	const handleShareIntent = async () => {
		try {
			const result = await Share.share({
				url: `https://qvapay.com/p2p/${p2p_uuid}`,
				title: "Oferta P2P",
				message: `Mira esta oferta en QvaPay: https://qvapay.com/p2p/${p2p_uuid}`,
				subject: "Mira esta oferta P2P en QvaPay 🔥"
			})

			if (result.action === Share.sharedAction) {
				toast.success("Oferta compartida")
			} else if (result.action === Share.dismissedAction) { toast.info("Compartir cancelado") }
		} catch (err) { toast.error("No se pudo compartir", { description: String(error?.message || error) }) }
	}

	// Open edit modal and populate fields from current offer
	const openEditModal = () => {
		if (!p2p) return
		setEditAmount(String(p2p.amount || ""))
		setEditReceive(String(p2p.receive || ""))
		setEditMessage(p2p.message || "")
		setEditOnlyVip(!!p2p.only_vip)
		setShowEditModal(true)
	}

	// Submit edit
	const handleEdit = async () => {

		const amt = parseFloat(editAmount)
		const rcv = parseFloat(editReceive)

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
			setEditLoading(true)
			const payload = {
				amount: amt,
				receive: rcv,
				only_vip: editOnlyVip ? 1 : 0,
				message: editMessage.trim(),
			}
			const res = await p2pApi.edit(p2p.uuid, payload)
			if (res.success) {
				toast.success("Oferta actualizada")
				setShowEditModal(false)
				refetchP2P()
			} else { toast.error("No se pudo editar", { description: String(res.error || "") }) }

		} catch (e) {
			toast.error("Error", { description: e.message })
		} finally { setEditLoading(false) }
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

	// Send chat
	const handleSendChat = async () => {
		const message = (chatText || "").trim()
		if (message.length === 0) return
		try {
			const res = await p2pApi.sendChat(p2p_uuid, { message })
			if (res.success) {
				setChatText("")
				await fetchChat()
				chatScrollRef.current?.scrollToEnd({ animated: true })
			}
			else { toast.error("No se pudo enviar", { description: String(res.error || "") }) }
		} catch (e) { toast.error("Error", { description: e.message }) }
	}

	// Open image picker
	const handlePickImage = useCallback(() => {
		launchImageLibrary({
			mediaType: 'photo',
			maxWidth: 1200,
			maxHeight: 1200,
			quality: 0.8,
		}, (response) => {
			if (response.didCancel || response.errorCode) return
			const asset = response.assets?.[0]
			if (!asset) return
			// Validate file size (max 10MB)
			if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
				toast.error("Imagen muy grande", { description: `El máximo es ${MAX_IMAGE_SIZE_MB}MB` })
				return
			}
			// Validate file type
			const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg']
			if (asset.type && !validTypes.includes(asset.type.toLowerCase())) {
				toast.error("Formato no soportado", { description: "Solo JPG, PNG y GIF" })
				return
			}
			setSelectedImage(asset)
		})
	}, [])

	// Send image message
	const handleSendImage = async () => {
		if (!selectedImage) return
		try {
			setSendingImage(true)
			const res = await p2pApi.sendChat(p2p_uuid, {
				message: chatText.trim() || undefined,
				image: {
					uri: selectedImage.uri,
					type: selectedImage.type || 'image/jpeg',
					fileName: selectedImage.fileName || 'photo.jpg',
				},
			})
			if (res.success) {
				setSelectedImage(null)
				setChatText("")
				await fetchChat()
				chatScrollRef.current?.scrollToEnd({ animated: true })
			} else {
				toast.error("No se pudo enviar", { description: String(res.error || "") })
			}
		} catch (e) {
			toast.error("Error", { description: e.message })
		} finally {
			setSendingImage(false)
		}
	}

	// Send sticker message
	const handleSendSticker = async (stickerName) => {
		setShowStickerPanel(false)
		try {
			const res = await p2pApi.sendChat(p2p_uuid, { message: `:sticker:${stickerName}.gif` })
			if (res.success) {
				await fetchChat()
				chatScrollRef.current?.scrollToEnd({ animated: true })
			} else {
				toast.error("No se pudo enviar", { description: String(res.error || "") })
			}
		} catch (e) {
			toast.error("Error", { description: e.message })
		}
	}

	// Helper: check if message is a sticker
	const isSticker = (message) => typeof message === 'string' && message.startsWith(':sticker:')
	const getStickerName = (message) => message.replace(':sticker:', '').replace(/\.(webm|gif)$/, '')

	// Toggle timestamp
	const toggleTimestamp = (messageId) => {
		if (!messageAnimations.current[messageId]) { messageAnimations.current[messageId] = new Animated.Value(0) }
		setVisibleTimestamps(prev => {
			const newSet = new Set(prev)
			const isCurrentlyVisible = newSet.has(messageId)
			if (isCurrentlyVisible) {
				// Hide with animation
				Animated.timing(messageAnimations.current[messageId], { toValue: 0, duration: 200, useNativeDriver: true }).start()
				newSet.delete(messageId)
			} else {
				// Show with animation
				newSet.add(messageId)
				Animated.timing(messageAnimations.current[messageId], { toValue: 1, duration: 300, useNativeDriver: true }).start()
			}
			return newSet
		})
	}

	// Loading state check - only show loader if no cached data
	if (isLoading && !p2p) { return (<QPLoader />) }
	if (error) {
		return (
			<View style={containerStyles.subContainer}>
				<View style={[containerStyles.card, { alignItems: "center", justifyContent: "center" }]}>
					<Text style={[textStyles.h5, { color: theme.colors.danger }]}>No se pudo cargar la oferta</Text>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{String(error.error || error.message || error)}</Text>
				</View>
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<View style={[{ flex: 1 }, keyboardVisible && { paddingBottom: keyboardHeight }]}>
				<ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, onRefresh)} >

					{/* Offer Header - Fixed */}
					{/* Offer Header - Fixed */}
					{p2p && (
						<>
							<P2POfferItem offer={p2p} show_buttons={false} show_user={false} />
							{p2p.details && (
								<View style={[containerStyles.card, { marginVertical: 4, paddingVertical: 10, paddingHorizontal: 12 }]}>
									{(() => {
										const rawDetails = (p2p && (p2p.details || p2p.Details)) || null
										const details = Array.isArray(rawDetails)
											? rawDetails
											: (rawDetails && typeof rawDetails === "object") ? Object.entries(rawDetails).map(([k, v]) => ({ name: k, value: String(v ?? "") })) : []

										if (!details || details.length === 0) { return null }

										return (
											<View style={{ gap: 6 }}>
												{details.slice(0, 4).map((d, idx) => {
													const fullValue = d.value || d.val || ""
													const isWallet = d.name === "Wallet" || d.key === "Wallet"
													return (
														<View key={idx} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 20 }}>
															<View style={{ flex: 1, marginRight: 8 }}>
																<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{d.name || d.key}</Text>
															</View>
															<View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
																<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', flexShrink: 1 }]} numberOfLines={2} ellipsizeMode="middle" selectable={true}>
																	{isWallet ? reduceStringInside(fullValue, 8) : fullValue}
																</Text>
																<Pressable onPress={() => copyTextToClipboard(fullValue)} hitSlop={8}>
																	<FontAwesome6 name="copy" size={14} color={theme.colors.secondaryText} iconStyle="regular" />
																</Pressable>
															</View>
														</View>
													)
												})}
											</View>
										)
									})()}
								</View>
							)}
						</>
					)}

					{/* TX ID - shown after buyer marks as paid */}
					{p2p?.tx_id ? (
						<View style={[containerStyles.card, { marginVertical: 4, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', minHeight: 20 }]}>
							<View style={{ flex: 1, marginRight: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>ID de transacción</Text>
							</View>
							<View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', flexShrink: 1 }]} numberOfLines={2} ellipsizeMode="middle" selectable={true}>
									{p2p.tx_id}
								</Text>
								<Pressable onPress={() => copyTextToClipboard(p2p.tx_id)} hitSlop={8}>
									<FontAwesome6 name="copy" size={14} color={theme.colors.secondaryText} iconStyle="regular" />
								</Pressable>
							</View>
						</View>
					) : null}

					{/* Status Message */}
					{statusMessage && (
						<View style={[containerStyles.card, { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4, paddingVertical: 10, paddingHorizontal: 12 }]}>
							<FontAwesome6 name={statusMessage.icon} size={16} color={statusMessage.color} iconStyle="solid" />
							<Text style={[textStyles.h6, { color: statusMessage.color, flex: 1 }]}>{statusMessage.text}</Text>
						</View>
					)}

					{/* TX ID Input for payer when they can mark paid */}
					{canMarkPaid && isPayer && (
						<View style={{ marginVertical: 4 }}>
							<QPInput
								value={txIdInput}
								onChangeText={setTxIdInput}
								placeholder="ID de transacción"
								prefixIconName="hashtag"
							/>
						</View>
					)}

					{status === "open" ? (
						isOwner ? (
							<View style={{ flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: "center" }]}>Estamos buscando un peer interesado en tu oferta.</Text>
								<LottieView source={require("../../assets/lotties/searching.json")} autoPlay loop style={{ width: 250, height: 250 }} />
							</View>
						) : (
							<>
								{p2p?.User && (
									<View style={[containerStyles.card, { paddingVertical: 6, paddingHorizontal: 8 }]}>
										<ProfileContainerHorizontal user={p2p.User} size={40} showUsername={false} isOnline={isUserOnline(p2p.User?.uuid)} />
									</View>
								)}
								<View style={{ flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}>
									<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: "center" }]}>¿Quieres aplicar a esta oferta?</Text>
								</View>
							</>
						)
					) : (
						<View style={[containerStyles.card, { flex: 1, padding: 0, marginVertical: 4 }]}>

							{counterparty && (
								<View style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
									<ProfileContainerHorizontal user={counterparty} size={40} showUsername={false} isOnline={isUserOnline(counterparty?.uuid)} />
								</View>
							)}

							{chatError && (
								<View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
									<Text style={[textStyles.h7, { color: theme.colors.danger }]}>{String(chatError)}</Text>
								</View>
							)}

							{/* Chat Messages - Scrollable Area */}
							<ScrollView
								ref={chatScrollRef}
								style={{ flex: 1 }}
								contentContainerStyle={{
									flexGrow: 1,
									paddingVertical: 4,
									paddingHorizontal: 0
								}}
								showsVerticalScrollIndicator={true}
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="interactive"
								nestedScrollEnabled={false}
								scrollEventThrottle={16}
								onScrollBeginDrag={() => setAutoScrollEnabled(false)}
								onScroll={(e) => {
									const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent
									const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y)
									if (distanceFromBottom < 50) { setAutoScrollEnabled(true) }
								}}
								onMomentumScrollEnd={(e) => {
									const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent
									const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y)
									if (distanceFromBottom < 50) { setAutoScrollEnabled(true) }
								}}
								onContentSizeChange={() => { if (autoScrollEnabled) { setTimeout(() => { chatScrollRef.current?.scrollToEnd({ animated: true }) }, 100) } }}
							>
								{chatMessages.length === 0 && !chatLoading ? (
									<View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
										<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>No hay mensajes aún</Text>
									</View>
								) : (

									// Use peer_id to determine if message is from current user
									chatMessages.map((m, idx) => {

										const mine = m.peer_id && user?.uuid && m.peer_id === user.uuid
										const prevMessage = idx > 0 ? chatMessages[idx - 1] : null
										const nextMessage = idx < chatMessages.length - 1 ? chatMessages[idx + 1] : null
										const prevMine = prevMessage?.peer_id && user?.uuid && prevMessage.peer_id === user.uuid
										const nextMine = nextMessage?.peer_id && user?.uuid && nextMessage.peer_id === user.uuid
										const isConsecutive = prevMine === mine
										const isLastInGroup = nextMine !== mine || idx === chatMessages.length - 1
										const showTimestamp = visibleTimestamps.has(m.id)

										// Get sender info for avatar (use counterparty if not mine)
										const sender = mine ? user : counterparty

										const messageText = m.message || m.text || ""
										const messageIsSticker = isSticker(messageText)
										const hasImage = !!m.image

										// Sticker message - no bubble, just the animation
										if (messageIsSticker) {
											const stickerName = getStickerName(messageText)
											return (
												<View key={m.id || idx} style={[styles.messageContainer, { flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", marginTop: isConsecutive ? 0 : 6, marginBottom: isConsecutive ? 0 : 6 }]}>
													<View style={{ marginHorizontal: 6, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' }}>
														{isLastInGroup ? <QPAvatar user={sender} size={16} /> : null}
													</View>
													<TouchableOpacity onPress={() => m.created_at && toggleTimestamp(m.id)} activeOpacity={0.7}>
														<FastImage
															source={{ uri: `${STICKER_BASE_URL}${stickerName}.gif` }}
															style={{ width: 96, height: 96 }}
															resizeMode={FastImage.resizeMode.contain}
														/>
														{showTimestamp && m.created_at && (
															<Text style={[textStyles.h7, { fontSize: theme.typography.fontSize.xs, color: theme.colors.secondaryText, marginTop: 2, textAlign: mine ? "right" : "left" }]}>
																{getShortDateTime(m.created_at)}
															</Text>
														)}
													</TouchableOpacity>
												</View>
											)
										}

										return (
											<View key={m.id || idx} style={[styles.messageContainer, { flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", marginTop: isConsecutive ? 0 : 6, marginBottom: isConsecutive ? 0 : 6 }]}>

												{/* Avatar - only show on last message in group */}
												<View style={{ marginHorizontal: 6, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' }}>
													{isLastInGroup ? <QPAvatar user={sender} size={16} /> : null}
												</View>

												{/* Message Bubble - Tap for timestamp, Long press to copy */}
												<TouchableOpacity
													onPress={() => m.created_at && toggleTimestamp(m.id)}
													onLongPress={() => {
														if (messageText) {
															ReactNativeHapticFeedback.trigger('impactMedium', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
															copyTextToClipboard(messageText)
														}
													}}
													delayLongPress={400}
													activeOpacity={0.7}
													style={[styles.messageBubble, { backgroundColor: mine ? theme.colors.primary : theme.colors.primary, maxWidth: "75%", borderRadius: mine ? 18 : 18, borderBottomLeftRadius: mine ? 18 : 4, borderBottomRightRadius: mine ? 4 : 18, borderTopRightRadius: mine ? isConsecutive ? 4 : 18 : 18, overflow: 'hidden' }]}>

													{/* Image in message */}
													{hasImage && (
														<Pressable onPress={() => Linking.openURL(`${CHAT_MEDIA_BASE_URL}${m.image}`)}>
															<FastImage
																source={{ uri: `${CHAT_MEDIA_BASE_URL}${m.image}` }}
																style={{ width: 200, height: 150, borderRadius: 12, marginBottom: messageText ? 6 : 0 }}
																resizeMode={FastImage.resizeMode.cover}
															/>
														</Pressable>
													)}

													{/* Text content with tappable patterns */}
													{messageText ? (
														<ChatMessageText
															text={messageText}
															textStyle={[textStyles.h6, { color: theme.colors.primaryText, lineHeight: 20, textAlign: mine ? "right" : "left" }]}
															highlightColor={theme.colors.almostWhite}
														/>
													) : null}

													{/* Show timestamp only when manually toggled */}
													{showTimestamp && m.created_at && (
														<Animated.View style={{ opacity: messageAnimations.current[m.id] || new Animated.Value(0), transform: [{ translateY: (messageAnimations.current[m.id] || new Animated.Value(0)).interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
															<Text style={[{ fontSize: 10, fontFamily: theme.typography.fontFamily.light, color: theme.colors.almostWhite, marginTop: 4, opacity: 0.6, textAlign: mine ? "right" : "left" }]}>
																{getShortDateTime(m.created_at)}
															</Text>
														</Animated.View>
													)}
												</TouchableOpacity>
											</View>
										)
									})
								)}
							</ScrollView>

							{/* Image Preview */}
							{selectedImage && (
								<View style={[styles.imagePreviewContainer, { borderTopColor: theme.colors.border }]}>
									<FastImage source={{ uri: selectedImage.uri }} style={styles.imagePreview} resizeMode={FastImage.resizeMode.cover} />
									<Pressable onPress={() => setSelectedImage(null)} style={[styles.imagePreviewClose, { backgroundColor: theme.colors.danger }]}>
										<FontAwesome6 name="xmark" size={12} color="#fff" iconStyle="solid" />
									</Pressable>
								</View>
							)}

							{/* Chat Input - Fixed at bottom */}
							<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
								<View style={[styles.chatInputContainer, { borderTopColor: theme.colors.border, borderTopWidth: 0.5 }]}>

									{/* Image picker button */}
									<Pressable onPress={handlePickImage} style={[styles.mediaButton, { backgroundColor: theme.colors.elevation }]}>
										<FontAwesome6 name="image" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
									</Pressable>

									{/* Sticker button */}
									<Pressable onPress={() => setShowStickerPanel(true)} style={[styles.mediaButton, { backgroundColor: theme.colors.elevation }]}>
										<FontAwesome6 name="face-smile" size={16} color={theme.colors.secondaryText} iconStyle="regular" />
									</Pressable>

									<TextInput
										value={chatText}
										onChangeText={setChatText}
										placeholder="Escribe tu mensaje..."
										placeholderTextColor={theme.colors.placeholder}
										style={[textStyles.h6, { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, maxHeight: 100 }]}
										multiline
										textAlignVertical="center"
									/>

									{/* Send button: image or text */}
									{selectedImage ? (
										<Pressable onPress={handleSendImage} disabled={sendingImage} style={[styles.sendButton, { backgroundColor: theme.colors.primary, opacity: sendingImage ? 0.5 : 1 }]}>
											<FontAwesome6 name="paper-plane" size={16} color={theme.colors.almostBlack} iconStyle="solid" />
										</Pressable>
									) : (
										<Pressable onPress={handleSendChat} disabled={(chatText || "").trim().length === 0} style={[styles.sendButton, { backgroundColor: (chatText || "").trim().length === 0 ? theme.colors.elevation : theme.colors.primary }]}>
											<FontAwesome6 name="paper-plane" size={16} color={(chatText || "").trim().length === 0 ? theme.colors.secondaryText : theme.colors.almostBlack} iconStyle="solid" />
										</Pressable>
									)}
								</View>
							</TouchableWithoutFeedback>

							{/* Sticker Panel Modal */}
							<Modal visible={showStickerPanel} transparent animationType="slide" onRequestClose={() => setShowStickerPanel(false)}>
								<Pressable style={styles.stickerModalOverlay} onPress={() => setShowStickerPanel(false)}>
									<View style={[styles.stickerPanel, { backgroundColor: theme.colors.background }]}>
										<View style={styles.stickerPanelHeader}>
											<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>Stickers</Text>
											<Pressable onPress={() => setShowStickerPanel(false)}>
												<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
											</Pressable>
										</View>

										{user?.golden_check ? (
											<FlatList
												data={P2P_STICKERS}
												numColumns={4}
												keyExtractor={(item) => item}
												contentContainerStyle={{ paddingVertical: 8 }}
												renderItem={({ item }) => (
													<TouchableOpacity onPress={() => handleSendSticker(item)} style={styles.stickerItem}>
														<FastImage
															source={{ uri: `${STICKER_BASE_URL}${item}.gif` }}
															style={{ width: 64, height: 64 }}
															resizeMode={FastImage.resizeMode.contain}
														/>
													</TouchableOpacity>
												)}
											/>
										) : (
											<View style={styles.stickerLockedContainer}>
												<FontAwesome6 name="crown" size={40} color={theme.colors.gold} iconStyle="solid" />
												<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginTop: 12 }]}>Stickers exclusivos</Text>
												<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: "center", marginTop: 4 }]}>
													Necesitas GOLD para usar stickers
												</Text>
											</View>
										)}
									</View>
								</Pressable>
							</Modal>

						</View>
					)}

				</ScrollView>

				{/* Edit Offer Modal */}
				<Modal visible={showEditModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowEditModal(false)}>
					<Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }} onPress={() => setShowEditModal(false)}>
						<Pressable onPress={() => { }} style={[containerStyles.card, { width: '100%', maxHeight: windowHeight * 0.75, borderRadius: 16, padding: 20 }]}>
							<ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

								{/* Header */}
								<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
									<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Editar Oferta</Text>
									<Pressable onPress={() => setShowEditModal(false)} hitSlop={8}>
										<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
									</Pressable>
								</View>

								{/* Amount */}
								<QPInput
									value={editAmount}
									onChangeText={setEditAmount}
									placeholder="0.00"
									keyboardType="decimal-pad"
									prelabel="Monto (QUSD)"
								/>

								{/* Receive */}
								<QPInput
									value={editReceive}
									onChangeText={setEditReceive}
									placeholder="0.00"
									keyboardType="decimal-pad"
									prelabel="A recibir"
								/>

								{/* Balance warning for SELL offers */}
								{p2p?.type === "sell" && parseFloat(editAmount || 0) > parseFloat(p2p?.amount || 0) && (parseFloat(editAmount || 0) - parseFloat(p2p?.amount || 0)) > parseFloat(user?.balance || 0) && (
									<Text style={[textStyles.h7, { color: theme.colors.danger, marginTop: 4 }]}>
										Balance insuficiente para aumentar el monto
									</Text>
								)}

								{/* Message */}
								<QPInput
									value={editMessage}
									onChangeText={(text) => setEditMessage(text.slice(0, 79))}
									placeholder="Mensaje opcional"
									prelabel="Mensaje"
									multiline
								/>
								<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, textAlign: 'right', marginTop: 2 }]}>
									{editMessage.length}/79
								</Text>

								{/* Only VIP toggle */}
								<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginTop: 4 }}>
									<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>Solo usuarios VIP</Text>
									<Switch value={editOnlyVip} onValueChange={setEditOnlyVip} trackColor={{ true: theme.colors.primary }} />
								</View>

								{/* Submit */}
								<QPButton
									title="Guardar"
									onPress={handleEdit}
									style={{ backgroundColor: theme.colors.primary, marginTop: 12 }}
									textStyle={{ color: theme.colors.buttonText }}
									icon="check"
									iconColor={theme.colors.buttonText}
									iconStyle="solid"
									loading={editLoading}
									disabled={editLoading}
								/>

							</ScrollView>
						</Pressable>
					</Pressable>
				</Modal>

				{/* Apply Warning Modal - 30 min time limit for sell offers */}
				<Modal visible={showApplyWarning} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowApplyWarning(false)}>
					<Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }} onPress={() => setShowApplyWarning(false)}>
						<Pressable onPress={() => { }} style={[containerStyles.card, { width: '100%', maxHeight: windowHeight * 0.75, borderRadius: 16, padding: 20 }]}>

							<ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 4 }} style={{ flexShrink: 1 }}>
								{/* Header */}
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
									<FontAwesome6 name="clock" size={24} color={theme.colors.warning} iconStyle="solid" />
									<Text style={[textStyles.h4, { color: theme.colors.primaryText, flex: 1 }]}>Tiempo límite de 30 minutos</Text>
								</View>

								{/* Warning box */}
								<View style={{ backgroundColor: theme.colors.warning + '15', borderRadius: 10, padding: 14, marginBottom: 14 }}>
									<Text style={[textStyles.h6, { color: theme.colors.warning, lineHeight: 20 }]}>
										Al aplicar a esta oferta de venta, te comprometes a completar el pago en un plazo máximo de <Text style={{ fontFamily: 'Rubik-Bold' }}>30 minutos</Text>. Si no realizas el pago o no te comunicas con el vendedor en ese tiempo, serás expulsado automáticamente de la oferta.
									</Text>
								</View>

								{/* Instructions */}
								<View style={{ marginBottom: 16, gap: 6 }}>
									{[
										"Realiza el pago lo antes posible después de aplicar.",
										"Comunícate con el vendedor a través del chat.",
										"Ingresa el ID de confirmación de tu pago.",
										"Si no completas estos pasos, perderás tu lugar en la oferta."
									].map((text, i) => (
										<View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
											<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 1 }]}>•</Text>
											<Text style={[textStyles.h6, { color: theme.colors.secondaryText, flex: 1 }]}>{text}</Text>
										</View>
									))}
								</View>

								{/* Checkbox */}
								<View style={{ marginBottom: 4 }}>
									<BouncyCheckbox
										size={22}
										fillColor={theme.colors.primary}
										unFillColor={theme.colors.secondaryText}
										text="Entiendo que tengo 30 minutos para completar esta operación o seré expulsado de la oferta."
										iconStyle={{ borderColor: theme.colors.primary }}
										innerIconStyle={{ borderWidth: 2 }}
										textStyle={{ color: theme.colors.secondaryText, textDecorationLine: 'none', fontSize: 13 }}
										isChecked={applyWarningAccepted}
										onPress={(checked) => setApplyWarningAccepted(checked)}
									/>
								</View>
							</ScrollView>

							{/* Buttons - fijos al fondo, fuera del ScrollView */}
							<View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
								<QPButton
									title="Cancelar"
									onPress={() => setShowApplyWarning(false)}
									style={{ flex: 1, backgroundColor: theme.colors.surface }}
									textStyle={{ color: theme.colors.primaryText }}
									disabled={loadingApply}
								/>
								<QPButton
									title="Aplicar"
									onPress={handleApplyWarningConfirm}
									style={{ flex: 1, backgroundColor: theme.colors.primary }}
									textStyle={{ color: theme.colors.buttonText }}
									icon="check"
									iconColor={theme.colors.buttonText}
									iconStyle="solid"
									loading={loadingApply}
									disabled={!applyWarningAccepted || loadingApply}
								/>
							</View>

						</Pressable>
					</Pressable>
				</Modal>

				{/* Action Buttons - Fixed at bottom */}
				<View style={[containerStyles.bottomButtonContainer, { flexDirection: 'row', paddingTop: 8, paddingBottom: keyboardVisible ? 4 : insets.bottom + 4, gap: 8 }]}>

					{canApply && (
						<QPButton
							title="Aplicar"
							onPress={handleApply}
							style={[{ backgroundColor: theme.colors.primary }, styles.actionButton]}
							textStyle={{ color: theme.colors.buttonText }}
							icon="check"
							iconColor={theme.colors.buttonText}
							iconStyle="solid"
							loading={loadingApply}
							disabled={loadingApply}
						/>
					)}

					{canCancel && (
						<QPButton
							title=""
							onPress={handleCancel}
							style={{ width: 56, minHeight: 56, borderRadius: 28, paddingHorizontal: 0, marginRight: 10, backgroundColor: theme.colors.danger }}
							textStyle={{ color: theme.colors.primaryText }}
							icon="xmark"
							iconColor={theme.colors.primaryText}
							iconStyle="solid"
							loading={loadingCancel}
							disabled={loadingCancel}
						/>
					)}

					{canMarkPaid && isPayer && (
						<QPButton
							title="He pagado"
							onPress={handleMarkPaid}
							style={[{ backgroundColor: theme.colors.success }, styles.actionButton]}
							textStyle={{ color: theme.colors.almostBlack }}
							icon="check"
							iconColor={theme.colors.almostBlack}
							iconStyle="solid"
							loading={loadingMarkPaid}
							disabled={loadingMarkPaid || !txIdInput.trim()}
						/>
					)}

					{markedAsPaid && isPayer && (
						<QPButton
							title="Pagado"
							onPress={handleMarkPaid}
							style={[{ backgroundColor: theme.colors.success }, styles.actionButton]}
							textStyle={{ color: theme.colors.almostBlack }}
							icon="check-double"
							iconColor={theme.colors.almostBlack}
							iconStyle="solid"
							disabled={true}
						/>
					)}

					{canConfirmReceived && isReceiver && (
						<QPButton
							title="Pago recibido"
							onPress={handleConfirmReceived}
							style={[{ backgroundColor: theme.colors.primary }, styles.actionButton]}
							textStyle={{ color: theme.colors.almostWhite }}
							icon="money-bill-1-wave"
							iconColor={theme.colors.almostWhite}
							iconStyle="solid"
							loading={loadingReceived}
						/>
					)}

					{/* Edit + Share - Owner of open offer */}
					{p2p?.status === "open" && isOwner && (
						<>
							<View style={{ flex: 1 }} />
							<QPButton
								title=""
								onPress={openEditModal}
								style={{ width: 56, minHeight: 56, borderRadius: 28, paddingHorizontal: 0, backgroundColor: theme.colors.surface }}
								icon="pen-to-square"
								iconColor={theme.colors.primaryText}
								iconStyle="solid"
							/>
							<QPButton
								title=""
								onPress={handleShareIntent}
								style={{ width: 56, minHeight: 56, borderRadius: 28, paddingHorizontal: 0, backgroundColor: theme.colors.primary }}
								icon="share"
								iconColor={theme.colors.almostWhite}
								iconStyle="solid"
							/>
						</>
					)}

					{p2p?.status === "cancelled" && (
						<View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Oferta cancelada</Text>
						</View>
					)}

					{canRatePeer && (
						<View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
							<QPRate value={rating} onRate={handleRate} size={28} readOnly={false} />
						</View>
					)}

				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		paddingHorizontal: 20
	},
	centerContent: {
		justifyContent: 'center',
		alignItems: 'center'
	},
	header: {
		paddingVertical: 20,
		borderBottomWidth: 1,
		borderBottomColor: 'rgba(0,0,0,0.1)',
		marginBottom: 16
	},
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingVertical: 40
	},
	offerCard: {
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 8,
		marginBottom: 8,
		position: 'relative'
	},
	offerHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12
	},
	typeContainer: {
		flexDirection: 'row',
		alignItems: 'center'
	},
	typeBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6
	},
	typeText: {
		textTransform: 'uppercase'
	},
	amountRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4
	},
	coinRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8
	},
	userInfo: {
		marginBottom: 4
	},
	userStats: {
		flexDirection: 'row'
	},
	badgesContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		marginBottom: 8
	},
	badge: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		marginRight: 6,
		marginBottom: 4
	},
	badgeText: {},
	messageRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingTop: 4
	},
	messageText: {
		flex: 1,
		marginRight: 12
	},
	actionButton: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: 56,
	},
	messageContainer: {
		flexDirection: 'row',
		alignItems: 'flex-end',
		overflow: 'hidden'
	},
	messageBubble: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	chatInputContainer: {
		flexDirection: 'row',
		alignItems: 'flex-end',
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderTopWidth: 1,
		gap: 4,
	},
	sendButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: 'center',
		justifyContent: 'center',
	},
	mediaButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
	},
	imagePreviewContainer: {
		padding: 8,
		borderTopWidth: 0.5,
		flexDirection: 'row',
		alignItems: 'center',
	},
	imagePreview: {
		width: 80,
		height: 80,
		borderRadius: 12,
	},
	imagePreviewClose: {
		position: 'absolute',
		top: 4,
		left: 84,
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	stickerModalOverlay: {
		flex: 1,
		justifyContent: 'flex-end',
		backgroundColor: 'rgba(0,0,0,0.4)',
	},
	stickerPanel: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingHorizontal: 16,
		paddingBottom: 30,
		maxHeight: '50%',
	},
	stickerPanelHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 14,
	},
	stickerItem: {
		flex: 1,
		alignItems: 'center',
		paddingVertical: 8,
		maxWidth: '25%',
	},
	stickerLockedContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 40,
	},
})

export default P2POffer