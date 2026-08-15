import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated'

// Theme Context
import { useTheme } from '../theme/ThemeContext'

// UI
import QPPressable from './particles/QPPressable'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../routes'

const ROW_HEIGHT = 64

// Tile de la cuenta principal (icono arriba, label abajo). El desplazamiento
// es un parallax escalonado por índice: cada tile sale un poco más lejos que
// el anterior, siguiendo el dedo en tiempo real (pageProgress 0→1).
const AccountTile = ({ icon, label, onPress, index, pageProgress, theme }) => {
	const style = useAnimatedStyle(() => {
		const p = pageProgress ? pageProgress.value : 0
		return {
			opacity: 1 - p,
			transform: [
				{ translateX: -(24 + index * 18) * p },
				{ scale: 1 - 0.06 * p },
			],
		}
	})
	return (
		<Animated.View style={[styles.tileSlot, style]}>
			<QPPressable onPress={onPress} style={[styles.tile, { backgroundColor: theme.colors.elevation }]}>
				<FontAwesome6 name={icon} size={17} color={theme.colors.primaryText} iconStyle="solid" />
				<Text style={[styles.tileLabel, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>
					{label}
				</Text>
			</QPPressable>
		</Animated.View>
	)
}

// Pill de ahorros (relleno menta + tinta oscura — regla de verdes de la casa).
// Entra desde la derecha con el mismo parallax escalonado, en espejo.
const SavingsPill = ({ icon, label, onPress, index, pageProgress, theme }) => {
	const style = useAnimatedStyle(() => {
		const p = pageProgress ? pageProgress.value : 0
		return {
			opacity: p,
			transform: [
				{ translateX: (28 + index * 22) * (1 - p) },
				{ scale: 0.94 + 0.06 * p },
			],
		}
	})
	return (
		<Animated.View style={[styles.tileSlot, style]}>
			<QPPressable onPress={onPress} style={[styles.pill, { backgroundColor: theme.colors.success }]}>
				<FontAwesome6 name={icon} size={16} color={theme.colors.almostBlack} iconStyle="solid" />
				<Text style={[styles.pillLabel, { color: theme.colors.almostBlack, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }]}>
					{label}
				</Text>
			</QPPressable>
		</Animated.View>
	)
}

/**
 * Botonera del Home sincronizada con el pager del BalanceCard: en la página de
 * la cuenta muestra los 4 tiles (Depositar / Extraer / Enviar / Pagar) y al
 * hacer swipe a Ahorros se transforman en las 2 pills menta del servicio de
 * ahorro (Depositar / Retirar → abren la pantalla Savings con el modal listo).
 * La transición sigue el dedo frame a frame en el UI thread (`pageProgress` es
 * el shared value que escribe el scroll del BalanceCard): parallax escalonado
 * de salida a la izquierda mientras las pills entran desde la derecha.
 *
 * @param {object} props
 * @param {object} props.navigation - React Navigation object.
 * @param {object} [props.pageProgress] - SharedValue 0..1 del pager (0 = cuenta, 1 = ahorros).
 */
const ActionButtons = ({ navigation, pageProgress }) => {

	// Theme variables, dark and light modes with memoized styles
	const { theme } = useTheme()

	// Qué fila recibe los toques (los estilos animados siguen el dedo; el
	// pointerEvents cambia al cruzar la mitad del swipe)
	const [savingsActive, setSavingsActive] = useState(false)
	useAnimatedReaction(
		() => (pageProgress ? pageProgress.value > 0.5 : false),
		(current, previous) => {
			if (current !== previous) runOnJS(setSavingsActive)(current)
		}
	)

	const accountActions = [
		{ icon: 'plus', label: 'Depositar', onPress: () => navigation.navigate(ROUTES.ADD) },
		{ icon: 'turn-up', label: 'Extraer', onPress: () => navigation.navigate(ROUTES.WITHDRAW) },
		{ icon: 'paper-plane', label: 'Enviar', onPress: () => navigation.navigate(ROUTES.SEND) },
		{ icon: 'qrcode', label: 'Pagar', onPress: () => navigation.navigate(ROUTES.SCAN_SCREEN) },
	]

	const savingsActions = [
		{ icon: 'piggy-bank', label: 'Depositar', onPress: () => navigation.navigate(ROUTES.SAVINGS_SCREEN, { action: 'deposit' }) },
		{ icon: 'turn-up', label: 'Retirar', onPress: () => navigation.navigate(ROUTES.SAVINGS_SCREEN, { action: 'withdraw' }) },
	]

	return (
		<View style={styles.container}>
			<View style={styles.row} pointerEvents={savingsActive ? 'none' : 'auto'}>
				{accountActions.map((action, index) => (
					<AccountTile key={action.label} {...action} index={index} pageProgress={pageProgress} theme={theme} />
				))}
			</View>

			<View style={[styles.row, styles.overlayRow]} pointerEvents={savingsActive ? 'auto' : 'none'}>
				{savingsActions.map((action, index) => (
					<SavingsPill key={action.label} {...action} index={index} pageProgress={pageProgress} theme={theme} />
				))}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		height: ROW_HEIGHT,
	},
	row: {
		flexDirection: 'row',
		gap: 10,
		height: ROW_HEIGHT,
	},
	overlayRow: {
		...StyleSheet.absoluteFillObject,
	},
	tileSlot: {
		flex: 1,
	},
	tile: {
		flex: 1,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 5,
	},
	tileLabel: {},
	pill: {
		flex: 1,
		borderRadius: 16,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
	},
	pillLabel: {},
})

export default ActionButtons
