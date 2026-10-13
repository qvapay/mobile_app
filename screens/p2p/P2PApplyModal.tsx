import { View, Text, Pressable, Modal } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPButton from "../../ui/particles/QPButton"
import QPInput from "../../ui/particles/QPInput"
import { sanitizeAmountInput } from "../../helpers/amountInput"
import { checkTakeAmount, takeBounds, formatCents, quoteReceive } from "./p2pFlexible"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"
import type { P2POffer } from "../../types/domain"

type P2PApplyModalProps = {
	visible: boolean
	onClose: () => void
	onConfirm: () => void
	loading?: boolean
	/**
	 * Oferta por rango: el modal pide la parte a tomar (entre `order_min` y
	 * min(`order_max`, disponible)) y enseña la contrapartida a la tasa de la oferta.
	 */
	flexible?: {
		offer: P2POffer
		amount: string
		setAmount: (value: string) => void
		balance: number
	} | null
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// Confirmation modal before applying to an offer (prevents accidental taps).
const P2PApplyModal = ({ visible, onClose, onConfirm, loading, flexible = null, theme, textStyles, containerStyles }: P2PApplyModalProps) => {

	const { t } = useTranslation()

	const offer = flexible?.offer
	const check = flexible && offer ? checkTakeAmount(flexible.amount, offer, flexible.balance) : null
	const bounds = offer ? takeBounds(offer) : null
	// El motivo solo se enseña con algo tecleado (vacío = aún no ha empezado)
	const reason = check && !check.ok && check.reason !== 'empty' ? check.reason : null
	const quote = check?.ok && offer ? quoteReceive(check.amount, offer) : null
	const coinName = offer?.Coin?.name || offer?.coin || ''

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={() => !loading && onClose()}>
				<Pressable onPress={() => { }} style={containerStyles.modalCard}>

					<FontAwesome6 name="handshake" size={40} color={theme.colors.primary} iconStyle="solid" style={{ alignSelf: 'center', marginBottom: 16 }} />

					<Text style={[textStyles.h3, { color: theme.colors.primaryText, textAlign: 'center', marginBottom: 8 }]}>
						{flexible ? t('p2p.flexible.apply.title') : t('p2p.applyModal.title')}
					</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', lineHeight: 22, marginBottom: flexible ? 12 : 20 }]}>
						{flexible && bounds
							? t('p2p.flexible.apply.body', { min: formatCents(bounds.minCents), max: formatCents(bounds.maxCents) })
							: t('p2p.applyModal.body')}
					</Text>

					{flexible && offer && bounds && (
						<View style={{ marginBottom: 16 }}>
							<QPInput
								value={flexible.amount}
								onChangeText={(v) => flexible.setAmount(sanitizeAmountInput(v))}
								placeholder={formatCents(bounds.minCents)}
								keyboardType="decimal-pad"
								prelabel={t('p2p.flexible.apply.amountLabel')}
							/>
							{reason ? (
								<Text style={[textStyles.h7, { color: theme.colors.danger, marginTop: 4 }]}>
									{t(`p2p.flexible.errors.${reason}`, { min: formatCents(bounds.minCents), max: formatCents(bounds.maxCents) })}
								</Text>
							) : quote != null ? (
								<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 4 }]}>
									{offer.type === 'sell'
										? t('p2p.flexible.apply.youSend', { amount: Number(quote.toFixed(8)), coin: coinName })
										: t('p2p.flexible.apply.youReceive', { amount: Number(quote.toFixed(8)), coin: coinName })}
								</Text>
							) : null}
							{/* Vender QUSD en una oferta de compra: la parte sale del saldo como garantía */}
							{offer.type === 'buy' && (
								<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginTop: 6 }]}>
									{t('p2p.flexible.apply.escrowNote', { balance: flexible.balance.toFixed(2) })}
								</Text>
							)}
						</View>
					)}

					<View style={{ flexDirection: 'row', gap: 10 }}>
						<QPButton
							title={t('common.actions.cancel')}
							onPress={onClose}
							style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.border }}
							textStyle={{ color: theme.colors.primaryText }}
							disabled={loading}
						/>
						<QPButton
							title={flexible ? t('p2p.flexible.apply.confirm') : t('p2p.actionBar.apply')}
							onPress={onConfirm}
							style={{ flex: 1, backgroundColor: theme.colors.primary }}
							textStyle={{ color: theme.colors.buttonText }}
							icon="check"
							iconColor={theme.colors.buttonText}
							iconStyle="solid"
							loading={loading}
							disabled={loading || (!!check && !check.ok)}
						/>
					</View>

				</Pressable>
			</Pressable>
		</Modal>
	)
}

export default P2PApplyModal
