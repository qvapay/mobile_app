import { useCallback } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../../theme/ThemeContext'

// UI
import QPPressable from '../../../../../ui/particles/QPPressable'

const SIZE = 44

/**
 * Botón redondo que invierte el sentido, montado a caballo entre las dos tarjetas con un
 * aro del color del fondo (Uniswap). Gira media vuelta en cada toque.
 */
const SwapFlipButton = ({ onPress, disabled, accessibilityLabel }: { onPress: () => void, disabled?: boolean, accessibilityLabel: string }) => {

	const { theme } = useTheme()
	const reducedMotion = useReducedMotion()
	const turns = useSharedValue(0)
	const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turns.value * 180}deg` }] }))

	const press = useCallback(() => {
		if (disabled) return
		turns.value = reducedMotion ? turns.value + 1 : withSpring(turns.value + 1, { damping: 14, stiffness: 160 })
		onPress()
	}, [disabled, reducedMotion, turns, onPress])

	return (
		<QPPressable onPress={press} style={[styles.button, { backgroundColor: theme.colors.surface, borderColor: theme.colors.background, opacity: disabled ? 0.5 : 1 }]} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
			<Animated.View style={spin}>
				<FontAwesome6 name="arrow-down" size={16} color={theme.colors.primary} iconStyle="solid" />
			</Animated.View>
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	button: { width: SIZE, height: SIZE, borderRadius: 14, borderCurve: 'continuous', borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
})

export const FLIP_BUTTON_SIZE = SIZE
export default SwapFlipButton
