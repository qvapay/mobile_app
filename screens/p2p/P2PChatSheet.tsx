import { View, Pressable, Modal, StyleSheet } from "react-native"
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
	keyboardHeight: number
	insets: EdgeInsets
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
	/** Todo el estado del chat lo sigue poseyendo la PANTALLA (badge de no leídos). */
	chatPanelProps: Omit<P2PChatPanelProps, 'theme' | 'textStyles' | 'containerStyles' | 'show_header' | 'wrapStyle'>
}

/**
 * Chat as a bottom sheet in the app's canonical sheet language (QPCoinPicker):
 * dark overlay + sheet anchored at the bottom with grabber and continuous top
 * radius. The sheet itself is the chat card elevated — surface background, so
 * the counterparty bubbles (background-colored) keep their contrast — with the
 * peer row + close as its header and the panel rendered flat inside.
 * The SCREEN keeps owning the useP2PChat state: messages keep flowing
 * (SSE/poll) while the sheet is closed and the unread badge stays accurate.
 */
const P2PChatSheet = ({ visible, onClose, keyboardHeight, insets, theme, textStyles, containerStyles, chatPanelProps }: P2PChatSheetProps) => (
	<Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
		<Pressable style={styles.sheetOverlay} onPress={onClose}>
			{/* El onPress vacío absorbe los toques: sin él, tocar la hoja cerraría el chat */}
			<Pressable
				onPress={() => { }}
				style={[styles.sheet, {
					backgroundColor: theme.colors.surface,
					paddingBottom: keyboardHeight > 0 ? keyboardHeight : insets.bottom || 12,
				}]}
			>

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
					<Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
						<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
					</Pressable>
				</View>

				<P2PChatPanel
					{...chatPanelProps}
					show_header={false}
					wrapStyle={styles.flatPanel}
					theme={theme}
					textStyles={textStyles}
					containerStyles={containerStyles}
				/>

			</Pressable>
		</Pressable>
	</Modal>
)

const styles = StyleSheet.create({
	sheetOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'flex-end',
	},
	sheet: {
		height: '90%',
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderCurve: 'continuous',
		overflow: 'hidden',
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
