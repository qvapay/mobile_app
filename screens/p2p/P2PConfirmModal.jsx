import { View, Text, Pressable, Modal, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import QPButton from "../../ui/particles/QPButton"

/**
 * Themed confirmation for trade actions (cancel / mark-paid / release funds).
 * Replaces the native Alert so the money-critical step shows an explicit
 * summary (amount + counterparty) and an optional safety warning, matching the
 * app's centered-card modal pattern.
 */
const P2PConfirmModal = ({
	visible, onClose, onConfirm, loading,
	icon, iconColor, title, body, warning,
	confirmLabel, confirmBg, confirmTextColor,
	theme, textStyles, containerStyles,
}) => (
	<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !loading && onClose()}>
		<Pressable style={containerStyles.modalOverlay} onPress={() => !loading && onClose()}>
			<Pressable onPress={() => { }} style={containerStyles.modalCard}>

				<FontAwesome6 name={icon} size={40} color={iconColor} iconStyle="solid" style={styles.icon} />

				<Text style={[textStyles.h3, { color: theme.colors.primaryText, textAlign: "center", marginBottom: 8 }]}>{title}</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: "center", lineHeight: 22, marginBottom: warning ? 12 : 20 }]}>{body}</Text>

				{warning ? (
					<View style={[styles.warningBox, { backgroundColor: theme.colors.warning + "1A" }]}>
						<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.warning} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.warning, flex: 1 }]}>{warning}</Text>
					</View>
				) : null}

				<View style={styles.buttonsRow}>
					<QPButton
						title="Volver"
						onPress={onClose}
						style={[styles.backButton, { borderColor: theme.colors.border }]}
						textStyle={{ color: theme.colors.primaryText }}
						disabled={loading}
					/>
					<QPButton
						title={confirmLabel}
						onPress={onConfirm}
						style={[styles.confirmButton, { backgroundColor: confirmBg }]}
						textStyle={{ color: confirmTextColor }}
						loading={loading}
						disabled={loading}
					/>
				</View>

			</Pressable>
		</Pressable>
	</Modal>
)

const styles = StyleSheet.create({
	icon: {
		alignSelf: "center",
		marginBottom: 16,
	},
	warningBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderRadius: 10,
		borderCurve: "continuous",
		padding: 10,
		marginBottom: 20,
	},
	buttonsRow: {
		flexDirection: "row",
		gap: 10,
	},
	backButton: {
		flex: 1,
		backgroundColor: "transparent",
		borderWidth: 1.5,
	},
	confirmButton: {
		flex: 1,
	},
})

export default P2PConfirmModal
