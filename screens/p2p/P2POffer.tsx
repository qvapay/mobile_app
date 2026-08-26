import { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { View, Text, ScrollView, useWindowDimensions } from "react-native"

// Theme
import { useTheme } from "../../theme/ThemeContext"
import { createContainerStyles, createTextStyles } from "../../theme/themeUtils"

// UI Particles
import P2POfferItem from "../../ui/P2POfferItem"
import QPLoader from "../../ui/particles/QPLoader"
import QPPressable from "../../ui/particles/QPPressable"

// Icons
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

// Lottie
import LottieView from "lottie-react-native"

// Reanimated — anima el swap card informativa ↔ card de trade y la burbuja del chat
import Animated, { FadeIn, FadeInDown, FadeOutUp, ZoomIn } from "react-native-reanimated"

// User context
import { useAuth } from "../../auth/AuthContext"

// Pull-to-refresh
import { createHiddenRefreshControl } from "../../ui/QPRefreshIndicator"

// Hooks + sections
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight"
import useP2PChat from "./useP2PChat"
import useP2PChatSSE from "./useP2PChatSSE"
import useP2POfferDetail from "./useP2POfferDetail"
import P2POfferDetailsCard from "./P2POfferDetailsCard"
import P2PChatSheet from "./P2PChatSheet"
import P2PHeaderTimer from "./P2PHeaderTimer"
import P2PPeerRow from "./P2PPeerRow"
import P2PEditModal from "./P2PEditModal"
import P2PApplyModal from "./P2PApplyModal"
import P2PConfirmModal from "./P2PConfirmModal"
import P2PTradeProgress from "./P2PTradeProgress"
import P2PActionBar from "./P2PActionBar"

import type { ReactElement } from "react"
import type { RefreshControlProps } from "react-native"
import type { NavigationProp } from "@react-navigation/native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../../types/navigation"
import type { P2PConfirmConfig } from "./P2PConfirmModal"

/**
 * P2P offer detail + trade room — orchestrates the offer-detail hook, the chat hook
 * and the presentational sections (progress / details / modals / action bar). The
 * chat lives in its own sheet (P2PChatSheet) behind a floating bubble with an
 * unread badge — the screen owns the chat state so messages keep flowing and the
 * badge stays accurate while the sheet is closed.
 * Expects `route.params.p2p_uuid`; also deep-linked from qvapay.com/p2p/:p2p_uuid.
 * The offer polls `GET /p2p/{uuid}` every 5s while active (status has no SSE); chat is
 * real-time over SSE (`useP2PChatSSE`) with a polling fallback, and trade actions drive
 * `/p2p/{uuid}/apply|paid|received|cancel|rate`.
 * The share header item is configured in App.tsx — iOS 26 liquid-glass via
 * `unstable_headerRightItems`, `headerRight` fallback on Android.
 */
const P2POffer = ({ route }: NativeStackScreenProps<RootStackParamList, 'P2POffer'>) => {

	const { t } = useTranslation()
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
	// `useNavigation()` devuelve el prop tipado por la declaración global, cuyo
	// getState() se estrecha distinto al NavigationProp<RootStackParamList> puro
	const offer = useP2POfferDetail({ p2p_uuid, user, navigation: navigation as unknown as NavigationProp<RootStackParamList>, fetchChat: chat.fetchChat, chatStreamLiveRef })

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
		canCancel, canMarkPaid, canConfirmReceived, canRatePeer,
		canApply, statusMessage, peerStats, peerReviewsCount, isUserOnline,
		loading, txIdInput, setTxIdInput, showApplyConfirm, setShowApplyConfirm, edit, setEdit,
		confirmModal, closeConfirmModal, confirmModalAction,
		onRefresh, openPeerProfile, handleCancel, handleMarkPaid, handleConfirmReceived,
		handleApply, handleApplyConfirm, handleShareIntent, openEditModal, handleEdit, handleRate,
	} = offer

	// Keyboard height tracking
	const { keyboardHeight, keyboardVisible } = useKeyboardHeight()

	// Chat como hoja aparte (patrón Binance/OKX): burbuja flotante + badge de no
	// leídos. El baseline de "visto" se fija con el histórico inicial (la carga
	// no cuenta como no leído); abrir la hoja marca todo como visto.
	const [chatOpen, setChatOpen] = useState(false)
	const [chatSeenCount, setChatSeenCount] = useState<number | null>(null)
	const wasChatLoadingRef = useRef(false)
	useEffect(() => {
		if (chatSeenCount === null) {
			if (wasChatLoadingRef.current && !chat.chatLoading) setChatSeenCount(chat.messages.length)
			else if (chat.messages.length > 0) setChatSeenCount(chat.messages.length)
		}
		wasChatLoadingRef.current = chat.chatLoading
	}, [chat.chatLoading, chat.messages.length, chatSeenCount])
	useEffect(() => {
		if (chatOpen) setChatSeenCount(chat.messages.length)
	}, [chatOpen, chat.messages.length])
	const chatUnread = chatSeenCount == null ? 0 : Math.max(0, chat.messages.length - chatSeenCount)

	// Timer de la ventana de pago en el CENTRO del header (el título de la ruta
	// va vacío): se setea UNA vez por ventana — P2PHeaderTimer se auto-tickea,
	// así que no hay setOptions por segundo
	const windowExpiresAt = status === "processing" ? p2p?.payment_window_expires_at || null : null
	useEffect(() => {
		navigation.setOptions({
			headerTitleAlign: "center",
			headerTitle: windowExpiresAt ? () => <P2PHeaderTimer expiresAt={windowExpiresAt} /> : undefined,
		})
	}, [navigation, windowExpiresAt])

	// Loading state check - only show loader if no cached data
	if (isLoading && !p2p) { return (<QPLoader />) }
	if (error) {
		return (
			<View style={containerStyles.subContainer}>
				<View style={[containerStyles.card, { alignItems: "center", justifyContent: "center" }]}>
					<Text style={[textStyles.h5, { color: theme.colors.danger }]}>{t('p2p.offer.loadFailed')}</Text>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{/* OJO: el hook solo guarda strings en `error` — los accesos .error/.message
						    son restos defensivos que nunca disparan; el cast preserva el runtime */}
						{String((error as { error?: string, message?: string }).error || (error as { error?: string, message?: string }).message || error)}</Text>
				</View>
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<View style={[{ flex: 1 }, keyboardVisible && { paddingBottom: keyboardHeight }]}>
				<ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>} >

					{/* Una sola card arriba: la informativa (open/cancelled/revision) se
					    TRANSFORMA en la card de trade al aplicar — el swap anima la salida
					    de una y la entrada de la otra (también al revertir a open) */}
					{(isPayer || isReceiver) && ["processing", "paid", "completed"].includes(status) ? (
						<Animated.View key="trade-progress" entering={FadeInDown.duration(300)} exiting={FadeOutUp.duration(180)}>
							<P2PTradeProgress
								p2p={p2p}
								status={status}
								isPayer={isPayer}
								isReceiver={isReceiver}
								canMarkPaid={canMarkPaid}
								txIdInput={txIdInput}
								setTxIdInput={setTxIdInput}
								theme={theme}
								textStyles={textStyles}
								containerStyles={containerStyles}
							/>
						</Animated.View>
					) : (
						p2p && (
							<Animated.View key="offer-header" entering={FadeIn.duration(200)} exiting={FadeOutUp.duration(180)}>
								<P2POfferItem offer={p2p} show_buttons={false} show_user={false} show_date expand_message style={{ marginVertical: 4, marginBottom: 4 }} />
							</Animated.View>
						)
					)}

					{/* Payment details + registered TX id (+ banner only for revision — the stepper covers the rest) */}
					<P2POfferDetailsCard p2p={p2p} statusMessage={status === "revision" ? statusMessage : null} theme={theme} textStyles={textStyles} containerStyles={containerStyles} />

					{status === "open" ? (
						isOwner ? (
							<View style={{ flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: "center" }]}>{t('p2p.offer.searchingPeer')}</Text>
								<LottieView source={require("../../assets/lotties/searching.json")} autoPlay loop style={{ width: 250, height: 250 }} />
							</View>
						) : (
							<>
								{p2p?.User && (
									<P2PPeerRow
										targetUser={p2p.User}
										wrapStyle={[containerStyles.card, { marginVertical: 4, paddingVertical: 8, paddingHorizontal: 12 }]}
										peerStats={peerStats}
										peerReviewsCount={peerReviewsCount}
										isOnline={isUserOnline(p2p.User?.uuid)}
										onPress={openPeerProfile}
										theme={theme}
										textStyles={textStyles}
									/>
								)}

								{/* Advertiser terms (from their P2P settings) — read before applying */}
								{p2p?.User?.p2p_message ? (
									<View style={[containerStyles.card, { marginVertical: 4, paddingVertical: 10, paddingHorizontal: 12 }]}>
										<View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
											<FontAwesome6 name="file-lines" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
											<Text style={[textStyles.h7, { color: theme.colors.secondaryText, textTransform: "uppercase", letterSpacing: 0.5 }]}>{t('p2p.offer.advertiserTerms')}</Text>
										</View>
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, lineHeight: 20 }]}>{p2p.User.p2p_message}</Text>
									</View>
								) : null}

								<View style={{ flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}>
									<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: "center" }]}>{t('p2p.offer.applyQuestion')}</Text>
								</View>
							</>
						)
					) : (
						/* Trade activo: la contraparte inline; el chat vive en su propia
						   hoja (burbuja flotante abajo) para no estrangular la pantalla */
						counterparty && (
							<P2PPeerRow
								targetUser={counterparty}
								wrapStyle={[containerStyles.card, { marginVertical: 4, paddingVertical: 8, paddingHorizontal: 12 }]}
								peerStats={peerStats}
								peerReviewsCount={peerReviewsCount}
								isOnline={isUserOnline(counterparty?.uuid)}
								onPress={openPeerProfile}
								theme={theme}
								textStyles={textStyles}
							/>
						)
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

				{/* Trade-action confirmation (cancel / mark-paid / release) with explicit summary + warning */}
				{confirmModal && (() => {
					const counterpartyName = counterparty?.username ? `@${counterparty.username}` : t('p2p.offer.counterpartyFallback')
					const railAmount = `${p2p?.receive} ${p2p?.Coin?.name || ""}`.trim()
					const configs: Record<'cancel' | 'markPaid' | 'received', P2PConfirmConfig> = {
						cancel: {
							icon: "ban", iconColor: theme.colors.danger,
							title: t('p2p.offer.confirm.cancel.title'),
							body: t('p2p.offer.confirm.cancel.body'),
							confirmLabel: t('p2p.offer.confirm.cancel.confirmLabel'), confirmBg: theme.colors.danger, confirmTextColor: theme.colors.almostWhite,
							loading: loading.cancel,
						},
						markPaid: {
							icon: "money-bill-wave", iconColor: theme.colors.primary,
							title: t('p2p.offer.confirm.markPaid.title'),
							body: t('p2p.offer.confirm.markPaid.body', { amount: railAmount, counterparty: counterpartyName }),
							warning: t('p2p.offer.confirm.markPaid.warning'),
							confirmLabel: t('p2p.offer.confirm.markPaid.confirmLabel'), confirmBg: theme.colors.successFill, confirmTextColor: theme.colors.successFillText,
							loading: loading.markPaid,
						},
						received: {
							icon: "lock-open", iconColor: theme.colors.warning,
							title: t('p2p.offer.confirm.release.title'),
							body: t('p2p.offer.confirm.release.body', { amount: p2p?.amount, counterparty: counterpartyName }),
							warning: t('p2p.offer.confirm.release.warning', { amount: railAmount }),
							confirmLabel: t('p2p.offer.confirm.release.confirmLabel'), confirmBg: theme.colors.primary, confirmTextColor: theme.colors.almostWhite,
							loading: loading.received,
						},
					}
					return (
						<P2PConfirmModal
							visible
							onClose={closeConfirmModal}
							onConfirm={confirmModalAction}
							{...configs[confirmModal]}
							theme={theme}
							textStyles={textStyles}
							containerStyles={containerStyles}
						/>
					)
				})()}

				{/* Burbuja flotante del chat — entra al arrancar el trade, badge de no leídos */}
				{p2p && status !== "open" && (
					<Animated.View entering={ZoomIn.delay(150).duration(220)} style={{ position: "absolute", right: 0, bottom: insets.bottom + 88 }}>
						<QPPressable
							onPress={() => setChatOpen(true)}
							style={{
								width: 56, height: 56, borderRadius: 16, borderCurve: "continuous",
								backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center",
								shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
							}}
						>
							<FontAwesome6 name="comment-dots" size={22} color={theme.colors.almostWhite} iconStyle="solid" />
							{chatUnread > 0 && (
								<View style={{
									position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10,
									paddingHorizontal: 5, backgroundColor: theme.colors.danger, alignItems: "center", justifyContent: "center",
								}}>
									<Text style={[textStyles.h7, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.xs }]}>
										{chatUnread > 9 ? "9+" : chatUnread}
									</Text>
								</View>
							)}
						</QPPressable>
					</Animated.View>
				)}

				{/* Chat en hoja propia (pageSheet iOS / modal Android) */}
				<P2PChatSheet
					visible={chatOpen}
					onClose={() => setChatOpen(false)}
					keyboardHeight={keyboardHeight}
					insets={insets}
					theme={theme}
					textStyles={textStyles}
					containerStyles={containerStyles}
					chatPanelProps={{
						user,
						counterparty,
						peerStats,
						peerReviewsCount,
						isUserOnline,
						openPeerProfile,
						messages: chat.messages,
						chatLoading: chat.chatLoading,
						chatError: chat.chatError,
						chatText: chat.chatText,
						setChatText: chat.setChatText,
						selectedImage: chat.selectedImage,
						setSelectedImage: chat.setSelectedImage,
						sendingImage: chat.sendingImage,
						showStickerPanel: chat.showStickerPanel,
						setShowStickerPanel: chat.setShowStickerPanel,
						visibleTimestamps: chat.visibleTimestamps,
						chatScrollRef: chat.chatScrollRef,
						messageAnimations: chat.messageAnimations,
						handleSendChat: chat.handleSendChat,
						handlePickImage: chat.handlePickImage,
						handleSendImage: chat.handleSendImage,
						handleSendSticker: chat.handleSendSticker,
						toggleTimestamp: chat.toggleTimestamp,
						onChatScrollBeginDrag: chat.onChatScrollBeginDrag,
						onChatScroll: chat.onChatScroll,
						onChatMomentumScrollEnd: chat.onChatMomentumScrollEnd,
						onChatContentSizeChange: chat.onChatContentSizeChange,
					}}
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
