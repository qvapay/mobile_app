import { useState, useEffect, useMemo, useCallback } from 'react'
import { StyleSheet, Text, View, Pressable, Modal, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import QPCoin from './particles/QPCoin'
import QPInput from './particles/QPInput'
import QPCoinRow from './QPCoinRow'
import type { Coin } from '../types/domain'

const MAX_QUICK_PILLS = 3

type QuickPillDefault = { tick: string, label: string }

type QPCoinPickerProps = {
	visible: boolean
	onClose: () => void
	onSelect: (coin: Coin) => void
	coins?: Coin[]
	selectedCoin?: Coin | null
	isLoading?: boolean
	amount?: string
	direction?: 'in' | 'out'
	recentKey?: string | null
	defaultCoins?: QuickPillDefault[]
	showFees?: boolean
}

/**
 * Full-screen coin picker modal (iOS `pageSheet`) used by the Add, Withdraw
 * and PaymentMethods flows. Features a toggleable name/tick search, quick
 * pills (up to 3: recently used coins persisted in AsyncStorage under
 * `recentKey`, padded with `defaultCoins`), and a QPCoinRow list showing
 * fees/min/price and the approximate coin amount for the entered fiat amount.
 * Selecting a coin records it as recent before calling `onSelect`.
 *
 * @param props
 * @param props.visible - Controls modal visibility.
 * @param props.onClose - Dismiss handler (caller also closes after select).
 * @param props.onSelect - Called with the chosen coin object.
 * @param [props.coins] - Enabled coins from `coinsApi`.
 * @param [props.selectedCoin] - Currently selected coin (highlights its quick pill).
 * @param [props.amount] - Fiat amount used for the per-coin approximation.
 * @param [props.direction='out'] - Which fee/min set to display.
 * @param [props.recentKey] - AsyncStorage key for recents; omit to disable persistence.
 * @param [props.defaultCoins] - Fallback quick pills.
 * @param [props.showFees=true] - Toggle fee/min/approx columns in rows.
 */
const QPCoinPicker = ({
	visible,
	onClose,
	onSelect,
	coins = [],
	selectedCoin = null,
	isLoading = false,
	amount = '',
	direction = 'out',
	recentKey = null,
	defaultCoins = [],
	showFees = true,
}: QPCoinPickerProps) => {
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	const [coinSearch, setCoinSearch] = useState('')
	const [showCoinSearch, setShowCoinSearch] = useState(false)
	const [recentCoins, setRecentCoins] = useState<string[]>([])

	// Load recent coins from AsyncStorage
	useEffect(() => {
		if (!recentKey) return
		AsyncStorage.getItem(recentKey).then((stored) => {
			if (stored) {
				try {
					const parsed: unknown = JSON.parse(stored)
					if (Array.isArray(parsed)) setRecentCoins((parsed as string[]).slice(0, MAX_QUICK_PILLS))
				} catch (e) { /* ignore */ }
			}
		})
	}, [recentKey])

	const saveRecentCoin = useCallback((coinTick: string) => {
		if (!recentKey) return
		setRecentCoins((prev) => {
			const updated = [coinTick, ...prev.filter((tick) => tick !== coinTick)].slice(0, MAX_QUICK_PILLS)
			AsyncStorage.setItem(recentKey, JSON.stringify(updated))
			return updated
		})
	}, [recentKey])

	// Build quick pills: recent first, then defaults
	const quickCoinPills = useMemo(() => {
		if (!coins.length || (!recentKey && !defaultCoins.length)) return []
		const pills: { tick: string, label: string, coinData: Coin }[] = []
		for (const tick of recentCoins) {
			if (pills.length >= MAX_QUICK_PILLS) break
			const coinData = coins.find((c) => c.tick === tick)
			if (coinData) pills.push({ tick, label: coinData.name, coinData })
		}
		for (const pc of defaultCoins) {
			if (pills.length >= MAX_QUICK_PILLS) break
			if (!pills.some((p) => p.tick === pc.tick)) {
				const coinData = coins.find((c) => c.tick === pc.tick)
				if (coinData) pills.push({ tick: pc.tick, label: pc.label, coinData })
			}
		}
		return pills
	}, [recentCoins, coins, defaultCoins, recentKey])

	const filteredCoins = useMemo(() => {
		if (!coinSearch) return coins
		const q = coinSearch.toLowerCase()
		return coins.filter((coin) =>
			coin.name.toLowerCase().includes(q) ||
			coin.tick.toLowerCase().includes(q)
		)
	}, [coins, coinSearch])

	const handleSelect = (coin: Coin) => {
		saveRecentCoin(coin.tick)
		onSelect(coin)
	}

	// Reset search when modal closes
	useEffect(() => {
		if (!visible) {
			setCoinSearch('')
			setShowCoinSearch(false)
		}
	}, [visible])

	return (
		<Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
			{/* Bottom sheet: elegir una moneda no merece levantar una pantalla
			    completa — así se mantiene a la vista el contexto desde el que se
			    abrió (los filtros, el formulario de crear oferta…) */}
			<Pressable style={styles.sheetOverlay} onPress={onClose}>
				{/* El onPress vacío absorbe los toques: sin él, tocar el grabber, la
				    cabecera o cualquier hueco de la hoja caía al overlay y cerraba
				    el selector (mismo patrón que el resto de modales de la app) */}
				<Pressable
					style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom || 12 }]}
					onPress={() => { }}
				>

					<View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />

					{/* Header */}
				<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
					<Text style={textStyles.h4}>{t('ui.coinPicker.title')}</Text>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
						<Pressable onPress={() => setShowCoinSearch(!showCoinSearch)}>
							<FontAwesome6 name="magnifying-glass" size={18} color={showCoinSearch ? theme.colors.primary : theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
						<Pressable onPress={onClose} style={styles.closeButton}>
							<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					</View>
				</View>

				{/* Search */}
				{showCoinSearch && (
					<View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
						<QPInput
							value={coinSearch}
							onChangeText={setCoinSearch}
							placeholder={t('ui.coinPicker.searchPlaceholder')}
							prefixIconName="magnifying-glass"
						/>
					</View>
				)}

				{/* Quick Pills */}
				{quickCoinPills.length > 0 && (
					<View style={styles.quickCoinPills}>
						{quickCoinPills.map((pill) => (
							<Pressable
								key={pill.tick}
								style={[styles.quickCoinPill, {
									backgroundColor: selectedCoin?.tick === pill.tick ? theme.colors.primary : theme.colors.surface,
									borderColor: selectedCoin?.tick === pill.tick ? theme.colors.primary : theme.colors.border,
								}]}
								onPress={() => handleSelect(pill.coinData)}
							>
								<QPCoin coin={pill.coinData.logo} size={16} />
								<Text style={[textStyles.caption, { fontWeight: '600', color: selectedCoin?.tick === pill.tick ? theme.colors.almostWhite : theme.colors.primaryText }]}>
									{pill.label}
								</Text>
							</Pressable>
						))}
					</View>
				)}

				{/* Coin List */}
				<ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true}>
					{isLoading ? (
						<View style={styles.loadingContainer}>
							<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>{t('ui.coinPicker.loading')}</Text>
						</View>
					) : filteredCoins.length > 0 ? (
						filteredCoins.map((coin) => (
							<Pressable
								key={coin.id || coin.tick}
								style={[styles.coinItem, {
									backgroundColor: theme.colors.surface,
									borderColor: theme.colors.elevation,
								}]}
								onPress={() => handleSelect(coin)}
							>
								<QPCoinRow coin={coin} amount={amount} direction={direction} showFees={showFees} />
							</Pressable>
						))
					) : (
						<View style={styles.loadingContainer}>
							<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>{t('ui.coinPicker.empty')}</Text>
						</View>
					)}
				</ScrollView>

				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	sheetOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'flex-end',
	},
	sheet: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderCurve: 'continuous',
		maxHeight: '85%',
		overflow: 'hidden',
	},
	grabber: {
		width: 40,
		height: 4,
		borderRadius: 2,
		alignSelf: 'center',
		marginTop: 8,
		marginBottom: 4,
	},
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 15,
		borderBottomWidth: 0.5,
	},
	closeButton: { padding: 5 },
	quickCoinPills: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		paddingHorizontal: 20,
		paddingVertical: 10,
		justifyContent: 'center',
	},
	quickCoinPill: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 16,
		borderWidth: 0.5,
	},
	coinList: { flexShrink: 1 },
	coinListContent: { paddingHorizontal: 10, paddingBottom: 20 },
	coinItem: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		marginBottom: 4,
		borderWidth: 1,
	},
	loadingContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		padding: 40,
	},
})

export default QPCoinPicker
