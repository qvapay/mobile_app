import { View, Text, Pressable, Modal } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import QPButton from "../../ui/particles/QPButton"

// Confirmation modal before applying to an offer (prevents accidental taps).
const P2PApplyModal = ({ visible, onClose, onConfirm, loading, theme, textStyles, containerStyles }) => (
	<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
		<Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }} onPress={() => !loading && onClose()}>
			<Pressable onPress={() => { }} style={[containerStyles.card, { width: '100%', borderRadius: 16, padding: 24 }]}>

				<FontAwesome6 name="handshake" size={40} color={theme.colors.primary} iconStyle="solid" style={{ alignSelf: 'center', marginBottom: 16 }} />

				<Text style={[textStyles.h3, { color: theme.colors.primaryText, textAlign: 'center', marginBottom: 8 }]}>
					Aplicar a la oferta
				</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', lineHeight: 22, marginBottom: 20 }]}>
					¿Estás seguro de que quieres aplicar a esta oferta?
				</Text>

				<View style={{ flexDirection: 'row', gap: 10 }}>
					<QPButton
						title="Cancelar"
						onPress={onClose}
						style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.border }}
						textStyle={{ color: theme.colors.primaryText }}
						disabled={loading}
					/>
					<QPButton
						title="Aplicar"
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

export default P2PApplyModal
