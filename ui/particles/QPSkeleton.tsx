import { useEffect } from 'react'
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

/**
 * Pulsing skeleton placeholder block — loading states only, never as permanent
 * empty-state filler. Opacity breathes 0.15 → 0.35 on an infinite 700ms
 * Reanimated loop (UI thread) over the theme's elevationLight, so it reads
 * correctly in both light and dark modes.
 *
 * @param props
 * @param props.width - Block width.
 * @param props.height - Block height.
 * @param props.borderRadius - Corner radius.
 */
type Props = {
	width: DimensionValue
	height: DimensionValue
	borderRadius?: number
	style?: StyleProp<ViewStyle>
}

const QPSkeleton = ({ width, height, borderRadius = 8, style }: Props) => {

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
