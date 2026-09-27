import { useCallback, useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// UI
import QPPressable from './QPPressable'

const SIZE = 44

/**
 * Botón montado a caballo entre las dos tarjetas de una conversión, con un aro del color
 * del fondo (Uniswap). Gira media vuelta en cada toque.
 *
 * Sin `onPress` no es un botón: se queda como indicador del sentido, que es lo que pide un
 * retiro —donde la dirección no se elige— frente a un swap, donde sí.
 *
 * Con `loading` la flecha cede su sitio a un aro que gira: el botón está justo entre lo que
 * se paga y lo que se recibe, que es donde la vista ya está mirando mientras espera el
 * número. Aro propio y no `ActivityIndicator`, que en cada sistema se pinta distinto y aquí
 * se vería como un injerto.
 */
const QPFlipButton = ({ onPress, loading, disabled, accessibilityLabel }: { onPress?: () => void, loading?: boolean, disabled?: boolean, accessibilityLabel: string }) => {

	const { theme } = useTheme()
	const reducedMotion = useReducedMotion()
	const turns = useSharedValue(0)
	const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turns.value * 180}deg` }] }))

	// Vuelta continua mientras dure la espera; se cancela al salir para no dejar viva una
	// animación sobre un componente desmontado
	const sweep = useSharedValue(0)
	const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${sweep.value}deg` }] }))
	useEffect(() => {
		if (!loading || reducedMotion) { cancelAnimation(sweep); sweep.value = 0; return }
		sweep.value = 0
		sweep.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false)
		return () => cancelAnimation(sweep)
	}, [loading, reducedMotion, sweep])

	const press = useCallback(() => {
		if (disabled || !onPress) return
		turns.value = reducedMotion ? turns.value + 1 : withSpring(turns.value + 1, { damping: 14, stiffness: 160 })
		onPress()
	}, [disabled, reducedMotion, turns, onPress])

	return (
		<QPPressable onPress={press} disabled={!onPress || !!disabled || !!loading} accessibilityRole={onPress ? 'button' : 'image'} style={[styles.button, { backgroundColor: theme.colors.surface, borderColor: theme.colors.background, opacity: disabled ? 0.5 : 1 }]} accessibilityLabel={accessibilityLabel}>
			{loading ? (
				<Animated.View style={[styles.ring, { borderColor: theme.colors.primary + '22', borderTopColor: theme.colors.primary }, ring]} />
			) : (
				<Animated.View style={spin}>
					<FontAwesome6 name="arrow-down" size={16} color={theme.colors.primary} iconStyle="solid" />
				</Animated.View>
			)}
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	button: { width: SIZE, height: SIZE, borderRadius: 14, borderCurve: 'continuous', borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
	// Aro con un solo lado teñido: al girar se lee como un arco persiguiéndose
	ring: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
})

export const FLIP_BUTTON_SIZE = SIZE
export default QPFlipButton
