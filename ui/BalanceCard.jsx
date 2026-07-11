import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { Text, Pressable, View, ScrollView, StyleSheet, Dimensions } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Settings Context
import { useSettings } from '../settings/SettingsContext'

// API
import { savingApi } from '../api/savingApi'

// Particles
import QPBalance from './particles/QPBalance'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CARD_WIDTH = SCREEN_WIDTH - 32 // match container padding

// Savings summary (balance + rate) is fetched and updated as a single unit
const initialSavings = { balance: null, rate: 3.75 }

function savingsReducer(state, action) {
	switch (action.type) {
		case 'loaded':
			return { balance: action.balance, rate: action.rate ?? state.rate }
		default:
			return state
	}
}

/**
 * Home screen hero: a horizontally paged balance display (page 1 = main QUSD
 * balance, page 2 = savings balance + APY rate) with pagination dots.
 * Tapping the main balance toggles visibility (persisted via the
 * `privacy.showBalance` setting, hidden balances render as asterisks);
 * tapping the savings page navigates to the Savings screen.
 * Savings summary is fetched from `savingApi.getSummary()` on mount and
 * re-fetched on each pull-to-refresh (via the `refreshing` prop).
 *
 * @param {object} props
 * @param {number|string} props.balance - Main account balance in QUSD.
 * @param {object} props.navigation - React Navigation object (for the Savings shortcut).
 * @param {boolean} [props.refreshing] - Home's pull-to-refresh state; a rising edge triggers a savings re-fetch.
 */
const BalanceCard = ({ balance, navigation, refreshing = false }) => {

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Settings context
	const { getSetting, updateSetting } = useSettings()

	// State
	const [showBalance, setShowBalance] = useState(true)
	const [activeIndex, setActiveIndex] = useState(0)
	const [savings, dispatchSavings] = useReducer(savingsReducer, initialSavings)
	const scrollRef = useRef(null)

	// Load balance visibility setting on component mount
	useEffect(() => {
		const balanceVisibility = getSetting('privacy', 'showBalance', true)
		setShowBalance(balanceVisibility)
	}, [getSetting])

	// Fetch savings data on mount and on each pull-to-refresh
	useEffect(() => {
		if (!refreshing && savings.balance !== null) return
		let cancelled = false
		const fetchSavings = async () => {
			const result = await savingApi.getSummary()
			if (!cancelled && result.success && result.data) {
				dispatchSavings({ type: 'loaded', balance: result.data.balance ?? 0, rate: result.data.rate })
			}
		}
		fetchSavings()
		return () => { cancelled = true }
	}, [refreshing]) // eslint-disable-line react-hooks/exhaustive-deps

	// Functions
	const toggleShowBalance = async () => {
		const newVisibility = !showBalance
		setShowBalance(newVisibility)
		await updateSetting('privacy', 'showBalance', newVisibility)
	}

	// Generate asterisks based on balance length
	const getHiddenBalance = () => {
		if (!balance) return '***'
		const balanceStr = balance.toString()
		return '*'.repeat(Math.max(3, balanceStr.length))
	}

	const onScroll = useCallback((event) => {
		const offsetX = event.nativeEvent.contentOffset.x
		const index = Math.round(offsetX / CARD_WIDTH)
		setActiveIndex(index)
	}, [])

	return (
		<View>
			<ScrollView
				ref={scrollRef}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onScroll={onScroll}
				scrollEventThrottle={16}
				decelerationRate="fast"
				snapToInterval={CARD_WIDTH}
				contentContainerStyle={{ width: CARD_WIDTH * 2 }}
			>

				{/* Page 1: Main Balance */}
				<Pressable onPress={toggleShowBalance} style={[styles.page, { width: CARD_WIDTH }]}>
					{showBalance ? (
						<QPBalance formattedAmount={Number(balance || 0).toFixed(2)} fontSize={60} theme={theme} />
					) : (
						<Text style={[textStyles.amount, { color: theme.colors.primaryText }]}>
							{getHiddenBalance()}
						</Text>
					)}
				</Pressable>

				{/* Page 2: Savings Balance */}
				<Pressable onPress={() => navigation?.navigate('Savings')} style={[styles.page, { width: CARD_WIDTH }]} >
					{showBalance ? (
						<View style={styles.savingsContent}>
							<QPBalance formattedAmount={Number(savings.balance ?? 0).toFixed(2)} fontSize={60} theme={theme} />
							<Text style={[styles.rateLabel, { color: theme.colors.success, fontFamily: theme.typography.fontFamily.medium }]}>
								{savings.rate}%
							</Text>
						</View>
					) : (
						<Text style={[textStyles.amount, { color: theme.colors.primaryText }]}>
							{getHiddenBalance()}
						</Text>
					)}
				</Pressable>
			</ScrollView>

			{/* Pagination Dots */}
			<View style={styles.dotsContainer}>
				{[0, 1].map((i) => (<View key={i} style={[styles.dot, { backgroundColor: activeIndex === i ? theme.colors.primaryText : theme.colors.tertiaryText + '40', }]} />))}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	page: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		height: 120,
		marginVertical: 10,
	},
	savingsContent: {
		alignItems: 'center',
	},
	rateLabel: {
		fontSize: 13,
		marginTop: -14,
	},
	dotsContainer: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		gap: 6,
		marginBottom: 4,
	},
	dot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
})

export default BalanceCard
