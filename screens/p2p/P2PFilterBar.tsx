import { useEffect, useMemo, useState } from "react"
import { View, Text, ScrollView, StyleSheet } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPCoin from "../../ui/particles/QPCoin"
import QPPressable from "../../ui/particles/QPPressable"
import { SORT_OPTIONS } from "./useP2PFilters"
import { composeQuickCoins, RECENT_COINS_KEY } from "./p2pQuickCoins"
import type { FilterCoin, P2PFilterBadge } from "./useP2PFilters"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles } from "../../theme/themeUtils"

type P2PFilterBarProps = {
	selectedCoin: FilterCoin | null
	sortIndex: number
	showSortMenu: boolean
	activeFilterBadges: P2PFilterBadge[]
	/** Chip de moneda tocado: `null` = «Todas». */
	onSelectCoin: (coin: { tick: string, label: string } | null) => void
	onOpenCoinPicker: () => void
	onToggleSortMenu: () => void
	onSelectSort: (index: number) => void
	onRemoveBadge: (badge: P2PFilterBadge) => void
	theme: Theme
	textStyles: TextStyles
}

/** Alpha del tinte de los badges de filtro (los acentos son hex de 6 dígitos). */
const TINT_ALPHA = "26"

/**
 * Barra de filtros del mercado P2P, al estilo de los P2P de la industria (Binance/OKX):
 * una fila de chips de moneda que se desliza —«Todas», la elegida, las recientes del
 * selector y las populares— con «Más» (el selector) siempre a la vista y el orden fijado
 * a la derecha como chip que dice lo que está aplicando. Debajo, los filtros del modal
 * activos como badges teñidos que se quitan de un toque.
 *
 * El lado del mercado (Comprar/Vender) y «Mis ofertas» NO están aquí: viven en el TopBar.
 */
const P2PFilterBar = ({ selectedCoin, sortIndex, showSortMenu, activeFilterBadges, onSelectCoin, onOpenCoinPicker, onToggleSortMenu, onSelectSort, onRemoveBadge, theme, textStyles }: P2PFilterBarProps) => {

	const { t } = useTranslation()

	// Recientes del selector (las escribe QPCoinPicker al elegir): se releen cuando cambia
	// la moneda, que es justo después de que el selector las haya guardado
	const [recents, setRecents] = useState<string[]>([])
	const selectedTick = selectedCoin?.tick ?? null
	useEffect(() => {
		let alive = true
		AsyncStorage.getItem(RECENT_COINS_KEY).then(stored => {
			if (!alive || !stored) { return }
			try {
				const parsed: unknown = JSON.parse(stored)
				if (Array.isArray(parsed)) { setRecents(parsed.filter((x): x is string => typeof x === 'string')) }
			} catch { /* una clave corrupta no deja la barra sin chips */ }
		})
		return () => { alive = false }
	}, [selectedTick])

	const quickCoins = useMemo(() => composeQuickCoins(selectedCoin, recents), [selectedCoin, recents])

	const sortActive = sortIndex > 0 || showSortMenu
	const chipText = (active: boolean) => [textStyles.caption, styles.chipText, { color: active ? theme.colors.almostWhite : theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium }]
	const chipStyle = (active: boolean) => [
		styles.chip,
		{ backgroundColor: active ? theme.colors.primary : theme.colors.surface },
		!theme.isDark && !active && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
	]
	const tint = `${theme.colors.primary}${TINT_ALPHA}`

	return (
		<View style={styles.bar}>
			<View style={styles.row}>
				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" style={styles.coins}>
					{/* «Todas» = sin filtro de moneda */}
					<QPPressable style={chipStyle(!selectedTick)} onPress={() => onSelectCoin(null)} accessibilityRole="button" accessibilityState={{ selected: !selectedTick }} testID="p2p-coin-all">
						<Text style={chipText(!selectedTick)}>{t('p2p.filters.allCoins')}</Text>
					</QPPressable>

					{quickCoins.map(coin => {
						const active = coin.tick === selectedTick
						return (
							<QPPressable key={coin.tick} style={chipStyle(active)} onPress={() => onSelectCoin(coin)} accessibilityRole="button" accessibilityState={{ selected: active }} testID={`p2p-coin-${coin.tick}`}>
								<QPCoin coin={coin.tick} size={18} />
								<Text style={chipText(active)}>{coin.label}</Text>
							</QPPressable>
						)
					})}
				</ScrollView>

				{/* El catálogo entero, con buscador: fuera del scroll para que no se esconda en pantallas estrechas */}
				<QPPressable style={chipStyle(false)} onPress={onOpenCoinPicker} accessibilityRole="button" accessibilityLabel={t('p2p.common.coin')} testID="p2p-coin-more">
					<Text style={chipText(false)}>{t('p2p.filters.moreCoins')}</Text>
					<FontAwesome6 name="chevron-down" size={10} color={theme.colors.secondaryText} iconStyle="solid" />
				</QPPressable>

				{/* Orden, fijo a la derecha: dice lo que aplica en vez de un icono mudo */}
				<QPPressable style={[chipStyle(sortActive), styles.sortChip]} onPress={onToggleSortMenu} accessibilityRole="button" accessibilityState={{ expanded: showSortMenu }} testID="p2p-sort">
					<FontAwesome6 name="arrow-down-short-wide" size={12} color={sortActive ? theme.colors.almostWhite : theme.colors.secondaryText} iconStyle="solid" />
					<Text style={chipText(sortActive)}>{t(SORT_OPTIONS[sortIndex]?.labelKey ?? SORT_OPTIONS[0].labelKey)}</Text>
				</QPPressable>
			</View>

			{/* Opciones de orden */}
			{showSortMenu && (
				<View style={styles.wrapRow}>
					{SORT_OPTIONS.map((option, idx) => {
						const active = sortIndex === idx
						// "Mejor tasa" necesita una moneda: se marca con el icono para
						// que abrir el selector al tocarlo no salga de la nada
						const needsCoin = !!option.requiresCoin && !selectedTick
						return (
							<QPPressable key={option.labelKey} style={chipStyle(active)} onPress={() => onSelectSort(idx)} accessibilityRole="button" accessibilityState={{ selected: active }}>
								<Text style={chipText(active)}>{t(option.labelKey)}</Text>
								{needsCoin && <FontAwesome6 name="coins" size={10} color={active ? theme.colors.almostWhite : theme.colors.tertiaryText} iconStyle="solid" />}
							</QPPressable>
						)
					})}
				</View>
			)}

			{/* Filtros del modal activos (y «Mis ofertas»): teñidos, se quitan de un toque */}
			{activeFilterBadges.length > 0 && (
				<View style={styles.wrapRow}>
					{activeFilterBadges.map((badge) => (
						<QPPressable key={badge.key} style={[styles.badge, { backgroundColor: tint }]} onPress={() => onRemoveBadge(badge)} accessibilityRole="button" accessibilityLabel={badge.label}>
							<Text style={[textStyles.caption, styles.chipText, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium }]}>{badge.label}</Text>
							<FontAwesome6 name="xmark" size={10} color={theme.colors.primary} iconStyle="solid" />
						</QPPressable>
					))}
				</View>
			)}
		</View>
	)
}

const CHIP_HEIGHT = 34

const styles = StyleSheet.create({
	// Abraza sus chips y solo cede ancho (y se desliza) cuando no caben: «Más» va pegado a ellos
	coins: { flexGrow: 0, flexShrink: 1 },
	bar: { paddingVertical: 6, gap: 8 },
	row: { flexDirection: "row", alignItems: "center", gap: 8 },
	scroll: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		height: CHIP_HEIGHT,
		paddingHorizontal: 12,
		borderRadius: CHIP_HEIGHT / 2,
		borderCurve: "continuous",
	},
	chipText: { lineHeight: undefined },
	sortChip: { marginLeft: "auto", marginRight: 2 },
	wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 2 },
	badge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		height: 28,
		paddingHorizontal: 10,
		borderRadius: 14,
		borderCurve: "continuous",
	},
})

export default P2PFilterBar
