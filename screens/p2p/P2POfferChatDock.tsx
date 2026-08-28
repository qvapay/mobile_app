import { useState, useEffect, useRef } from "react"
import { View, Text } from "react-native"
import Animated, { ZoomIn } from "react-native-reanimated"

import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import QPPressable from "../../ui/particles/QPPressable"
import P2PChatSheet from "./P2PChatSheet"

import type { ComponentProps } from "react"
import type { EdgeInsets } from "react-native-safe-area-context"
import type useP2PChat from "./useP2PChat"
import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"

/** Props de la hoja que la burbuja abre, menos las que arma este componente. */
type ChatSheetProps = ComponentProps<typeof P2PChatSheet>

type P2POfferChatDockProps = {
	/** Trade en curso: sin oferta o con la oferta abierta no hay chat que abrir. */
	enabled: boolean
	/** Todo el estado del chat lo sigue poseyendo la PANTALLA (SSE/polling siguen vivos). */
	chat: ReturnType<typeof useP2PChat>
	chatPanelProps: ChatSheetProps['chatPanelProps']
	keyboardHeight: number
	insets: EdgeInsets
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

/**
 * Burbuja flotante del chat + la hoja que abre (patrón Binance/OKX). El
 * baseline de "visto" se fija con el histórico inicial — la carga no cuenta
 * como no leído — y abrir la hoja marca todo como visto.
 *
 * Vive fuera de `P2POffer` porque el contador de no leídos es estado
 * puramente presentacional: la pantalla no lo lee para nada más.
 */
const P2POfferChatDock = ({ enabled, chat, chatPanelProps, keyboardHeight, insets, theme, textStyles, containerStyles }: P2POfferChatDockProps) => {

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

	return (
		<>
			{/* Burbuja flotante del chat — entra al arrancar el trade, badge de no leídos */}
			{enabled && (
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
				chatPanelProps={chatPanelProps}
			/>
		</>
	)
}

export default P2POfferChatDock
