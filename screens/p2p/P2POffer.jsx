import { useState, useEffect, useMemo, useRef } from "react"
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, TextInput, Pressable, Animated, TouchableOpacity, Alert, RefreshControl, Share } from "react-native"
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
import Toast from "react-native-toast-message"

// Helpers
import { getShortDateTime, reduceStringInside } from "../../helpers"

// Lottie
import LottieView from "lottie-react-native"

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

	// TX ID input for markPaid
	const [txIdInput, setTxIdInput] = useState("")

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
		} catch (error) {
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
		} catch (error) {
			setError(error.message)
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
		} catch (error) {
			setChatError(error.message)
			Toast.show({ type: "error", text1: "Error", text2: error.message })
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
		} catch (error) {
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
							Toast.show({ type: "success", text1: "Oferta cancelada" })
							refetchP2P()
						} else { Toast.show({ type: "error", text1: "No se pudo cancelar", text2: String(res.error || "") }) }
					} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
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
							Toast.show({ type: "success", text1: "Pago marcado como realizado" })
							refetchP2P()
						} else { Toast.show({ type: "error", text1: "No se pudo marcar pago", text2: String(res.error || "") }) }
					} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
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
							Toast.show({ type: "success", text1: "Pago recibido. Fondos liberados" })
							refetchP2P()
						} else { Toast.show({ type: "error", text1: "No se pudo confirmar", text2: String(res.error || "") }) }
					} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
					finally { setLoadingReceived(false) }
				}
			}
		])
	}

	// Apply
	const handleApply = async () => {
		Alert.alert("Aplicar", "¿Estás seguro de que quieres aplicar a esta oferta?", [
			{ text: "No", style: "cancel" },
			{
				text: "Sí, aplicar", style: "default",
				onPress: async () => {
					try {
						setLoadingApply(true)
						const res = await p2pApi.apply(p2p.uuid)
						if (res.success) {
							Toast.show({ type: "success", text1: "Aplicado" })
							refetchP2P()
						} else { Toast.show({ type: "error", text1: "No se pudo aplicar", text2: String(res.error || "") }) }
					} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
					finally { setLoadingApply(false) }
				}
			}
		])
	}

	// Share Offer
	// TODO: Check if this is a good idea for link sharing
	const handleShareIntent = async () => {
		try {
			const result = await Share.share({
				url: `https://qvapay.com/p2p/${p2p_uuid}`,
				title: "Oferta P2P",
				message: `Mira esta oferta en QvaPay: https://qvapay.com/p2p/${p2p_uuid}`,
				subject: "Mira esta oferta P2P en QvaPay 🔥"
			})

			if (result.action === Share.sharedAction) {
				Toast.show({ type: "success", text1: "Oferta compartida" })
			} else if (result.action === Share.dismissedAction) {
				Toast.show({ type: "info", text1: "Compartir cancelado" })
			}
		} catch (error) {
			Toast.show({ type: "error", text1: "No se pudo compartir", text2: String(error?.message || error) })
		}
	}

	// Rate peer
	const handleRate = async (newRating) => {
		try {
			setRating(newRating)
			const res = await p2pApi.rateOffer(p2p_uuid, { rating: newRating })
			if (res.success) {
				Toast.show({ type: "success", text1: "Oferta calificada" })
				refetchP2P()
			} else {
				Toast.show({ type: "error", text1: "No se pudo calificar", text2: String(res.error.error || "") })
				setRating(p2p?.rating || 0)
			}
		} catch (error) {
			Toast.show({ type: "error", text1: "Error", text2: error.message })
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
			else { Toast.show({ type: "error", text1: "No se pudo enviar", text2: String(res.error || "") }) }
		} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
	}

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
			<KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20} >
				<ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={theme.colors.primary}
							colors={[theme.colors.primary]}
							title="Actualizando..."
							titleColor={theme.colors.secondaryText}
						/>
					}
				>

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
												{details.slice(0, 4).map((d, idx) => (
													<View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', minHeight: 20 }}>
														<View style={{ flex: 1, marginRight: 8 }}>
															<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{d.name || d.key}</Text>
														</View>
														<View style={{ flex: 1.5, alignItems: 'flex-end' }}>
															{(d.name === "Wallet" || d.key === "Wallet") ? (
																<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={2} ellipsizeMode="middle" selectable={true}>
																	{reduceStringInside(d.value || d.val, 8)}
																</Text>
															) : (
																<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={2} ellipsizeMode="middle" selectable={true}>
																	{d.value || d.val}
																</Text>
															)}
														</View>
													</View>
												))}
											</View>
										)
									})()}
								</View>
							)}
						</>
					)}

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
										<ProfileContainerHorizontal user={p2p.User} size={40} showUsername={false} />
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
									<ProfileContainerHorizontal user={counterparty} size={40} showUsername={false} />
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

										return (
											<View key={m.id || idx} style={[styles.messageContainer, { flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", marginTop: isConsecutive ? 0 : 6, marginBottom: isConsecutive ? 0 : 6 }]}>

												{/* Avatar - only show on last message in group */}
												<View style={{ marginHorizontal: 6, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' }}>
													{isLastInGroup ? <QPAvatar user={sender} size={16} /> : null}
												</View>

												{/* Message Bubble - Touchable */}
												<TouchableOpacity
													onPress={() => m.created_at && toggleTimestamp(m.id)} activeOpacity={0.7}
													style={[styles.messageBubble, { backgroundColor: mine ? theme.colors.primary : theme.colors.primary, maxWidth: "75%", borderRadius: mine ? 18 : 18, borderBottomLeftRadius: mine ? 18 : 4, borderBottomRightRadius: mine ? 4 : 18, borderTopRightRadius: mine ? isConsecutive ? 4 : 18 : 18 }]}>
													<Text style={[textStyles.h6, { color: theme.colors.primaryText, lineHeight: 20, textAlign: mine ? "right" : "left" }]}>
														{m.message || m.text || ""}
													</Text>
													{/* Show timestamp only when manually toggled */}
													{showTimestamp && m.created_at && (
														<Animated.View style={{
															opacity: messageAnimations.current[m.id] || new Animated.Value(0),
															transform: [{
																translateY: (messageAnimations.current[m.id] || new Animated.Value(0)).interpolate({
																	inputRange: [0, 1],
																	outputRange: [10, 0]
																})
															}]
														}}>
															<Text style={[textStyles.h7, { fontSize: 10, fontFamily: theme.typography.fontFamily.light, color: theme.colors.almostBlack, marginTop: 4, opacity: 0.4, textAlign: mine ? "right" : "left" }]}>
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

							{/* Chat Input - Fixed at bottom */}
							<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
								<View style={[styles.chatInputContainer, { borderTopColor: theme.colors.border, borderTopWidth: 0.5 }]}>
									<TextInput
										value={chatText}
										onChangeText={setChatText}
										placeholder="Escribe tu mensaje..."
										placeholderTextColor={theme.colors.placeholder}
										style={[textStyles.h6, { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, maxHeight: 100 }]}
										multiline
										textAlignVertical="center"
									/>
									<Pressable onPress={handleSendChat} disabled={(chatText || "").trim().length === 0} style={[styles.sendButton, { backgroundColor: (chatText || "").trim().length === 0 ? theme.colors.elevation : theme.colors.primary }]}>
										<FontAwesome6 name="paper-plane" size={16} color={(chatText || "").trim().length === 0 ? theme.colors.secondaryText : theme.colors.almostBlack} iconStyle="solid" />
									</Pressable>
								</View>
							</TouchableWithoutFeedback>

						</View>
					)}

				</ScrollView>

				{/* Action Buttons - Fixed at bottom */}
				<View style={[containerStyles.bottomButtonContainer, { flexDirection: 'row', paddingBottom: insets.bottom + 16 }]}>

					{canApply && (
						<QPButton
							title="Aplicar"
							onPress={handleApply}
							style={[{ backgroundColor: theme.colors.primary }, styles.actionButton]}
							textStyle={{ color: theme.colors.primaryText }}
							icon="check"
							iconColor={theme.colors.primaryText}
							iconStyle="solid"
							loading={loadingApply}
							disabled={loadingApply}
						/>
					)}

					{canCancel && (
						<QPButton
							title=""
							onPress={handleCancel}
							style={{ width: 60, borderRadius: 30, paddingHorizontal: 0, marginRight: 10, backgroundColor: theme.colors.danger }}
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

					{/* Share Intent */}
					{p2p?.status === "open" && isOwner && (
						<>
							<View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}></View>
							<QPButton
								title=""
								onPress={handleShareIntent}
								style={{ width: 60, borderRadius: 30, paddingHorizontal: 0, marginRight: 10, backgroundColor: theme.colors.primary }}
								textStyle={{ color: theme.colors.almostWhite }}
								icon="share"
								iconColor={theme.colors.almostWhite}
								iconStyle="solid"
								disabled={false}
							/>
						</>
					)}

					{p2p?.status === "cancelled" && (
						<View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 }}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Oferta cancelada</Text>
						</View>
					)}

					{canRatePeer && (
						<View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 }}>
							<QPRate value={rating} onRate={handleRate} size={28} readOnly={false} />
						</View>
					)}

				</View>
			</KeyboardAvoidingView>
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
		fontSize: 10,
		fontWeight: 'bold',
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
	badgeText: {
		fontSize: 10,
		fontWeight: 'bold'
	},
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
})

export default P2POffer