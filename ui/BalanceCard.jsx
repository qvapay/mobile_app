import { useState, useEffect, useRef, useCallback } from 'react'
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

const BalanceCard = ({ balance, navigation }) => {

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Settings context
	const { getSetting, updateSetting } = useSettings()

	// State
	const [showBalance, setShowBalance] = useState(true)
	const [animatedBalance, setAnimatedBalance] = useState(balance || 0)
	const [activeIndex, setActiveIndex] = useState(0)
	const [savingsBalance, setSavingsBalance] = useState(null)
	const [savingsRate, setSavingsRate] = useState(3.75)
	const scrollRef = useRef(null)

	// Load balance visibility setting on component mount
	useEffect(() => {
		const balanceVisibility = getSetting('privacy', 'showBalance', true)
		setShowBalance(balanceVisibility)
	}, [getSetting])

	// useEffect with balance dependency to animate the balance
	useEffect(() => {
		if (balance !== undefined && balance !== null) {
			setAnimatedBalance(balance)
		}
	}, [balance])

	// Fetch savings data
	useEffect(() => {
		const fetchSavings = async () => {
			const result = await savingApi.getSummary()
			if (result.success && result.data) {
				setSavingsBalance(result.data.balance ?? 0)
				if (result.data.rate) setSavingsRate(result.data.rate)
			}
		}
		fetchSavings()
	}, [])

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
						<QPBalance formattedAmount={Number(animatedBalance).toFixed(2)} fontSize={60} theme={theme} />
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
							<QPBalance formattedAmount={Number(savingsBalance ?? 0).toFixed(2)} fontSize={60} theme={theme} />
							<Text style={[styles.rateLabel, { color: theme.colors.success, fontFamily: theme.typography.fontFamily.medium }]}>
								{savingsRate}%
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
				{[0, 1].map((i) => (
					<View
						key={i}
						style={[
							styles.dot,
							{
								backgroundColor: activeIndex === i
									? theme.colors.primaryText
									: theme.colors.tertiaryText + '40',
							},
						]}
					/>
				))}
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
