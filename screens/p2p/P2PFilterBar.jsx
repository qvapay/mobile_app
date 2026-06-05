import { View, Text, Pressable, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import QPCoin from "../../ui/particles/QPCoin"
import QPSwitch from "../../ui/particles/QPSwitch"
import { SORT_OPTIONS } from "./useP2PFilters"

// Quick filters bar (type / coin / sort) + the sort menu + active filter badges.
const P2PFilterBar = ({ typeFilter, selectedCoin, sortIndex, showSortMenu, activeFilterBadges, onSetType, onOpenCoinPicker, onClearCoin, onToggleSortMenu, onSelectSort, onClearSort, onRemoveBadge, theme, textStyles }) => (
	<>
		<View style={styles.quickFiltersBar}>

			{/* Buy/Sell Switch */}
			<QPSwitch
				value={typeFilter === "sell" ? "left" : typeFilter === "buy" ? "right" : null}
				onChange={(side) => onSetType(side === "left" ? "sell" : side === "right" ? "buy" : null)}
				leftText="Comprar"
				rightText="Vender"
				leftColor={theme.colors.danger}
				rightColor={theme.colors.success}
				rightTextColor={theme.colors.almostBlack}
				style={{ width: 150, height: 32 }}
			/>

			<View style={{ flex: 1 }} />

			{/* Coin Pill */}
			<Pressable style={[styles.filterPill, { backgroundColor: selectedCoin ? theme.colors.primary : theme.colors.surface, borderColor: theme.colors.border }]} onPress={onOpenCoinPicker}>
				{selectedCoin ? (
					<View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
						<QPCoin coin={selectedCoin.logo} size={16} />
						<Text style={[textStyles.caption, { color: theme.colors.almostWhite, fontWeight: "600" }]}>{selectedCoin.tick}</Text>
						<Pressable onPress={onClearCoin} hitSlop={8}>
							<FontAwesome6 name="xmark" size={10} color={theme.colors.almostWhite} iconStyle="solid" />
						</Pressable>
					</View>
				) : (
					<View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
						<FontAwesome6 name="coins" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Moneda</Text>
					</View>
				)}
			</Pressable>

			{/* Sort Pill */}
			<Pressable style={[styles.filterPill, { backgroundColor: sortIndex > 0 || showSortMenu ? theme.colors.primary : theme.colors.surface, borderColor: theme.colors.border }]} onPress={onToggleSortMenu}>
				<FontAwesome6 name="arrow-down-short-wide" size={12} color={sortIndex > 0 || showSortMenu ? theme.colors.almostWhite : theme.colors.secondaryText} iconStyle="solid" />
			</Pressable>
		</View>

		{/* Sort Menu */}
		{showSortMenu && (
			<View style={styles.activeBadgesBar}>
				{SORT_OPTIONS.map((option, idx) => (
					<Pressable key={idx} style={[styles.activeBadge, { backgroundColor: sortIndex === idx ? theme.colors.primary : theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border }]} onPress={() => onSelectSort(idx)}>
						<Text style={[textStyles.caption, { color: sortIndex === idx ? theme.colors.almostWhite : theme.colors.primaryText, fontSize: theme.typography.fontSize.xs }]}>{option.label}</Text>
					</Pressable>
				))}
			</View>
		)}

		{/* Active Filter & Sort Badges */}
		{(activeFilterBadges.length > 0 || sortIndex > 0) && (
			<View style={styles.activeBadgesBar}>
				{sortIndex > 0 && (
					<Pressable style={[styles.activeBadge, { backgroundColor: theme.colors.primary }]} onPress={onClearSort}>
						<Text style={[textStyles.caption, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.xs }]}>{SORT_OPTIONS[sortIndex].label}</Text>
						<FontAwesome6 name="xmark" size={10} color={theme.colors.almostWhite} iconStyle="solid" />
					</Pressable>
				)}
				{activeFilterBadges.map((badge) => (
					<Pressable key={badge.key} style={[styles.activeBadge, { backgroundColor: theme.colors.primary }]} onPress={() => onRemoveBadge(badge)}>
						<Text style={[textStyles.caption, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.xs }]}>{badge.label}</Text>
						<FontAwesome6 name="xmark" size={10} color={theme.colors.almostWhite} iconStyle="solid" />
					</Pressable>
				))}
			</View>
		)}
	</>
)

const styles = StyleSheet.create({
	quickFiltersBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 6,
		paddingHorizontal: 2,
	},
	filterPill: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 10,
		height: 32,
		borderRadius: 16,
		borderWidth: 0.5,
	},
	activeBadgesBar: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 6,
		paddingHorizontal: 2,
		marginBottom: 4,
	},
	activeBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
	},
})

export default P2PFilterBar
