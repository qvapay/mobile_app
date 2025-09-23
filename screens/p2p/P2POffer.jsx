import { useState, useEffect, useMemo, useRef } from "react"
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, TextInput, Pressable, Animated, TouchableOpacity, Alert, RefreshControl } from "react-native"

// Theme
import { useTheme } from "../../theme/ThemeContext"
import { createContainerStyles, createTextStyles } from "../../theme/themeUtils"

// UI Particles
import QPButton from "../../ui/particles/QPButton"
import QPCoin from "../../ui/particles/QPCoin"
import QPAvatar from "../../ui/particles/QPAvatar"
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
import { getTypeText, getShortDateTime, reduceStringInside } from "../../helpers"

// Lottie
import LottieView from "lottie-react-native"

// P2P Offer Component
const P2POffer = ({ route }) => {

	// User context
	const { user } = useAuth()

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// States
	const [p2p, setP2p] = useState(null)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState(null)
	const [loadingReceived, setLoadingReceived] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const [rating, setRating] = useState(0)

	console.log('p2p', p2p)

	// Chat state
	const [chatMessages, setChatMessages] = useState([])
	const [chatLoading, setChatLoading] = useState(false)
	const [chatError, setChatError] = useState(null)
	const [chatText, setChatText] = useState("")
	const chatScrollRef = useRef(null)

	// const chatIntervalRef = useRef(null)

	const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
	const [visibleTimestamps, setVisibleTimestamps] = useState(new Set())
	const messageAnimations = useRef({})

	// Get the P2P UUID
	const { p2p_uuid } = route.params

	// Fetch P2P data
	useEffect(() => {
		fetchP2P()
		fetchChat()
		return () => { /* cleanup */ }
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

	// Fetch P2P
	const fetchP2P = async () => {
		try {
			setIsLoading(true)
			const response = await p2pApi.show(p2p_uuid)
			if (response.success) {
				const payload = response.data?.p2p || response.data
				setP2p(payload)
				// Initialize rating with existing rating from P2P data
				setRating(payload?.rating || 0)
			} else {
				setError(response.error)
				Toast.show({ type: "error", text1: "Error", text2: String(response.error || "No se pudo cargar la oferta") })
			}
		} catch (error) {
			setError(error.message)
			Toast.show({ type: "error", text1: "Error", text2: error.message })
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
	const canConfirmReceived = isReceiver && (status === "paid" || status === "processing" || status === "processing")
	const canRatePeer = p2p?.status === "completed"

	// canApply becomes ready if offer is open and counterparty is not set
	const canApply = status === "open" && counterparty

	// Actions
	const refetchP2P = async () => {
		try {
			const response = await p2pApi.show(p2p_uuid)
			if (response.success) { setP2p(response.data?.p2p || response.data) }
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
		Alert.alert(
			"Cancelar Oferta",
			"¿Estás seguro de que quieres cancelar esta oferta? Esta acción no se puede deshacer.",
			[
				{ text: "No", style: "cancel" },
				{
					text: "Sí, Cancelar",
					style: "destructive",
					onPress: async () => {
						try {
							const res = await p2pApi.cancel(p2p.uuid)
							if (res.success) {
								Toast.show({ type: "success", text1: "Oferta cancelada" })
								refetchP2P()
							} else { Toast.show({ type: "error", text1: "No se pudo cancelar", text2: String(res.error || "") }) }
						} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
					}
				}
			]
		)
	}

	// Mark paid
	const handleMarkPaid = () => {
		Alert.alert(
			"Confirmar Pago",
			"¿Has realizado el pago al vendedor? Una vez confirmado, no podrás deshacer esta acción.",
			[
				{ text: "No", style: "cancel" },
				{
					text: "Sí, he pagado",
					style: "default",
					onPress: async () => {
						try {
							const res = await p2pApi.markPaid(p2p.uuid)
							if (res.success) {
								Toast.show({ type: "success", text1: "Pago marcado como realizado" })
								refetchP2P()
							} else { Toast.show({ type: "error", text1: "No se pudo marcar pago", text2: String(res.error || "") }) }
						} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
					}
				}
			]
		)
	}

	// Confirm received
	const handleConfirmReceived = () => {
		Alert.alert(
			"Confirmar Recepción",
			"¿Has recibido el pago del comprador? Esta acción liberará los fondos en garantía.",
			[
				{ text: "No", style: "cancel" },
				{
					text: "Sí, he recibido",
					style: "default",
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
			]
		)
	}

	// Apply
	const handleApply = () => {
		console.log('handleApply')
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
				Animated.timing(messageAnimations.current[messageId], { toValue: 0, duration: 200, useNativeDriver: true }).start(() => { newSet.delete(messageId) })
			} else {
				// Show with animation
				newSet.add(messageId)
				Animated.timing(messageAnimations.current[messageId], { toValue: 1, duration: 300, useNativeDriver: true }).start()
			}
			return newSet
		})
	}

	// Loading state check
	if (isLoading) { return (<QPLoader />) }
	if (error) {
		return (
			<View style={containerStyles.subContainer}>
				<View style={[containerStyles.card, { alignItems: "center", justifyContent: "center" }]}>
					<Text style={[textStyles.h5, { color: theme.colors.danger }]}>No se pudo cargar la oferta</Text>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{String(error)}</Text>
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
					{p2p && (
						<View style={containerStyles.card}>
							<View style={styles.offerHeader}>
								<View style={styles.typeContainer}>
									<Text style={[styles.typeText, { color: theme.colors.primaryText }]}>{getTypeText(p2p.type)}</Text>
								</View>
								<Text style={[textStyles.caption, { color: theme.colors.primaryText }]}>{new Date(p2p.created_at).toLocaleDateString()}</Text>
							</View>
							<View style={{ gap: 2, marginBottom: 4 }}>
								<View style={styles.coinRow}>
									<View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
										<QPCoin coin={p2p.Coin?.logo} size={20} />
										<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>
											{p2p.Coin?.name}
										</Text>
									</View>
									<View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
										<FontAwesome6 name="money-bill-transfer" size={12} color={theme.colors.primaryText} iconStyle="solid" />
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '400' }]} >
											{Number(p2p.receive / p2p.amount).toFixed(2)}
										</Text>
									</View>
								</View>
								<View style={[styles.amountRow, { marginLeft: 2 }]}>
									<Text style={[textStyles.h2, { color: theme.colors.primary, fontWeight: '800' }]}>${p2p.amount}</Text>
									<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '200' }]}>x</Text>
									<Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>{p2p.receive}</Text>
								</View>
							</View>
							{p2p?.message && (
								<View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
									<FontAwesome6 name="message" size={14} color={theme.colors.primary} iconStyle="solid" />
									<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1} ellipsizeMode="tail">{p2p.message}</Text>
								</View>
							)}
							{(() => {
								const rawDetails = (p2p && (p2p.details || p2p.Details)) || null
								const details = Array.isArray(rawDetails)
									? rawDetails
									: (rawDetails && typeof rawDetails === "object")
										? Object.entries(rawDetails).map(([k, v]) => ({ name: k, value: String(v ?? "") }))
										: []

								if (!details || details.length === 0) { return null }

								return (
									<View style={{ marginTop: 10, gap: 4 }}>
										{details.slice(0, 4).map((d, idx) => (
											<View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
												<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{d.name || d.key}</Text>
												{(d.name === "Wallet" || d.key === "Wallet") ? (
													<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle">{reduceStringInside(d.value || d.val, 8)}</Text>
												) : (
													<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle">{d.value || d.val}</Text>
												)}
											</View>
										))}
									</View>
								)
							})()}
						</View>
					)}

					{status == "open" ? (
						counterparty ? (
							<View style={{ flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: "center" }]}>Aplica, eres counterparty</Text>
							</View>
						) : (
							<View style={{ flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: "center" }]}>Estamos buscando un peer interesado en tu oferta.</Text>
								<LottieView source={require("../../assets/lotties/searching.json")} autoPlay loop style={{ width: 250, height: 250 }} />
							</View>
						)
					) : (
						<View style={[containerStyles.card, { flex: 1, padding: 0, marginVertical: 0, marginBottom: 10 }]}>

							{counterparty && (
								<View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
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
									paddingVertical: 6,
									paddingHorizontal: 0,
									paddingBottom: 6
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
									<View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
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
										const showTimestamp = isLastInGroup || visibleTimestamps.has(m.id)

										// Get sender info for avatar (use counterparty if not mine)
										const sender = mine ? user : counterparty

										return (
											<View key={m.id || idx} style={[styles.messageContainer, { flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", marginTop: isConsecutive ? 2 : 6, marginBottom: isConsecutive ? 2 : 6 }]}>

												{/* Avatar - only show on last message in group */}
												{isLastInGroup ? (<View style={{ marginHorizontal: 6 }}><QPAvatar user={sender} size={16} /></View>) : (<View style={{ width: 16, marginHorizontal: 6 }} />)}

												{/* Message Bubble - Touchable */}
												<TouchableOpacity
													onPress={() => !isLastInGroup && m.created_at && toggleTimestamp(m.id)} activeOpacity={0.7}
													style={[styles.messageBubble, { backgroundColor: mine ? theme.colors.primary : theme.colors.primary, maxWidth: "75%", borderRadius: mine ? 18 : 18, borderBottomLeftRadius: mine ? 18 : 4, borderBottomRightRadius: mine ? 4 : 18, }]}>
													<Text style={[textStyles.h6, { color: theme.colors.primaryText, lineHeight: 20, textAlign: mine ? "right" : "left" }]}>
														{m.message || m.text || ""}
													</Text>
													{/* Show timestamp on last message in group or when manually toggled */}
													{showTimestamp && m.created_at && (
														<Animated.View style={{ opacity: isLastInGroup ? 1 : (messageAnimations.current[m.id] || new Animated.Value(0)), transform: [{ translateY: isLastInGroup ? 0 : (messageAnimations.current[m.id] || new Animated.Value(0)).interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
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
								<View style={[styles.chatInputContainer, { borderTopColor: theme.colors.border }]}>
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
				<View style={[containerStyles.bottomButtonContainer, { flexDirection: 'row' }]}>

					{canApply && (
						<QPButton
							title="Aplicar"
							onPress={handleApply}
							style={[{ backgroundColor: theme.colors.primary }, styles.actionButton]}
							textStyle={{ color: theme.colors.almostBlack }}
							icon="circle-check"
							iconColor={theme.colors.almostBlack}
							iconStyle="solid"
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
						/>
					)}

					{canMarkPaid && (
						<QPButton
							title="He pagado"
							onPress={handleMarkPaid}
							style={[{ backgroundColor: theme.colors.success }, styles.actionButton]}
							textStyle={{ color: theme.colors.almostBlack }}
							icon="circle-check"
							iconColor={theme.colors.almostBlack}
							iconStyle="solid"
						/>
					)}

					{canConfirmReceived && (
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
	listContainer: {
		paddingBottom: 20
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
	messageContainer: {
		marginTop: 4,
		paddingTop: 4,
		overflow: 'hidden'
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
		marginVertical: 4,
	},
	messageBubble: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1, },
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