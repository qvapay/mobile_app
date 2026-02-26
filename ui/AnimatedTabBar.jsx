import Animated, { useAnimatedStyle, useSharedValue, interpolate } from 'react-native-reanimated'
import { BottomTabBar } from '@react-navigation/bottom-tabs'
import { useBottomBar } from './BottomBarContext'

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
