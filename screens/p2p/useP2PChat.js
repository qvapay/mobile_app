import { Animated } from "react-native"
import { launchImageLibrary } from "react-native-image-picker"
import { useReducer, useEffect, useRef, useCallback } from "react"

import { p2pApi } from "../../api/p2pApi"
import { toast } from "sonner-native"

const MAX_IMAGE_SIZE_MB = 10

// Sort chat messages oldest → newest (created_at, falling back to numeric id)
const sortMessagesAscending = (messagesArray) => {
	if (!Array.isArray(messagesArray)) return []
	return [...messagesArray].sort((a, b) => {
		const aTime = a.created_at ? new Date(a.created_at).getTime() : (parseInt(a.id, 10) || 0)
		const bTime = b.created_at ? new Date(b.created_at).getTime() : (parseInt(b.id, 10) || 0)
		return aTime - bTime
	})
}

// Sticker message helpers
export const isSticker = (message) => typeof message === "string" && message.startsWith(":sticker:")
export const getStickerName = (message) => message.replace(":sticker:", "").replace(/\.(webm|gif)$/, "")

const initialChat = {
	messages: [],
	loading: false,
	error: null,
	text: "",
	selectedImage: null,
	sendingImage: false,
	showStickerPanel: false,
	visibleTimestamps: new Set(),
}

function chatReducer(state, action) {
	switch (action.type) {
		case "set":
			return { ...state, [action.field]: action.value }
		case "toggleTimestamp": {
			const next = new Set(state.visibleTimestamps)
			if (next.has(action.id)) next.delete(action.id)
			else next.add(action.id)
			return { ...state, visibleTimestamps: next }
		}
		default:
			return state
	}
}

// Owns the P2P trade chat: messages, composer text, image attachment, sticker panel
// and per-message timestamp toggles. `autoScroll` is a ref (never rendered) so scroll
// bookkeeping doesn't re-render the whole thread on every drag.
export default function useP2PChat({ p2p_uuid }) {

	const [chat, dispatch] = useReducer(chatReducer, initialChat)
	const set = useCallback((field, value) => dispatch({ type: "set", field, value }), [])

	const chatScrollRef = useRef(null)
	const messageAnimations = useRef({})
	const autoScrollRef = useRef(true)

	// Fetch chat
	const fetchChat = useCallback(async () => {
		try {
			set("loading", true)
			set("error", null)
			const response = await p2pApi.getChat(p2p_uuid)
			if (response.success) {
				const raw = response.data?.chat || response.data
				set("messages", sortMessagesAscending(raw))
			}
		} catch (err) {
			set("error", err.message)
			toast.error("Error", { description: err.message })
		} finally { set("loading", false) }
	}, [p2p_uuid, set])

	// Load chat on mount
	useEffect(() => {
		fetchChat()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Auto-scroll to bottom when messages change (only if the user is parked at the bottom)
	useEffect(() => {
		if (!autoScrollRef.current) return
		const t = setTimeout(() => { chatScrollRef.current?.scrollToEnd({ animated: true }) }, 50)
		return () => clearTimeout(t)
	}, [chat.messages?.length])

	// Send text chat
	const handleSendChat = async () => {
		const message = (chat.text || "").trim()
		if (message.length === 0) return
		try {
			const res = await p2pApi.sendChat(p2p_uuid, { message })
			if (res.success) {
				set("text", "")
				await fetchChat()
				chatScrollRef.current?.scrollToEnd({ animated: true })
			}
			else { toast.error("No se pudo enviar", { description: String(res.error || "") }) }
		} catch (e) { toast.error("Error", { description: e.message }) }
	}

	// Open image picker
	const handlePickImage = useCallback(() => {
		launchImageLibrary({
			mediaType: "photo",
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
			const validTypes = ["image/jpeg", "image/png", "image/gif", "image/jpg"]
			if (asset.type && !validTypes.includes(asset.type.toLowerCase())) {
				toast.error("Formato no soportado", { description: "Solo JPG, PNG y GIF" })
				return
			}
			set("selectedImage", asset)
		})
	}, [set])

	// Send image message
	const handleSendImage = async () => {
		if (!chat.selectedImage) return
		try {
			set("sendingImage", true)
			const res = await p2pApi.sendChat(p2p_uuid, {
				message: chat.text.trim() || undefined,
				image: {
					uri: chat.selectedImage.uri,
					type: chat.selectedImage.type || "image/jpeg",
					fileName: chat.selectedImage.fileName || "photo.jpg",
				},
			})
			if (res.success) {
				set("selectedImage", null)
				set("text", "")
				await fetchChat()
				chatScrollRef.current?.scrollToEnd({ animated: true })
			} else {
				toast.error("No se pudo enviar", { description: String(res.error || "") })
			}
		} catch (e) {
			toast.error("Error", { description: e.message })
		} finally {
			set("sendingImage", false)
		}
	}

	// Send sticker message
	const handleSendSticker = async (stickerName) => {
		set("showStickerPanel", false)
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

	// Toggle a message's timestamp with a fade/slide animation
	const toggleTimestamp = (messageId) => {
		if (!messageAnimations.current[messageId]) { messageAnimations.current[messageId] = new Animated.Value(0) }
		const isCurrentlyVisible = chat.visibleTimestamps.has(messageId)
		Animated.timing(messageAnimations.current[messageId], {
			toValue: isCurrentlyVisible ? 0 : 1,
			duration: isCurrentlyVisible ? 200 : 300,
			useNativeDriver: true,
		}).start()
		dispatch({ type: "toggleTimestamp", id: messageId })
	}

	// Scroll bookkeeping — pause auto-scroll while the user reads back, resume near bottom
	const onChatScrollBeginDrag = () => { autoScrollRef.current = false }
	const checkNearBottom = (e) => {
		const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent
		const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y)
		if (distanceFromBottom < 50) { autoScrollRef.current = true }
	}
	const onChatContentSizeChange = () => {
		if (autoScrollRef.current) { setTimeout(() => { chatScrollRef.current?.scrollToEnd({ animated: true }) }, 100) }
	}

	return {
		// state
		messages: chat.messages,
		chatLoading: chat.loading,
		chatError: chat.error,
		chatText: chat.text,
		selectedImage: chat.selectedImage,
		sendingImage: chat.sendingImage,
		showStickerPanel: chat.showStickerPanel,
		visibleTimestamps: chat.visibleTimestamps,
		// setters used by the composer / panel
		setChatText: (v) => set("text", v),
		setSelectedImage: (v) => set("selectedImage", v),
		setShowStickerPanel: (v) => set("showStickerPanel", v),
		// refs
		chatScrollRef,
		messageAnimations,
		// actions
		fetchChat,
		handleSendChat,
		handlePickImage,
		handleSendImage,
		handleSendSticker,
		toggleTimestamp,
		// scroll handlers
		onChatScrollBeginDrag,
		onChatScroll: checkNearBottom,
		onChatMomentumScrollEnd: checkNearBottom,
		onChatContentSizeChange,
	}
}
