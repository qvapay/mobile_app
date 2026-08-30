import { useState, useEffect, useRef } from 'react'
import type { ComponentRef } from 'react'
import { Text, Pressable, View, StyleSheet, useWindowDimensions } from 'react-native'
import Animated, { runOnJS, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import type { SharedValue } from 'react-native-reanimated'
import type { NavigationProp } from '@react-navigation/native'
import type { UseQueryResult } from '@tanstack/react-query'

// Tipos
import type { RootStackParamList } from '../types/navigation'
import type { Decimal, SavingsSummary } from '../types/domain'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Settings Context
import { useSettings } from '../settings/SettingsContext'

// Resumen de ahorros (React Query, query compartida con el dashboard de Invest)
import { useSavingsSummaryQuery } from '../hooks/useSavingsSummaryQuery'

// Espejo del resumen hacia los widgets de pantalla de inicio
import { updateWidgetSavings, reloadWidgets } from '../helpers/widgetBridge'

// Particles
import QPBalance from './particles/QPBalance'
import QPFitText from './particles/QPFitText'

// Tasa anual por defecto mientras el resumen no ha llegado nunca
const DEFAULT_RATE = 3.75

type BalanceCardProps = {
	balance: Decimal
	navigation: NavigationProp<RootStackParamList>
	refreshing?: boolean
	pageProgress?: SharedValue<number>
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
 * @param props
 * @param props.balance - Main account balance in QUSD.
 * @param props.navigation - React Navigation object (for the Savings shortcut).
 * @param props.refreshing - Home's pull-to-refresh state; a rising edge triggers a savings re-fetch.
 * @param props.pageProgress - SharedValue que recibe el progreso continuo del pager (0 = cuenta, 1 = ahorros) — lo consume ActionButtons para morphear la botonera al ritmo del dedo.
 */
const BalanceCard = ({ balance, navigation, refreshing = false, pageProgress }: BalanceCardProps) => {

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Ancho vivo: en tablets/plegables la rotación o el resize cambian la ventana
	const { width: windowWidth } = useWindowDimensions()
	const cardWidth = windowWidth - 32 // match container padding

	// Settings context
	const { getSetting, updateSetting } = useSettings()

	// State
	const [showBalance, setShowBalance] = useState(true)
	const [activeIndex, setActiveIndex] = useState(0)
	const scrollRef = useRef<ComponentRef<typeof Animated.ScrollView>>(null)

	// Resumen de ahorros: la query hace el fetch al montar y la persistencia en
	// frío; aquí solo se adapta la forma que pinta la página 2 del pager
	// (el hook aún es JS y su JSDoc no lleva genérico — cast local al contrato real)
	const summary = useSavingsSummaryQuery() as UseQueryResult<SavingsSummary | null>
	const { refetch: refetchSavings } = summary
	const savings = {
		balance: summary.data ? (summary.data.balance ?? 0) : null,
		rate: summary.data?.rate ?? DEFAULT_RATE,
	}

	// El widget grande pinta un bloque de ahorro, y su dato NO viaja con el
	// perfil (updateWidgetBalance): se publica aqui, que es la superficie que el
	// widget replica y esta montada siempre que hay sesion. El await antes de
	// recargar evita que reloadAllTimelines() adelante a la escritura.
	useEffect(() => {
		if (savings.balance == null) return
		const publish = async () => {
			await updateWidgetSavings(savings.balance, savings.rate)
			reloadWidgets()
		}
		publish()
	}, [savings.balance, savings.rate])

	// Load balance visibility setting on component mount
	useEffect(() => {
		const balanceVisibility = getSetting('privacy', 'showBalance', true) as boolean
		setShowBalance(balanceVisibility)
	}, [getSetting])

	// El flanco de subida del pull-to-refresh del Home recarga los ahorros (su
	// query no cuelga de ['home'], así que el refetchQueries del feed no la cubre)
	useEffect(() => {
		if (refreshing) refetchSavings()
	}, [refreshing, refetchSavings])

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

	// Scroll en el UI thread: escribe el progreso continuo (0..1) para que
	// ActionButtons siga el dedo frame a frame; los dots solo necesitan el
	// índice discreto (runOnJS únicamente al cruzar de página)
	const lastIndex = useSharedValue(0)
	const onScroll = useAnimatedScrollHandler((event) => {
		const progress = Math.min(Math.max(event.contentOffset.x / cardWidth, 0), 1)
		if (pageProgress) pageProgress.value = progress
		const index = progress > 0.5 ? 1 : 0
		if (index !== lastIndex.value) {
			lastIndex.value = index
			runOnJS(setActiveIndex)(index)
		}
	})

	return (
		<View>
			<Animated.ScrollView
				ref={scrollRef}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onScroll={onScroll}
				scrollEventThrottle={16}
				decelerationRate="fast"
				snapToInterval={cardWidth}
				contentContainerStyle={{ width: cardWidth * 2 }}
			>

				{/* Page 1: Main Balance */}
				<Pressable onPress={toggleShowBalance} style={[styles.page, { width: cardWidth }]}>
					{showBalance ? (
						<QPBalance amount={Number(balance || 0)} fontSize={60} theme={theme} />
					) : (
						<QPFitText style={[textStyles.amount, { color: theme.colors.primaryText }]}>
							{getHiddenBalance()}
						</QPFitText>
					)}
				</Pressable>

				{/* Page 2: Savings Balance */}
				<Pressable onPress={() => navigation?.navigate('Savings')} style={[styles.page, { width: cardWidth }]} >
					{showBalance ? (
						<View style={styles.savingsContent}>
							<QPBalance amount={Number(savings.balance ?? 0)} fontSize={60} theme={theme} />
							<Text style={[styles.rateLabel, { color: theme.colors.successText, fontFamily: theme.typography.fontFamily.medium }]}>
								{savings.rate}%
							</Text>
						</View>
					) : (
						<QPFitText style={[textStyles.amount, { color: theme.colors.primaryText }]}>
							{getHiddenBalance()}
						</QPFitText>
					)}
				</Pressable>
			</Animated.ScrollView>

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
