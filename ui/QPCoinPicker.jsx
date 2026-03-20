import { useState, useEffect, useMemo, useCallback } from 'react'
import { StyleSheet, Text, View, Pressable, Modal, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import QPCoin from './particles/QPCoin'
import QPInput from './particles/QPInput'
import QPCoinRow from './QPCoinRow'

const MAX_QUICK_PILLS = 3

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
}) => {
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const [coinSearch, setCoinSearch] = useState('')
	const [showCoinSearch, setShowCoinSearch] = useState(false)
	const [recentCoins, setRecentCoins] = useState([])

	// Load recent coins from AsyncStorage
	useEffect(() => {
		if (!recentKey) return
		AsyncStorage.getItem(recentKey).then((stored) => {
			if (stored) {
				try {
					const parsed = JSON.parse(stored)
					if (Array.isArray(parsed)) setRecentCoins(parsed.slice(0, MAX_QUICK_PILLS))
				} catch (e) { /* ignore */ }
			}
		})
	}, [recentKey])

	const saveRecentCoin = useCallback((coinTick) => {
		if (!recentKey) return
		setRecentCoins((prev) => {
			const updated = [coinTick, ...prev.filter((t) => t !== coinTick)].slice(0, MAX_QUICK_PILLS)
			AsyncStorage.setItem(recentKey, JSON.stringify(updated))
			return updated
		})
	}, [recentKey])

	// Build quick pills: recent first, then defaults
	const quickCoinPills = useMemo(() => {
		if (!coins.length || (!recentKey && !defaultCoins.length)) return []
		const pills = []
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

	const handleSelect = (coin) => {
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
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>

				{/* Header */}
				<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
					<Text style={textStyles.h4}>Seleccionar Moneda</Text>
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
							placeholder="Buscar moneda..."
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
							<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>Cargando monedas...</Text>
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
							<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>No hay monedas disponibles</Text>
						</View>
					)}
				</ScrollView>

			</SafeAreaView>
		</Modal>
	)
}

const styles = StyleSheet.create({
	modalContainer: { flex: 1 },
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
	coinList: { flex: 1 },
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
