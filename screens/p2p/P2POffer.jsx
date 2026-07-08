import { useState, useEffect, useRef } from "react"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { View, Text, Platform, ScrollView, Keyboard, useWindowDimensions } from "react-native"

// Theme
import { useTheme } from "../../theme/ThemeContext"
import { createContainerStyles, createTextStyles } from "../../theme/themeUtils"

// UI Particles
import P2POfferItem from "../../ui/P2POfferItem"
import QPInput from "../../ui/particles/QPInput"
import QPLoader from "../../ui/particles/QPLoader"

// Lottie
import LottieView from "lottie-react-native"

// User context
import { useAuth } from "../../auth/AuthContext"

// Pull-to-refresh
import { createHiddenRefreshControl } from "../../ui/QPRefreshIndicator"

// Hooks + sections
import useP2PChat from "./useP2PChat"
import useP2PChatSSE from "./useP2PChatSSE"
import useP2POfferDetail from "./useP2POfferDetail"
import P2POfferDetailsCard from "./P2POfferDetailsCard"
import P2PChatPanel from "./P2PChatPanel"
import P2PPeerRow from "./P2PPeerRow"
import P2PEditModal from "./P2PEditModal"
import P2PApplyModal from "./P2PApplyModal"
import P2PActionBar from "./P2PActionBar"

/**
 * P2P offer detail + trade room — orchestrates the offer-detail hook, the chat hook
 * and the presentational sections (details / chat / modals / action bar).
 * Expects `route.params.p2p_uuid`; also deep-linked from qvapay.com/p2p/:p2p_uuid.
 * The offer polls `GET /p2p/{uuid}` every 5s while active (status has no SSE); chat is
 * real-time over SSE (`useP2PChatSSE`) with a polling fallback, and trade actions drive
 * `/p2p/{uuid}/apply|paid|received|cancel|rate`.
 * The share header item is configured in App.tsx — iOS 26 liquid-glass via
 * `unstable_headerRightItems`, `headerRight` fallback on Android.
 */
const P2POffer = ({ route }) => {

	const { user } = useAuth()
	const navigation = useNavigation()

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()
	const { height: windowHeight } = useWindowDimensions()

	const { p2p_uuid } = route.params

	// Chat (messages, composer, stickers, auto-scroll ref)
	const chat = useP2PChat({ p2p_uuid })

	// Shared ref breaking the hook cycle: SSE needs the offer status, the offer's 5s
	// interval needs to know whether the chat stream is live (to skip its chat fetch)
	const chatStreamLiveRef = useRef(false)

	// Offer lifecycle, derived flags and trade actions (chat fetch injected for polling/refresh)
	const offer = useP2POfferDetail({ p2p_uuid, user, navigation, fetchChat: chat.fetchChat, chatStreamLiveRef })

	// Real-time chat over SSE while the trade is active; falls back to polling if the stream drops
	useP2PChatSSE({
		p2p_uuid,
		status: offer.p2p?.status,
		appendMessage: chat.appendMessage,
		fetchChat: chat.fetchChat,
		connectedRef: chatStreamLiveRef,
	})
	const {
		p2p, isLoading, error, refreshing, rating,
		isOwner, isPayer, isReceiver, status, counterparty,
		canCancel, canMarkPaid, canConfirmReceived, canRatePeer, markedAsPaid,
		canApply, statusMessage, peerStats, peerReviewsCount, isUserOnline,
		loading, txIdInput, setTxIdInput, showApplyConfirm, setShowApplyConfirm, edit, setEdit,
		onRefresh, openPeerProfile, handleCancel, handleMarkPaid, handleConfirmReceived,
		handleApply, handleApplyConfirm, handleShareIntent, openEditModal, handleEdit, handleRate,
	} = offer

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
					{p2p && <P2POfferItem offer={p2p} show_buttons={false} show_user={false} />}

					{/* Payment details + TX id + status banner */}
					<P2POfferDetailsCard p2p={p2p} statusMessage={statusMessage} theme={theme} textStyles={textStyles} containerStyles={containerStyles} />

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
									<P2PPeerRow
										targetUser={p2p.User}
										wrapStyle={[containerStyles.card, { paddingVertical: 8, paddingHorizontal: 12 }]}
										peerStats={peerStats}
										peerReviewsCount={peerReviewsCount}
										isOnline={isUserOnline(p2p.User?.uuid)}
										onPress={openPeerProfile}
										theme={theme}
										textStyles={textStyles}
									/>
								)}
								<View style={{ flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}>
									<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: "center" }]}>¿Quieres aplicar a esta oferta?</Text>
								</View>
							</>
						)
					) : (
						<P2PChatPanel
							user={user}
							counterparty={counterparty}
							peerStats={peerStats}
							peerReviewsCount={peerReviewsCount}
							isUserOnline={isUserOnline}
							openPeerProfile={openPeerProfile}
							messages={chat.messages}
							chatLoading={chat.chatLoading}
							chatError={chat.chatError}
							chatText={chat.chatText}
							setChatText={chat.setChatText}
							selectedImage={chat.selectedImage}
							setSelectedImage={chat.setSelectedImage}
							sendingImage={chat.sendingImage}
							showStickerPanel={chat.showStickerPanel}
							setShowStickerPanel={chat.setShowStickerPanel}
							visibleTimestamps={chat.visibleTimestamps}
							chatScrollRef={chat.chatScrollRef}
							messageAnimations={chat.messageAnimations}
							handleSendChat={chat.handleSendChat}
							handlePickImage={chat.handlePickImage}
							handleSendImage={chat.handleSendImage}
							handleSendSticker={chat.handleSendSticker}
							toggleTimestamp={chat.toggleTimestamp}
							onChatScrollBeginDrag={chat.onChatScrollBeginDrag}
							onChatScroll={chat.onChatScroll}
							onChatMomentumScrollEnd={chat.onChatMomentumScrollEnd}
							onChatContentSizeChange={chat.onChatContentSizeChange}
							theme={theme}
							textStyles={textStyles}
							containerStyles={containerStyles}
						/>
					)}

				</ScrollView>

				{/* Edit Offer Modal */}
				<P2PEditModal
					visible={edit.show}
					onClose={() => setEdit("show", false)}
					edit={edit}
					setEdit={setEdit}
					p2p={p2p}
					user={user}
					onSubmit={handleEdit}
					windowHeight={windowHeight}
					theme={theme}
					textStyles={textStyles}
					containerStyles={containerStyles}
				/>

				{/* Apply Confirmation Modal */}
				<P2PApplyModal
					visible={showApplyConfirm}
					onClose={() => setShowApplyConfirm(false)}
					onConfirm={handleApplyConfirm}
					loading={loading.apply}
					theme={theme}
					textStyles={textStyles}
					containerStyles={containerStyles}
				/>

				{/* Action Buttons - Fixed at bottom */}
				<P2PActionBar
					p2p={p2p}
					isOwner={isOwner}
					isPayer={isPayer}
					isReceiver={isReceiver}
					canApply={canApply}
					canCancel={canCancel}
					canMarkPaid={canMarkPaid}
					canConfirmReceived={canConfirmReceived}
					canRatePeer={canRatePeer}
					markedAsPaid={markedAsPaid}
					loading={loading}
					txIdInput={txIdInput}
					rating={rating}
					onApply={handleApply}
					onCancel={handleCancel}
					onMarkPaid={handleMarkPaid}
					onConfirmReceived={handleConfirmReceived}
					onEdit={openEditModal}
					onShare={handleShareIntent}
					onRate={handleRate}
					keyboardVisible={keyboardVisible}
					insets={insets}
					theme={theme}
					textStyles={textStyles}
					containerStyles={containerStyles}
				/>
			</View>
		</View>
	)
}

export default P2POffer
