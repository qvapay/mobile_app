import { useState, useEffect, useMemo, useRef } from "react"
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, TextInput, ActivityIndicator, Pressable } from "react-native"

// Theme
import { useTheme } from "../../theme/ThemeContext"
import { createContainerStyles, createTextStyles } from "../../theme/themeUtils"

// UI Particles
import QPButton from "../../ui/particles/QPButton"
import QPCoin from "../../ui/particles/QPCoin"
import QPAvatar from "../../ui/particles/QPAvatar"
import QPLoader from "../../ui/particles/QPLoader"

// Icons
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

// User context
import { useAuth } from "../../auth/AuthContext"

// API
import { p2pApi } from "../../api/p2pApi"

// Toast
import Toast from "react-native-toast-message"

// Helpers
import { formatDateTime, getTypeText } from "../../helpers"

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

	// Loading state check
	if (isLoading) { return (<QPLoader />) }
	if (error) {
		return (
			<View style={[containerStyles.card, { alignItems: "center", justifyContent: "center" }]}>
				<Text style={[textStyles.h5, { color: theme.colors.danger }]}>No se pudo cargar la oferta</Text>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{String(error)}</Text>
			</View>
		)
	}

	return (
		<KeyboardAvoidingView style={containerStyles.subContainer} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20} >
			<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				<View style={{ flex: 1 }}>

					<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

						{p2p && (
							<>
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
								</View>

								{/* Chat */}
								<View style={[containerStyles.card, { flex: 1 }]}>

									<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
										{chatLoading && <ActivityIndicator size="small" color={theme.colors.primary} />}
									</View>

									{chatError && (<Text style={[textStyles.h7, { color: theme.colors.danger, marginTop: 6 }]}>{String(chatError)}</Text>)}

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
								style={{ backgroundColor: theme.colors.danger }}
								textStyle={{ color: theme.colors.almostWhite }}
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
		marginTop: 8,
		paddingTop: 8,
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
	}
})

export default P2POffer