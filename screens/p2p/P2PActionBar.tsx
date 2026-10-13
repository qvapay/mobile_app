import { View, Text, StyleSheet } from "react-native"
import { useTranslation } from "react-i18next"
import type { EdgeInsets } from "react-native-safe-area-context"

import QPButton from "../../ui/particles/QPButton"
import QPRate from "../../ui/particles/QPRate"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"
import type { P2POffer } from "../../types/domain"
import type { TradeActionLoading } from "./useP2POfferDetail"

type P2PActionBarProps = {
	p2p: P2POffer | null
	isOwner: boolean
	isPayer: boolean
	isReceiver: boolean
	canApply: boolean
	canCancel: boolean
	canMarkPaid: boolean
	canConfirmReceived: boolean
	canRatePeer: boolean
	/** Orden por rango, quien recibe el fiat: en vez de cancelar abre disputa. */
	canDispute?: boolean
	/** Taker en una orden ya cerrada: volver a la oferta. */
	canBackToOffer?: boolean
	/** Por rango sin permiso para tomarla: aviso VIP en lugar del botón. */
	flexibleLocked?: boolean
	/** La pantalla muestra una orden de una oferta por rango (no la oferta entera). */
	isOrder?: boolean
	loading: TradeActionLoading
	txIdInput: string
	rating: number
	onApply: () => void
	onCancel: () => void
	onMarkPaid: () => void
	onConfirmReceived: () => void
	onEdit: () => void
	onShare: () => void
	onRate: (rating: number) => void
	onDispute?: () => void
	onBackToOffer?: () => void
	keyboardVisible: boolean
	insets: EdgeInsets
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// Fixed bottom action bar — surfaces only the actions valid for the viewer's role
// and the offer's current status (apply / cancel / mark-paid / confirm / edit+share / rate).
const P2PActionBar = ({
	p2p, isOwner, isPayer, isReceiver,
	canApply, canCancel, canMarkPaid, canConfirmReceived, canRatePeer,
	canDispute = false, canBackToOffer = false, flexibleLocked = false, isOrder = false,
	loading, txIdInput, rating,
	onApply, onCancel, onMarkPaid, onConfirmReceived, onEdit, onShare, onRate, onDispute, onBackToOffer,
	keyboardVisible, insets, theme, textStyles, containerStyles,
}: P2PActionBarProps) => {

	const { t } = useTranslation()

	return (
		<View style={[containerStyles.bottomButtonContainer, { flexDirection: 'row', paddingTop: 8, paddingBottom: keyboardVisible ? 4 : insets.bottom + 4, gap: 8 }]}>

			{canApply && (
				<QPButton
					title={t('p2p.actionBar.apply')}
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
					style={{ width: 56, minHeight: 56, borderRadius: 16, borderCurve: 'continuous', paddingHorizontal: 0, marginRight: 10, backgroundColor: theme.colors.danger }}
					textStyle={{ color: theme.colors.primaryText }}
					icon="xmark"
					iconColor={theme.colors.primaryText}
					iconStyle="solid"
					loading={loading.cancel}
					disabled={loading.cancel}
				/>
			)}

			{flexibleLocked && (
				<View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56 }}>
					<FontAwesome6 name="gem" size={14} color={theme.colors.gold} iconStyle="solid" />
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', flexShrink: 1 }]}>{t('p2p.flexible.vipOnlyBody')}</Text>
				</View>
			)}

			{canDispute && (
				<QPButton
					title={t('p2p.flexible.openDispute')}
					onPress={onDispute!}
					style={[{ backgroundColor: theme.colors.surface }, styles.actionButton]}
					textStyle={{ color: theme.colors.warning }}
					icon="scale-balanced"
					iconColor={theme.colors.warning}
					iconStyle="solid"
					loading={loading.cancel}
					disabled={loading.cancel}
				/>
			)}

			{canMarkPaid && isPayer && (
				<QPButton
					title={t('p2p.actionBar.markPaid')}
					onPress={onMarkPaid}
					style={[{ backgroundColor: theme.colors.successFill }, styles.actionButton]}
					textStyle={{ color: theme.colors.successFillText }}
					icon="check"
					iconColor={theme.colors.successFillText}
					iconStyle="solid"
					loading={loading.markPaid}
					disabled={loading.markPaid || !txIdInput.trim()}
				/>
			)}

			{canConfirmReceived && isReceiver && (
				<QPButton
					title={t('p2p.actionBar.paymentReceived')}
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
						style={{ width: 56, minHeight: 56, borderRadius: 16, borderCurve: 'continuous', paddingHorizontal: 0, backgroundColor: theme.colors.surface }}
						icon="pen-to-square"
						iconColor={theme.colors.primaryText}
						iconStyle="solid"
					/>
					<QPButton
						title=""
						onPress={onShare}
						style={{ width: 56, minHeight: 56, borderRadius: 16, borderCurve: 'continuous', paddingHorizontal: 0, backgroundColor: theme.colors.primary }}
						icon="share"
						iconColor={theme.colors.almostWhite}
						iconStyle="solid"
					/>
				</>
			)}

			{p2p?.status === "cancelled" && (
				<View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{isOrder ? t('p2p.flexible.orderCancelled') : t('p2p.actionBar.offerCancelled')}</Text>
				</View>
			)}

			{canBackToOffer && (
				<QPButton
					title={t('p2p.flexible.backToOffer')}
					onPress={onBackToOffer!}
					style={[{ backgroundColor: theme.colors.primary }, styles.actionButton]}
					textStyle={{ color: theme.colors.almostWhite }}
					icon="arrow-left"
					iconColor={theme.colors.almostWhite}
					iconStyle="solid"
				/>
			)}

			{canRatePeer && (
				<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
					<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{t('p2p.actionBar.rateCounterparty')}</Text>
					<QPRate value={rating} onRate={onRate} size={28} readOnly={false} />
				</View>
			)}

		</View>
	)
}

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
