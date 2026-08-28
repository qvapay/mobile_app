import { View, Text, Pressable, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPCoin from "../../ui/particles/QPCoin"
import { SORT_OPTIONS } from "./useP2PFilters"
import type { FilterCoin, P2PFilterBadge } from "./useP2PFilters"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles } from "../../theme/themeUtils"

type P2PFilterBarProps = {
	selectedCoin: FilterCoin | null
	sortIndex: number
	showSortMenu: boolean
	activeFilterBadges: P2PFilterBadge[]
	onOpenCoinPicker: () => void
	onClearCoin: () => void
	onToggleSortMenu: () => void
	onSelectSort: (index: number) => void
	onClearSort: () => void
	onRemoveBadge: (badge: P2PFilterBadge) => void
	theme: Theme
	textStyles: TextStyles
}

// Quick filters bar (type / coin / sort) + the sort menu + active filter badges.
const P2PFilterBar = ({ selectedCoin, sortIndex, showSortMenu, activeFilterBadges, onOpenCoinPicker, onClearCoin, onToggleSortMenu, onSelectSort, onClearSort, onRemoveBadge, theme, textStyles }: P2PFilterBarProps) => {

	const { t } = useTranslation()

	return (
		<>
			{/* El switch Comprar/Vender vive en el TopBar (headerTitle de P2P.jsx) */}
			<View style={styles.quickFiltersBar}>

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
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('p2p.common.coin')}</Text>
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
						<Pressable key={option.labelKey} style={[styles.activeBadge, { backgroundColor: sortIndex === idx ? theme.colors.primary : theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border }]} onPress={() => onSelectSort(idx)}>
							<Text style={[textStyles.caption, { color: sortIndex === idx ? theme.colors.almostWhite : theme.colors.primaryText, fontSize: theme.typography.fontSize.xs }]}>{t(option.labelKey)}</Text>
						</Pressable>
					))}
				</View>
			)}

			{/* Active Filter & Sort Badges */}
			{(activeFilterBadges.length > 0 || sortIndex > 0) && (
				<View style={styles.activeBadgesBar}>
					{sortIndex > 0 && (
						<Pressable style={[styles.activeBadge, { backgroundColor: theme.colors.primary }]} onPress={onClearSort}>
							<Text style={[textStyles.caption, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.xs }]}>{t(SORT_OPTIONS[sortIndex].labelKey)}</Text>
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
}

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
