import { View, Text, ScrollView, Pressable, Modal, Switch, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import QPCoin from "../../ui/particles/QPCoin"
import QPInput from "../../ui/particles/QPInput"
import QPSwitch from "../../ui/particles/QPSwitch"

// Full filters modal (Contacts-style card): my offers, type, coin, min/max, ratio, VIP.
const P2PFiltersModal = ({ visible, onClose, filters, setFilter, onOpenCoinPicker, onClear, onApply, windowHeight, theme, textStyles }) => {
	
	const { typeFilter, selectedCoin, showMine, minAmount, maxAmount, ratioMin, ratioMax, onlyVip } = filters

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={styles.overlay} onPress={onClose}>
				<Pressable style={[styles.filterCard, { backgroundColor: theme.colors.surface, maxHeight: windowHeight * 0.75 }]} onPress={() => { }}>

					{/* Header */}
					<View style={styles.filterCardHeader}>
						<FontAwesome6 name="sliders" size={20} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.h3, { flex: 1, marginLeft: 12 }]}>Filtros</Text>
						<Pressable onPress={onClose} hitSlop={12}>
							<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					</View>

					<ScrollView showsVerticalScrollIndicator={false} bounces={false}>
						{/* Show My Offers */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Mis ofertas</Text>
							<Switch
								value={showMine}
								onValueChange={(v) => setFilter("showMine", v)}
								trackColor={{ true: theme.colors.primary }}
								style={{ transform: [{ scale: 0.85 }] }}
							/>
						</View>

						{/* Type */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Tipo</Text>
							<QPSwitch
								value={typeFilter === "sell" ? "left" : typeFilter === "buy" ? "right" : null}
								onChange={(side) => setFilter("typeFilter", side === "left" ? "sell" : side === "right" ? "buy" : null)}
								leftText="Comprar"
								rightText="Vender"
								leftColor={theme.colors.danger}
								rightColor={theme.colors.success}
								rightTextColor={theme.colors.almostBlack}
								style={{ width: 160, height: 30 }}
							/>
						</View>

						{/* Coin */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Moneda</Text>
							<Pressable style={[styles.coinSelector, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border, width: 160 }]} onPress={onOpenCoinPicker}>
								{selectedCoin ? (
									<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
										<QPCoin coin={selectedCoin.logo} size={20} />
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: "600" }]}>{selectedCoin.tick}</Text>
										<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
									</View>
								) : (
									<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
										<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>Seleccionar</Text>
										<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
									</View>
								)}
							</Pressable>
						</View>

						{/* Min / Max */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Mínimo</Text>
							<View style={{ width: 160 }}>
								<QPInput value={minAmount} onChangeText={(v) => setFilter("minAmount", v)} placeholder="0" keyboardType="numeric" />
							</View>
						</View>
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Máximo</Text>
							<View style={{ width: 160 }}>
								<QPInput value={maxAmount} onChangeText={(v) => setFilter("maxAmount", v)} placeholder="0" keyboardType="numeric" />
							</View>
						</View>

						{/* Ratio Min / Max */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Ratio mín</Text>
							<View style={{ width: 160 }}>
								<QPInput value={ratioMin} onChangeText={(v) => setFilter("ratioMin", v)} placeholder="0" keyboardType="numeric" />
							</View>
						</View>
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Ratio máx</Text>
							<View style={{ width: 160 }}>
								<QPInput value={ratioMax} onChangeText={(v) => setFilter("ratioMax", v)} placeholder="0" keyboardType="numeric" />
							</View>
						</View>

						{/* Only VIP */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>Solo VIP</Text>
							<Switch
								value={onlyVip}
								onValueChange={(v) => setFilter("onlyVip", v)}
								trackColor={{ true: theme.colors.primary }}
								style={{ transform: [{ scale: 0.85 }] }}
							/>
						</View>
					</ScrollView>

					{/* Action buttons */}
					<View style={styles.filterCardActions}>
						<Pressable onPress={onClear} style={[styles.filterCardActionButton, { backgroundColor: theme.colors.elevation }]}>
							<Text style={[styles.filterCardActionText, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>Limpiar</Text>
						</Pressable>
						<Pressable onPress={onApply} style={[styles.filterCardActionButton, { backgroundColor: theme.colors.primary, flex: 1 }]}>
							<Text style={[styles.filterCardActionText, { color: "#FFFFFF", fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>Aplicar</Text>
						</Pressable>
					</View>

				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.6)",
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	filterCard: {
		width: "100%",
		borderRadius: 16,
		padding: 24,
	},
	filterCardHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 8,
	},
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	coinSelector: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 0.5,
		minWidth: 140,
		alignItems: "center",
		justifyContent: "center",
	},
	filterCardActions: {
		flexDirection: "row",
		gap: 12,
		marginTop: 16,
	},
	filterCardActionButton: {
		paddingVertical: 14,
		paddingHorizontal: 24,
		borderRadius: 25,
		alignItems: "center",
		justifyContent: "center",
	},
	filterCardActionText: {},
})

export default P2PFiltersModal
