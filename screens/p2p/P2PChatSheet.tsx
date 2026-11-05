import { useEffect, useEffectEvent, useLayoutEffect } from "react"
import { View, Pressable, BackHandler, StyleSheet, useWindowDimensions } from "react-native"

import Animated, { FadeIn, FadeOut, SlideOutDown, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withSpring, withTiming, KeyboardState } from "react-native-reanimated"
import { GestureDetector, usePanGesture } from "react-native-gesture-handler"
import { scheduleOnRN } from "react-native-worklets"
import { SHEET_ENTERING, SHEET_MAX_RATIO } from '../../ui/sheetConfig'
import { shouldDismissSheet } from '../../ui/sheetDrag'
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import type { EdgeInsets } from "react-native-safe-area-context"

import P2PChatPanel from "./P2PChatPanel"
import type { P2PChatPanelProps } from "./P2PChatPanel"
import P2PPeerRow from "./P2PPeerRow"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"

type P2PChatSheetProps = {
	visible: boolean
	onClose: () => void
	insets: EdgeInsets
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
	/** Todo el estado del chat lo sigue poseyendo la PANTALLA (badge de no leídos). */
	chatPanelProps: Omit<P2PChatPanelProps, 'theme' | 'textStyles' | 'containerStyles' | 'show_header' | 'wrapStyle'>
	/** Menú ⋯ de la contraparte (reportar · bloquear), como el menú del chat de la web. */
	onMoreCounterparty?: () => void
}

/** El arrastre arranca tras bajar estos puntos: por debajo sigue siendo un toque en la cabecera. */
const DRAG_ACTIVE_OFFSET = 10
/** Un gesto de lado no es arrastrar la hoja. */
const DRAG_FAIL_OFFSET_X = 20
const DRAG_SPRING = { damping: 24, stiffness: 260, mass: 0.7 }
const DRAG_CLOSE_TIMING = { duration: 180 }

/**
 * Chat as a bottom sheet in the app's canonical sheet language (QPCoinPicker):
 * dark overlay + sheet anchored at the bottom with grabber and continuous top
 * radius. The sheet itself is the chat card elevated — surface background, so
 * the counterparty bubbles (background-colored) keep their contrast — with the
 * peer row + close as its header and the panel rendered flat inside.
 * The SCREEN keeps owning the useP2PChat state: messages keep flowing
 * (SSE/poll) while the sheet is closed and the unread badge stays accurate.
 *
 * Se cierra arrastrando hacia abajo el agarrador o la cabecera. Solo ellos: en la
 * lista de mensajes ese gesto es hacer scroll.
 *
 * Se renderiza como overlay INLINE de la pantalla y no como `Modal`. El
 * padding del teclado se mide con `useAnimatedKeyboard` de Reanimated, que en
 * Android escucha los IME insets del WINDOW (`ViewCompat.setOnApplyWindowInsetsListener`
 * sobre el decorView) — no depende de los eventos `keyboardDidShow` del módulo
 * Keyboard de RN, que solo emite el ReactRootView del host y en un `Modal`
 * (window Dialog + edge-to-edge) nunca llegan. Inline + insets del window es lo
 * que hace funcionar la caja de escritura en ambas plataformas.
 */
const P2PChatSheet = ({ visible, onClose, insets, theme, textStyles, containerStyles, chatPanelProps, onMoreCounterparty }: P2PChatSheetProps) => {

	// Altura del teclado movida a la UI thread: sin re-renders y con seguimiento
	// del frame a frame (OPENING/CLOSING incluidos). Las dos opciones van a true
	// porque la app es edge-to-edge: sin ellas, Reanimated restauraría
	// `decorFitsSystemWindows(true)` al parar la observación y metería insets
	// dobles en las pantallas siguientes (Android <15).
	const keyboard = useAnimatedKeyboard({
		isStatusBarTranslucentAndroid: true,
		isNavigationBarTranslucentAndroid: true,
	})
	const keyboardPaddingStyle = useAnimatedStyle(() => ({
		paddingBottom: keyboard.state.value !== KeyboardState.CLOSED && keyboard.height.value > 0
			? keyboard.height.value
			: insets.bottom || 12,
	}))

	// El Modal interceptaba el back de Android de serie; inline lo replicamos:
	// con la hoja abierta, el back la cierra en vez de sacar del trade.
	// useEffectEvent: el listener lee siempre el `onClose` vigente sin re-suscribirse cada
	// vez que el padre lo recrea (antes se daba de baja y de alta en cada render del dock)
	const onHardwareBack = useEffectEvent(() => {
		onClose()
		return true
	})
	useEffect(() => {
		if (!visible) return
		const sub = BackHandler.addEventListener("hardwareBackPress", () => onHardwareBack())
		return () => sub.remove()
	}, [visible])

	// Arrastre de la hoja por su cabecera, en la UI thread. Sale de pantalla ANTES de
	// avisar: el padre desmonta en ese momento y la salida ya no vería el desplazamiento
	const { height: windowHeight } = useWindowDimensions()
	const dragY = useSharedValue(0)
	const dragPan = usePanGesture({
		activeOffsetY: DRAG_ACTIVE_OFFSET,
		failOffsetX: [-DRAG_FAIL_OFFSET_X, DRAG_FAIL_OFFSET_X],
		onUpdate: event => {
			'worklet'
			dragY.value = Math.max(event.translationY, 0)
		},
		onDeactivate: event => {
			'worklet'
			if (event.canceled || !shouldDismissSheet(event.translationY, event.velocityY)) {
				dragY.value = withSpring(0, DRAG_SPRING)
				return
			}
			dragY.value = withTiming(windowHeight, DRAG_CLOSE_TIMING, finished => {
				'worklet'
				if (finished) scheduleOnRN(onClose)
			})
		},
	})
	const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }))

	// La hoja que se fue arrastrando deja puesto su desplazamiento: la siguiente arranca de cero
	useLayoutEffect(() => {
		if (visible) dragY.value = 0
	}, [visible, dragY])

	if (!visible) return null

	return (
		<Animated.View style={styles.sheetOverlay} entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)}>
			{/* El onPress del fondo cierra la hoja */}
			<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

			{/* frame animado con el tope de altura de `QPSheet`: sin él, el alto % no tiene padre definido */}
			<Animated.View style={styles.sheetFrame} entering={SHEET_ENTERING} exiting={SlideOutDown.duration(220)}>
				{/* El responder absorbe los toques: sin él, tocar la hoja caía al overlay y la cerraba.
				    Animated.View y no Pressable: animar un Pressable revienta en Fabric */}
				<Animated.View
					onStartShouldSetResponder={() => true}
					style={[styles.sheet, { backgroundColor: theme.colors.surface }, dragStyle]}
				>
					{/* Contenido sobre el que cae el padding del teclado (animated style en la UI thread) */}
					<Animated.View style={[styles.sheetContent, keyboardPaddingStyle]}>

						<GestureDetector gesture={dragPan}>
							<View>
								{/* Grabber */}
								<View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />

								{/* Header: contraparte + cerrar. Separación por AIRE, no por línea —
								    la hairline solo existe en light (regla de la casa: nada de bordes
								    sutiles sobre surface en dark) */}
								<View style={[styles.header, !theme.isDark && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}>
									<P2PPeerRow
										targetUser={chatPanelProps.counterparty}
										wrapStyle={styles.headerPeer}
										peerStats={chatPanelProps.peerStats}
										peerReviewsCount={chatPanelProps.peerReviewsCount}
										isOnline={chatPanelProps.isUserOnline?.(chatPanelProps.counterparty?.uuid)}
										onPress={chatPanelProps.openPeerProfile}
										theme={theme}
										textStyles={textStyles}
									/>
									{onMoreCounterparty ? (
										<Pressable onPress={onMoreCounterparty} hitSlop={8} style={styles.closeButton} accessibilityRole="button" testID="chat-more">
											<FontAwesome6 name="ellipsis" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
										</Pressable>
									) : null}
									<Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
										<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
									</Pressable>
								</View>
							</View>
						</GestureDetector>

						<P2PChatPanel
							{...chatPanelProps}
							show_header={false}
							wrapStyle={styles.flatPanel}
							theme={theme}
							textStyles={textStyles}
							containerStyles={containerStyles}
						/>
					</Animated.View>
				</Animated.View>
			</Animated.View>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	sheetOverlay: {
		...StyleSheet.absoluteFill,
		// Inline, la hoja compite con los hermanos según el orden de render
		// (el ActionBar va DESPUÉS del dock): zIndex alto para quedar por encima.
		zIndex: 100,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'flex-end',
	},
	sheetFrame: {
		// Un chat LLENA la hoja, no se encoge a su contenido. La proporción sale de
		// `QPSheet` para que no haya dos números de hoja en la app.
		height: `${SHEET_MAX_RATIO * 100}%`,
	},
	sheet: {
		flex: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderCurve: 'continuous',
		overflow: 'hidden',
	},
	// Contenido sobre el que cae el padding del teclado (animated style)
	sheetContent: {
		flex: 1,
	},
	grabber: {
		width: 40,
		height: 4,
		borderRadius: 2,
		alignSelf: 'center',
		marginTop: 8,
		marginBottom: 6,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	headerPeer: {
		flex: 1,
	},
	closeButton: {
		padding: 5,
		marginLeft: 6,
	},
	// El sheet ya pone el chrome (fondo surface, radios): el panel va plano
	flatPanel: {
		marginVertical: 0,
		borderRadius: 0,
		borderWidth: 0,
		backgroundColor: 'transparent',
		shadowOpacity: 0,
		elevation: 0,
	},
})

export default P2PChatSheet
