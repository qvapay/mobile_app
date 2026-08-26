import { View, Text, Pressable, Modal } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPButton from "../../ui/particles/QPButton"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"

type P2PApplyModalProps = {
	visible: boolean
	onClose: () => void
	onConfirm: () => void
	loading?: boolean
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// Confirmation modal before applying to an offer (prevents accidental taps).
const P2PApplyModal = ({ visible, onClose, onConfirm, loading, theme, textStyles, containerStyles }: P2PApplyModalProps) => {

	const { t } = useTranslation()

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={() => !loading && onClose()}>
				<Pressable onPress={() => { }} style={containerStyles.modalCard}>

					<FontAwesome6 name="handshake" size={40} color={theme.colors.primary} iconStyle="solid" style={{ alignSelf: 'center', marginBottom: 16 }} />

					<Text style={[textStyles.h3, { color: theme.colors.primaryText, textAlign: 'center', marginBottom: 8 }]}>
						{t('p2p.applyModal.title')}
					</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', lineHeight: 22, marginBottom: 20 }]}>
						{t('p2p.applyModal.body')}
					</Text>

					<View style={{ flexDirection: 'row', gap: 10 }}>
						<QPButton
							title={t('common.actions.cancel')}
							onPress={onClose}
							style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.border }}
							textStyle={{ color: theme.colors.primaryText }}
							disabled={loading}
						/>
						<QPButton
							title={t('p2p.actionBar.apply')}
							onPress={onConfirm}
							style={{ flex: 1, backgroundColor: theme.colors.primary }}
							textStyle={{ color: theme.colors.buttonText }}
							icon="check"
							iconColor={theme.colors.buttonText}
							iconStyle="solid"
							loading={loading}
							disabled={loading}
						/>
					</View>

				</Pressable>
			</Pressable>
		</Modal>
	)
}

export default P2PApplyModal
