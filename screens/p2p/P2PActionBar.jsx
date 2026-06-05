import { View, Text, StyleSheet } from "react-native"

import QPButton from "../../ui/particles/QPButton"
import QPRate from "../../ui/particles/QPRate"

// Fixed bottom action bar — surfaces only the actions valid for the viewer's role
// and the offer's current status (apply / cancel / mark-paid / confirm / edit+share / rate).
const P2PActionBar = ({
	p2p, isOwner, isPayer, isReceiver,
	canApply, canCancel, canMarkPaid, canConfirmReceived, canRatePeer, markedAsPaid,
	loading, txIdInput, rating,
	onApply, onCancel, onMarkPaid, onConfirmReceived, onEdit, onShare, onRate,
	keyboardVisible, insets, theme, textStyles, containerStyles,
}) => (
	<View style={[containerStyles.bottomButtonContainer, { flexDirection: 'row', paddingTop: 8, paddingBottom: keyboardVisible ? 4 : insets.bottom + 4, gap: 8 }]}>

		{canApply && (
			<QPButton
				title="Aplicar"
				onPress={onApply}
				style={[{ backgroundColor: theme.colors.primary }, styles.actionButton]}
				textStyle={{ color: theme.colors.buttonText }}
				icon="check"
				iconColor={theme.colors.buttonText}
				iconStyle="solid"
				loading={loading.apply}
				disabled={loading.apply}
			/>
		)}

		{canCancel && (
			<QPButton
				title=""
				onPress={onCancel}
				style={{ width: 56, minHeight: 56, borderRadius: 28, paddingHorizontal: 0, marginRight: 10, backgroundColor: theme.colors.danger }}
				textStyle={{ color: theme.colors.primaryText }}
				icon="xmark"
				iconColor={theme.colors.primaryText}
				iconStyle="solid"
				loading={loading.cancel}
				disabled={loading.cancel}
			/>
		)}

		{canMarkPaid && isPayer && (
			<QPButton
				title="He pagado"
				onPress={onMarkPaid}
				style={[{ backgroundColor: theme.colors.success }, styles.actionButton]}
				textStyle={{ color: theme.colors.almostBlack }}
				icon="check"
				iconColor={theme.colors.almostBlack}
				iconStyle="solid"
				loading={loading.markPaid}
				disabled={loading.markPaid || !txIdInput.trim()}
			/>
		)}

		{markedAsPaid && isPayer && (
			<QPButton
				title="Pagado"
				onPress={onMarkPaid}
				style={[{ backgroundColor: theme.colors.success }, styles.actionButton]}
				textStyle={{ color: theme.colors.almostBlack }}
				icon="check-double"
				iconColor={theme.colors.almostBlack}
				iconStyle="solid"
				disabled={true}
			/>
		)}

		{canConfirmReceived && isReceiver && (
			<QPButton
				title="Pago recibido"
				onPress={onConfirmReceived}
				style={[{ backgroundColor: theme.colors.primary }, styles.actionButton]}
				textStyle={{ color: theme.colors.almostWhite }}
				icon="money-bill-1-wave"
				iconColor={theme.colors.almostWhite}
				iconStyle="solid"
				loading={loading.received}
			/>
		)}

		{/* Edit + Share - Owner of open offer */}
		{p2p?.status === "open" && isOwner && (
			<>
				<View style={{ flex: 1 }} />
				<QPButton
					title=""
					onPress={onEdit}
					style={{ width: 56, minHeight: 56, borderRadius: 28, paddingHorizontal: 0, backgroundColor: theme.colors.surface }}
					icon="pen-to-square"
					iconColor={theme.colors.primaryText}
					iconStyle="solid"
				/>
				<QPButton
					title=""
					onPress={onShare}
					style={{ width: 56, minHeight: 56, borderRadius: 28, paddingHorizontal: 0, backgroundColor: theme.colors.primary }}
					icon="share"
					iconColor={theme.colors.almostWhite}
					iconStyle="solid"
				/>
			</>
		)}

		{p2p?.status === "cancelled" && (
			<View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Oferta cancelada</Text>
			</View>
		)}

		{canRatePeer && (
			<View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
				<QPRate value={rating} onRate={onRate} size={28} readOnly={false} />
			</View>
		)}

	</View>
)

const styles = StyleSheet.create({
	actionButton: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: 56,
	},
})

export default P2PActionBar
