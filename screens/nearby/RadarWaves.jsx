import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withDelay, withTiming, Easing } from 'react-native-reanimated'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

const WAVE_COUNT = 3
const WAVE_DURATION_MS = 2400
const WAVE_STAGGER_MS = 800

/**
 * One expanding radar ripple: scales 1→3 while fading .5→0 on the UI thread,
 * staggered by its index so the three waves breathe continuously.
 */
const Wave = ({ index, size, color }) => {

	const progress = useSharedValue(0)

	useEffect(() => {
		progress.value = withDelay(
			index * WAVE_STAGGER_MS,
			withRepeat(withTiming(1, { duration: WAVE_DURATION_MS, easing: Easing.out(Easing.quad) }), -1, false),
		)
	}, [progress, index])

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: 0.5 * (1 - progress.value),
		transform: [{ scale: 1 + progress.value * 2 }],
	}))

	return (
		<Animated.View
			pointerEvents="none"
			style={[
				styles.wave,
				{ width: size, height: size, borderRadius: size / 2, borderColor: color },
				animatedStyle,
			]}
		/>
	)
}

/**
 * Concentric sonar waves emanating from the self avatar at the radar center.
 * Purely decorative — pointerEvents none so peer bubbles stay tappable.
 *
 * @param {object} props
 * @param {number} [props.size=120] - Diameter the waves start from.
 */
const RadarWaves = ({ size = 120 }) => {

	const { theme } = useTheme()

	return (
		<>
			{Array.from({ length: WAVE_COUNT }, (_, i) => (
				<Wave key={i} index={i} size={size} color={theme.colors.primary} />
			))}
		</>
	)
}

const styles = StyleSheet.create({
	wave: {
		position: 'absolute',
		borderWidth: 1.5,
	},
})

export default RadarWaves
