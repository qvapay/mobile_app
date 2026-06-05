import { View, Text, ScrollView, Pressable, Modal, Switch } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import QPButton from "../../ui/particles/QPButton"
import QPInput from "../../ui/particles/QPInput"

// Edit-offer modal for the owner of an open offer (amount / receive / message / VIP).
const P2PEditModal = ({ visible, onClose, edit, setEdit, p2p, user, onSubmit, windowHeight, theme, textStyles, containerStyles }) => (
	<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
		<Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }} onPress={onClose}>
			<Pressable onPress={() => { }} style={[containerStyles.card, { width: '100%', maxHeight: windowHeight * 0.75, borderRadius: 16, padding: 20 }]}>
				<ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

					{/* Header */}
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Editar Oferta</Text>
						<Pressable onPress={onClose} hitSlop={8}>
							<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
						</Pressable>
					</View>

					{/* Amount */}
					<QPInput
						value={edit.amount}
						onChangeText={(v) => setEdit("amount", v)}
						placeholder="0.00"
						keyboardType="decimal-pad"
						prelabel="Monto (QUSD)"
					/>

					{/* Receive */}
					<QPInput
						value={edit.receive}
						onChangeText={(v) => setEdit("receive", v)}
						placeholder="0.00"
						keyboardType="decimal-pad"
						prelabel="A recibir"
					/>

					{/* Balance warning for SELL offers */}
					{p2p?.type === "sell" && parseFloat(edit.amount || 0) > parseFloat(p2p?.amount || 0) && (parseFloat(edit.amount || 0) - parseFloat(p2p?.amount || 0)) > parseFloat(user?.balance || 0) && (
						<Text style={[textStyles.h7, { color: theme.colors.danger, marginTop: 4 }]}>
							Balance insuficiente para aumentar el monto
						</Text>
					)}

					{/* Message */}
					<QPInput
						value={edit.message}
						onChangeText={(text) => setEdit("message", text.slice(0, 79))}
						placeholder="Mensaje opcional"
						prelabel="Mensaje"
						multiline
					/>
					<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, textAlign: 'right', marginTop: 2 }]}>
						{edit.message.length}/79
					</Text>

					{/* Only VIP toggle */}
					<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginTop: 4 }}>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>Solo usuarios VIP</Text>
						<Switch value={edit.onlyVip} onValueChange={(v) => setEdit("onlyVip", v)} trackColor={{ true: theme.colors.primary }} />
					</View>

					{/* Submit */}
					<QPButton
						title="Guardar"
						onPress={onSubmit}
						style={{ backgroundColor: theme.colors.primary, marginTop: 12 }}
						textStyle={{ color: theme.colors.buttonText }}
						icon="check"
						iconColor={theme.colors.buttonText}
						iconStyle="solid"
						loading={edit.loading}
						disabled={edit.loading}
					/>

				</ScrollView>
			</Pressable>
		</Pressable>
	</Modal>
)

export default P2PEditModal
