import { useEffect } from 'react'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

/**
 * Pulsing skeleton placeholder block — loading states only, never as permanent
 * empty-state filler. Opacity breathes 0.15 → 0.35 on an infinite 700ms
 * Reanimated loop (UI thread) over the theme's elevationLight, so it reads
 * correctly in both light and dark modes.
 *
 * @param {object} props
 * @param {number|string} props.width - Block width.
 * @param {number|string} props.height - Block height.
 * @param {number} [props.borderRadius=8] - Corner radius.
 */
const QPSkeleton = ({ width, height, borderRadius = 8, style }) => {

	// Context
	const { theme } = useTheme()

	// Pulse animation
	const opacity = useSharedValue(0.15)

	useEffect(() => {
		opacity.value = withRepeat(withTiming(0.35, { duration: 700 }), -1, true)
	}, [opacity])

	const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

	return (<Animated.View style={[{ width, height, borderRadius, backgroundColor: theme.colors.elevationLight }, animatedStyle, style]} />)
}

export default QPSkeleton
