import { View, Text, ScrollView, Pressable, Modal, Switch, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPCoin from "../../ui/particles/QPCoin"
import QPInput from "../../ui/particles/QPInput"
import QPSplitButton from "../../ui/particles/QPSplitButton"

import { createContainerStyles } from "../../theme/themeUtils"
import { sanitizeAmountInput } from "../../helpers/amountInput"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles } from "../../theme/themeUtils"
import type { P2PFiltersState } from "./useP2PFilters"

type P2PFiltersModalProps = {
	visible: boolean
	onClose: () => void
	filters: P2PFiltersState
	setFilter: <K extends keyof P2PFiltersState>(field: K, value: P2PFiltersState[K]) => void
	onOpenCoinPicker: () => void
	onClear: () => void
	onApply: () => void
	windowHeight: number
	theme: Theme
	textStyles: TextStyles
}

// Modal de filtros: mis ofertas, moneda, "quiero operar $X", rango de tasa y VIP.
// El lado del mercado (Comprar/Vender) NO está aquí: vive en el switch del TopBar.
const P2PFiltersModal = ({ visible, onClose, filters, setFilter, onOpenCoinPicker, onClear, onApply, windowHeight, theme, textStyles }: P2PFiltersModalProps) => {

	const { t } = useTranslation()
	const { selectedCoin, showMine, opAmount, ratioMin, ratioMax, onlyVip } = filters
	const containerStyles = createContainerStyles(theme)

	// "Limpiar" solo existe cuando hay algo que limpiar — el slot se abre y
	// cierra animado (mismo split-button del onboarding/registro)
	const hasActiveFilters = !!(selectedCoin || showMine || opAmount || ratioMin || ratioMax || onlyVip)

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
				<Pressable style={[containerStyles.modalCard, { maxHeight: windowHeight * 0.75 }]} onPress={() => { }}>

					{/* Header */}
					<View style={styles.filterCardHeader}>
						<FontAwesome6 name="sliders" size={20} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.h3, { flex: 1, marginLeft: 12 }]}>{t('p2p.filters.title')}</Text>
						<Pressable onPress={onClose} hitSlop={12}>
							<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					</View>

					<ScrollView showsVerticalScrollIndicator={false} bounces={false}>
						{/* Show My Offers */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>{t('p2p.filters.myOffers')}</Text>
							<Switch
								value={showMine}
								onValueChange={(v) => setFilter("showMine", v)}
								trackColor={{ true: theme.colors.primary }}
								style={{ transform: [{ scale: 0.85 }] }}
							/>
						</View>

						{/* Coin */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>{t('p2p.common.coin')}</Text>
							<Pressable style={[styles.coinSelector, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border, width: 160 }]} onPress={onOpenCoinPicker}>
								{selectedCoin ? (
									<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
										<QPCoin coin={selectedCoin.logo} size={20} />
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: "600" }]}>{selectedCoin.tick}</Text>
										<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
									</View>
								) : (
									<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
										<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>{t('p2p.filters.select')}</Text>
										<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
									</View>
								)}
							</Pressable>
						</View>

						{/* Min / Max */}
						{/* Un solo campo, como en los P2P de la industria: dices cuánto
						    quieres operar y se muestran las ofertas que lo permiten */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>{t('p2p.filters.operateAmount')}</Text>
							<View style={{ width: 160 }}>
								<QPInput value={opAmount} onChangeText={(v) => setFilter("opAmount", sanitizeAmountInput(v))} placeholder={t('p2p.filters.amountPlaceholder')} keyboardType="numeric" />
							</View>
						</View>

						{/* Tasa mín / máx */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>{t('p2p.filters.rateMin')}</Text>
							<View style={{ width: 160 }}>
								<QPInput value={ratioMin} onChangeText={(v) => setFilter("ratioMin", sanitizeAmountInput(v, 4))} placeholder="0" keyboardType="numeric" />
							</View>
						</View>
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>{t('p2p.filters.rateMax')}</Text>
							<View style={{ width: 160 }}>
								<QPInput value={ratioMax} onChangeText={(v) => setFilter("ratioMax", sanitizeAmountInput(v, 4))} placeholder="0" keyboardType="numeric" />
							</View>
						</View>

						{/* Only VIP */}
						<View style={styles.rowBetween}>
							<Text style={textStyles.h6}>{t('p2p.filters.onlyVip')}</Text>
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
							title={t('p2p.filters.apply')}
							onPress={onApply}
							showBack={hasActiveFilters}
							onBack={onClear}
							backLabel={t('p2p.filters.clear')}
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
