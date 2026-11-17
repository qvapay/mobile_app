import { View, Text, Pressable, Modal } from "react-native"
import QPModalCard from "../../ui/QPModalCard"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPButton from "../../ui/particles/QPButton"
import P2PFlexibleTakeForm from "./P2PFlexibleTakeForm"
import { checkTakeAmount, takeBounds, formatCents } from "./p2pFlexible"

import type { Theme } from "../../theme/ThemeContext"
import { scaleType } from "../../theme/themeUtils"
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

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={() => !loading && onClose()}>
				<QPModalCard>

					<FontAwesome6 name="handshake" size={40} color={theme.colors.primary} iconStyle="solid" style={{ alignSelf: 'center', marginBottom: 16 }} />

					<Text style={[textStyles.h3, { color: theme.colors.primaryText, textAlign: 'center', marginBottom: 8 }]}>
						{flexible ? t('p2p.flexible.apply.title') : t('p2p.applyModal.title')}
					</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', lineHeight: scaleType(theme, 22), marginBottom: flexible ? 12 : 20 }]}>
						{flexible && bounds
							? t('p2p.flexible.apply.body', { min: formatCents(bounds.minCents), max: formatCents(bounds.maxCents) })
							: t('p2p.applyModal.body')}
					</Text>

					{flexible && offer && (
						<View style={{ marginBottom: 16 }}>
							<P2PFlexibleTakeForm
								offer={offer}
								amount={flexible.amount}
								setAmount={flexible.setAmount}
								balance={flexible.balance}
								theme={theme}
								textStyles={textStyles}
							/>
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

				</QPModalCard>
			</Pressable>
		</Modal>
	)
}

export default P2PApplyModal
