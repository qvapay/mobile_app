import { useState, useEffect, useMemo, useRef } from "react"
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, TextInput, ActivityIndicator, Pressable } from "react-native"

// Theme
import { useTheme } from "../../theme/ThemeContext"
import { createContainerStyles, createTextStyles } from "../../theme/themeUtils"

// UI Particles
import QPButton from "../../ui/particles/QPButton"
import QPCoin from "../../ui/particles/QPCoin"
import QPAvatar from "../../ui/particles/QPAvatar"

// Icons
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

// User context
import { useAuth } from "../../auth/AuthContext"

// API
import { p2pApi } from "../../api/p2pApi"

// Toast
import Toast from "react-native-toast-message"

// Helpers
import { formatDateTime } from "../../helpers"

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

	// Chat state
	const [chatMessages, setChatMessages] = useState([])
	const [chatLoading, setChatLoading] = useState(false)
	const [chatError, setChatError] = useState(null)
	const [chatText, setChatText] = useState("")
	const chatScrollRef = useRef(null)
	const chatIntervalRef = useRef(null)

	const { p2p_uuid } = route.params

	console.log(p2p_uuid)

	// Fetch P2P data
	useEffect(() => {
		const fetchP2P = async () => {
			try {
				setIsLoading(true)
				const response = await p2pApi.show(p2p_uuid)
				if (response.success) {
					const payload = response.data?.p2p || response.data
					setP2p(payload)
				} else {
					setError(response.error)
					Toast.show({ type: "error", text1: "Error", text2: String(response.error || "No se pudo cargar la oferta") })
				}
			} catch (error) {
				setError(error.message)
				Toast.show({ type: "error", text1: "Error", text2: error.message })
			} finally { setIsLoading(false) }
		}
		fetchP2P()
		return () => { /* cleanup if needed */ }
	}, [p2p_uuid])

	// Fetch chat messages
	const fetchChat = async () => {
		if (!p2p_uuid) return
		try {
			setChatLoading(true)
			const res = await p2pApi.getChat(p2p_uuid)
			if (res.success) {
				const data = res.data?.messages || res.data?.data || []
				setChatMessages(Array.isArray(data) ? data : [])
			} else {
				setChatError(res.error || "No se pudo cargar el chat")
			}
		} catch (e) {
			setChatError(e.message)
		} finally {
			setChatLoading(false)
			setTimeout(() => { chatScrollRef.current?.scrollToEnd?.({ animated: true }) }, 50)
		}
	}

	useEffect(() => {
		fetchChat()
		chatIntervalRef.current = setInterval(fetchChat, 5000)
		return () => { if (chatIntervalRef.current) clearInterval(chatIntervalRef.current) }
	}, [p2p_uuid])

	// Derived booleans
	const isOwner = useMemo(() => !!(user?.uuid && p2p?.User?.uuid && user.uuid === p2p.User.uuid), [user?.uuid, p2p?.User?.uuid])
	const isPeer = useMemo(() => !!(user?.uuid && p2p?.Peer?.uuid && user.uuid === p2p.Peer.uuid), [user?.uuid, p2p?.Peer?.uuid])
	const payerIsOwner = useMemo(() => (p2p?.type === "buy"), [p2p?.type])
	const isPayer = useMemo(() => (payerIsOwner ? isOwner : isPeer), [payerIsOwner, isOwner, isPeer])
	const isReceiver = useMemo(() => (!isPayer && (isOwner || isPeer)), [isPayer, isOwner, isPeer])

	const status = p2p?.status || "open"
	const canCancel = (isOwner || isPeer) && ["open", "escrow", "paid"].includes(status)
	const canMarkPaid = isPayer && status === "escrow"
	const canConfirmReceived = isReceiver && status === "paid"

	// Actions
	const refetchP2P = async () => {
		try {
			const response = await p2pApi.show(p2p_uuid)
			if (response.success) { setP2p(response.data?.p2p || response.data) }
		} catch (e) { /* ignore */ }
	}

	const handleCancel = async () => {
		try {
			const res = await p2pApi.cancel(p2p.uuid)
			if (res.success) {
				Toast.show({ type: "success", text1: "Oferta cancelada" })
				refetchP2P()
			} else { Toast.show({ type: "error", text1: "No se pudo cancelar", text2: String(res.error || "") }) }
		} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
	}

	const handleMarkPaid = async () => {
		try {
			const res = await p2pApi.markPaid(p2p.uuid)
			if (res.success) {
				Toast.show({ type: "success", text1: "Pago marcado como realizado" })
				refetchP2P()
			} else { Toast.show({ type: "error", text1: "No se pudo marcar pago", text2: String(res.error || "") }) }
		} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
	}

	const handleConfirmReceived = async () => {
		try {
			const res = await p2pApi.confirmReceived(p2p.uuid)
			if (res.success) {
				Toast.show({ type: "success", text1: "Pago recibido. Fondos liberados" })
				refetchP2P()
			} else { Toast.show({ type: "error", text1: "No se pudo confirmar", text2: String(res.error || "") }) }
		} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
	}

	const handleSendChat = async () => {
		const message = (chatText || "").trim()
		if (message.length === 0) return
		try {
			const res = await p2pApi.sendChat(p2p.uuid, { message })
			if (res.success) { setChatText(""); fetchChat() }
			else { Toast.show({ type: "error", text1: "No se pudo enviar", text2: String(res.error || "") }) }
		} catch (e) { Toast.show({ type: "error", text1: "Error", text2: e.message }) }
	}

	return (
		<KeyboardAvoidingView style={containerStyles.subContainer} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20} >
			<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				<View style={{ flex: 1 }}>

					<ScrollView contentContainerStyle={[containerStyles.scrollContainer, { paddingBottom: 12 }]} showsVerticalScrollIndicator={false}>

						{/* Loading / Error states */}
						{isLoading && (
							<View style={[containerStyles.card, { alignItems: "center", justifyContent: "center" }]}>
								<ActivityIndicator color={theme.colors.primary} />
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 8 }]}>Cargando oferta...</Text>
							</View>
						)}
						{!isLoading && error && (
							<View style={[containerStyles.card]}>
								<Text style={[textStyles.h5, { color: theme.colors.danger }]}>No se pudo cargar la oferta</Text>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{String(error)}</Text>
							</View>
						)}

						{!isLoading && p2p && (
							<>
								{/* Offer summary */}
								<View style={[containerStyles.card, { gap: 10 }]}>
									<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
										<View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
											<QPCoin coin={p2p?.Coin?.logo || p2p?.coin} size={28} />
											<Text style={textStyles.h4}>{p2p?.Coin?.tick || p2p?.coin}</Text>
										</View>
										<View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, backgroundColor: p2p?.type === "buy" ? theme.colors.success : theme.colors.danger }}>
											<Text style={[textStyles.h7, { color: p2p?.type === "buy" ? theme.colors.almostBlack : theme.colors.almostWhite, fontWeight: "700" }]}>{(p2p?.type || "").toUpperCase()}</Text>
										</View>
									</View>

									<View style={[containerStyles.box, { justifyContent: "space-between" }]}>
										<View>
											<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>Vender</Text>
											<Text style={[textStyles.h3]}>${p2p?.amount}</Text>
										</View>
										<View>
											<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{p2p?.type === "buy" ? "Enviar" : "Recibir"}</Text>
											<Text style={[textStyles.h3]}>{p2p?.receive} {(p2p?.Coin?.tick || p2p?.coin)}</Text>
										</View>
									</View>

									<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
										<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>Estado: <Text style={[textStyles.h6]}>{(p2p?.status || "open").toUpperCase()}</Text></Text>
										<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>Creado: {formatDateTime(p2p?.created_at)}</Text>
									</View>
									{p2p?.message && (
										<View style={[containerStyles.box, { marginTop: 6 }]}>
											<FontAwesome6 name="message" size={14} color={theme.colors.primary} iconStyle="solid" />
											<Text style={textStyles.h6}>{p2p.message}</Text>
										</View>
									)}
								</View>

								{/* Parties */}
								<View style={[containerStyles.card]}>
									<Text style={textStyles.h5}>Participantes</Text>
									<View style={{ marginTop: 10, gap: 10 }}>
										<View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
											<QPAvatar user={p2p?.User || {}} size={36} />
											<View>
												<Text style={textStyles.h6}>{p2p?.User?.name || "Usuario"} {isOwner ? "(Tú)" : ""}</Text>
												{p2p?.User?.username && <Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>@{p2p.User.username}</Text>}
											</View>
										</View>

										<View style={{ height: 1, backgroundColor: theme.colors.elevation, marginVertical: 4 }} />

										{p2p?.Peer ? (
											<View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
												<QPAvatar user={p2p?.Peer || {}} size={36} />
												<View>
													<Text style={textStyles.h6}>{p2p?.Peer?.name || "Usuario"} {isPeer ? "(Tú)" : ""}</Text>
													{p2p?.Peer?.username && <Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>@{p2p.Peer.username}</Text>}
												</View>
											</View>
										) : (
											<View style={[containerStyles.box]}>
												<FontAwesome6 name="user-clock" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
												<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Aún no hay contraparte</Text>
											</View>
										)}
									</View>

								</View>

								{/* Chat */}
								<View style={[containerStyles.card, { paddingBottom: 6 }]}>
									<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
										<Text style={textStyles.h5}>Chat</Text>
										{chatLoading && <ActivityIndicator size="small" color={theme.colors.primary} />}
									</View>
									{chatError && (
										<Text style={[textStyles.h7, { color: theme.colors.danger, marginTop: 6 }]}>{String(chatError)}</Text>
									)}
									<ScrollView ref={chatScrollRef} style={{ maxHeight: 260, marginTop: 8 }} contentContainerStyle={{ paddingBottom: 10 }}>
										{chatMessages.length === 0 && !chatLoading ? (
											<View style={{ alignItems: "center", paddingVertical: 20 }}>
												<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>No hay mensajes aún</Text>
											</View>
										) : (
											chatMessages.map((m, idx) => {
												const sender = m.user || m.User || {}
												const mine = sender?.uuid && user?.uuid && sender.uuid === user.uuid
												return (
													<View key={m.id || idx} style={{ flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", marginVertical: 6, gap: 8 }}>
														<QPAvatar user={sender} size={28} />
														<View style={{ maxWidth: "78%", backgroundColor: mine ? theme.colors.primary : theme.colors.elevation, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 }}>
															<Text style={[textStyles.h6, { color: mine ? theme.colors.almostBlack : theme.colors.primaryText }]}>{m.message || m.text || ""}</Text>
															{m.created_at && <Text style={[textStyles.h7, { color: mine ? theme.colors.almostBlack : theme.colors.secondaryText, marginTop: 4 }]}>{formatDateTime(m.created_at)}</Text>}
														</View>
													</View>
												)
											})
										)}
									</ScrollView>
									<View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
										<TextInput
											value={chatText}
											onChangeText={setChatText}
											placeholder="Escribe un mensaje..."
											placeholderTextColor={theme.colors.placeholder}
											style={[textStyles.h6, { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }]}
										/>
										<Pressable onPress={handleSendChat} disabled={(chatText || "").trim().length === 0} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: (chatText || "").trim().length === 0 ? theme.colors.elevation : theme.colors.primary }}>
											<FontAwesome6 name="paper-plane" size={16} color={(chatText || "").trim().length === 0 ? theme.colors.secondaryText : theme.colors.almostBlack} iconStyle="solid" />
										</Pressable>
									</View>
								</View>

							</>
						)}

					</ScrollView>

					<View style={[containerStyles.bottomButtonContainer, { gap: 8 }]}>
						{canCancel && (
							<QPButton
								title="Cancelar"
								onPress={handleCancel}
								style={{ backgroundColor: theme.colors.elevation }}
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
								style={{ backgroundColor: theme.colors.success }}
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
								style={{ backgroundColor: theme.colors.primary }}
								textStyle={{ color: theme.colors.almostBlack }}
								icon="money-bill-1-wave"
								iconColor={theme.colors.almostBlack}
								iconStyle="solid"
							/>
						)}
					</View>


				</View>
			</TouchableWithoutFeedback>
		</KeyboardAvoidingView>
	)
}

export default P2POffer