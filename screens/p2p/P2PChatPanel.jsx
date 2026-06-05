import { View, Text, StyleSheet, ScrollView, TouchableWithoutFeedback, TouchableOpacity, Keyboard, TextInput, Pressable, Animated, Modal, Linking } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import FastImage from "@d11/react-native-fast-image"

import QPAvatar from "../../ui/particles/QPAvatar"
import P2PPeerRow from "./P2PPeerRow"
import ChatMessageText from "./ChatMessageText"
import { isSticker, getStickerName } from "./useP2PChat"
import { getShortDateTime, copyTextToClipboard } from "../../helpers"
import ReactNativeHapticFeedback from "react-native-haptic-feedback"

// Stickers list (GOLD exclusive)
const P2P_STICKERS = [
	"angry", "bro", "clown", "cry", "cuba", "facepalm", "finger", "guest", "hum", "joy",
	"like", "loading", "lol", "money", "ok", "search", "upset", "who", "yeah"
]
const STICKER_BASE_URL = "https://media.qvapay.com/qvi/"
const CHAT_MEDIA_BASE_URL = "https://media.qvapay.com/"

// Active-offer chat: counterparty header, message thread, composer (image + sticker)
// and the GOLD-gated sticker panel. All state/handlers come from useP2PChat.
const P2PChatPanel = ({
	user, counterparty, peerStats, peerReviewsCount, isUserOnline, openPeerProfile,
	messages, chatLoading, chatError, chatText, setChatText,
	selectedImage, setSelectedImage, sendingImage, showStickerPanel, setShowStickerPanel,
	visibleTimestamps, chatScrollRef, messageAnimations,
	handleSendChat, handlePickImage, handleSendImage, handleSendSticker, toggleTimestamp,
	onChatScrollBeginDrag, onChatScroll, onChatMomentumScrollEnd, onChatContentSizeChange,
	theme, textStyles, containerStyles,
}) => (
	<View style={[containerStyles.card, { flex: 1, padding: 0, marginVertical: 4 }]}>

		{counterparty && (
			<P2PPeerRow
				targetUser={counterparty}
				wrapStyle={{ paddingVertical: 8, paddingHorizontal: 12 }}
				peerStats={peerStats}
				peerReviewsCount={peerReviewsCount}
				isOnline={isUserOnline(counterparty?.uuid)}
				onPress={openPeerProfile}
				theme={theme}
				textStyles={textStyles}
			/>
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
			onScrollBeginDrag={onChatScrollBeginDrag}
			onScroll={onChatScroll}
			onMomentumScrollEnd={onChatMomentumScrollEnd}
			onContentSizeChange={onChatContentSizeChange}
		>
			{messages.length === 0 && !chatLoading ? (
				<View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>No hay mensajes aún</Text>
				</View>
			) : (

				// Use peer_id to determine if message is from current user
				messages.map((m, idx) => {

					const mine = m.peer_id && user?.uuid && m.peer_id === user.uuid
					const prevMessage = idx > 0 ? messages[idx - 1] : null
					const nextMessage = idx < messages.length - 1 ? messages[idx + 1] : null
					const prevMine = prevMessage?.peer_id && user?.uuid && prevMessage.peer_id === user.uuid
					const nextMine = nextMessage?.peer_id && user?.uuid && nextMessage.peer_id === user.uuid
					const isConsecutive = prevMine === mine
					const isLastInGroup = nextMine !== mine || idx === messages.length - 1
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
									<View style={{ width: 96, height: 96, backgroundColor: theme.colors.background }}>
										<View style={{ width: 96, height: 96, mixBlendMode: 'screen' }}>
											<FastImage
												source={{ uri: `${STICKER_BASE_URL}${stickerName}.gif` }}
												style={{ width: 96, height: 96 }}
												resizeMode={FastImage.resizeMode.contain}
											/>
										</View>
									</View>
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
						<ScrollView contentContainerStyle={{ paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
							<View style={styles.stickerGrid}>
								{P2P_STICKERS.map((item) => (
									<TouchableOpacity key={item} onPress={() => handleSendSticker(item)} style={[styles.stickerItem, { backgroundColor: theme.colors.background }]}>
										<View style={{ width: 64, height: 64, mixBlendMode: 'screen' }}>
											<FastImage
												source={{ uri: `${STICKER_BASE_URL}${item}.gif` }}
												style={{ width: 64, height: 64 }}
												resizeMode={FastImage.resizeMode.contain}
											/>
										</View>
									</TouchableOpacity>
								))}
							</View>
						</ScrollView>
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
)

const styles = StyleSheet.create({
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
	stickerGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
	},
	stickerItem: {
		width: '25%',
		alignItems: 'center',
		paddingVertical: 8,
	},
	stickerLockedContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 40,
	},
})

export default P2PChatPanel
