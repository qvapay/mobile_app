import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	withRepeat,
	cancelAnimation,
} from 'react-native-reanimated'
import LinearGradient from 'react-native-linear-gradient'
import { useTheme } from '../theme/ThemeContext'
import { useLoading } from '../loading/LoadingContext'

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient)

const BAR_HEIGHT = 3

export default function GlobalLoadingBar() {
	const { theme } = useTheme()
	const { isLoading } = useLoading()
	const opacity = useSharedValue(0)
	const translateX = useSharedValue(-1)

	useEffect(() => {
		if (isLoading) {
			opacity.value = withTiming(1, { duration: 150 })
			translateX.value = -1
			translateX.value = withRepeat(
				withTiming(1, { duration: 1000 }),
				-1,
				false
			)
		} else {
			cancelAnimation(translateX)
			opacity.value = withTiming(0, { duration: 300 })
		}
	}, [isLoading])

	const containerStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
	}))

	const shimmerStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value * 300 }],
	}))

	const primary = theme.colors.primary

	return (
		<Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
			<AnimatedGradient
				colors={['transparent', primary, primary, 'transparent']}
				start={{ x: 0, y: 0.5 }}
				end={{ x: 1, y: 0.5 }}
				locations={[0, 0.3, 0.7, 1]}
				style={[styles.shimmer, shimmerStyle]}
			/>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		height: BAR_HEIGHT,
		zIndex: 9999,
		overflow: 'hidden',
		backgroundColor: 'transparent',
	},
	shimmer: {
		width: '40%',
		height: BAR_HEIGHT,
	},
})
