import { View, Text, ScrollView, Pressable, Modal, Switch, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import QPCoin from "../../ui/particles/QPCoin"
import QPInput from "../../ui/particles/QPInput"
import QPSwitch from "../../ui/particles/QPSwitch"
import QPSplitButton from "../../ui/particles/QPSplitButton"

import { createContainerStyles } from "../../theme/themeUtils"

// Full filters modal (Contacts-style card): my offers, type, coin, min/max, ratio, VIP.
const P2PFiltersModal = ({ visible, onClose, filters, setFilter, onOpenCoinPicker, onClear, onApply, windowHeight, theme, textStyles }) => {

	const { typeFilter, selectedCoin, showMine, minAmount, maxAmount, ratioMin, ratioMax, onlyVip } = filters
	const containerStyles = createContainerStyles(theme)

	// "Limpiar" solo existe cuando hay algo que limpiar — el slot se abre y
	// cierra animado (mismo split-button del onboarding/registro)
	const hasActiveFilters = !!(typeFilter || selectedCoin || showMine || minAmount || maxAmount || ratioMin || ratioMax || onlyVip)

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
				<Pressable style={[containerStyles.modalCard, { maxHeight: windowHeight * 0.75 }]} onPress={() => { }}>

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
								rightColor={theme.colors.successFill}
								rightTextColor={theme.colors.successFillText}
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

					{/* Action buttons — "Limpiar" aparece animado con el primer filtro */}
					<View style={styles.filterCardActions}>
						<QPSplitButton
							title="Aplicar"
							onPress={onApply}
							showBack={hasActiveFilters}
							onBack={onClear}
							backLabel="Limpiar"
							backRatio={0.5}
							backColor={theme.colors.elevation}
							backTextColor={theme.colors.primaryText}
						/>
					</View>

				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
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
		marginTop: 16,
	},
})

export default P2PFiltersModal
