import Animated, { useAnimatedStyle, useSharedValue, interpolate } from 'react-native-reanimated'
import { BottomTabBar } from '@react-navigation/bottom-tabs'
import { useBottomBar } from './BottomBarContext'

/**
 * Reanimated wrapper around React Navigation's `BottomTabBar` that slides it
 * off-screen when `bottomBarVisible` (a shared value from BottomBarContext)
 * goes 0 — screens hide the bar on scroll without re-rendering. Wired as the
 * `tabBar` prop of the MainStack bottom tabs. The bar's own height is captured
 * via `onLayout` so translate/margin match exactly on every device.
 *
 * @param {object} props - Standard React Navigation tab bar props, passed through.
 */
const AnimatedTabBar = (props) => {
	const { bottomBarVisible } = useBottomBar()
	const height = useSharedValue(0)

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: interpolate(bottomBarVisible.value, [0, 1], [height.value, 0]) }],
		marginBottom: interpolate(bottomBarVisible.value, [0, 1], [-height.value, 0]),
		opacity: bottomBarVisible.value,
	}))

	return (
		<Animated.View style={animatedStyle} onLayout={(e) => { height.value = e.nativeEvent.layout.height }} >
			<BottomTabBar {...props} />
		</Animated.View>
	)
}

export default AnimatedTabBar
