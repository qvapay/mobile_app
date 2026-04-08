import { useEffect } from 'react'
import { Platform, RefreshControl } from 'react-native'
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    withSequence,
    cancelAnimation,
} from 'react-native-reanimated'
import LinearGradient from 'react-native-linear-gradient'
import { useTheme } from '../theme/ThemeContext'

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient)

const GLOW_HEIGHT = 50

export default function QPRefreshIndicator({ refreshing }) {
    const { theme } = useTheme()
    const opacity = useSharedValue(0)

    useEffect(() => {
        if (refreshing) {
            opacity.value = withTiming(1, { duration: 200 }, () => {
                opacity.value = withRepeat(
                    withSequence(
                        withTiming(0.6, { duration: 600 }),
                        withTiming(0.15, { duration: 600 })
                    ),
                    -1,
                    true
                )
            })
        } else {
            cancelAnimation(opacity)
            opacity.value = withTiming(0, { duration: 300 })
        }
    }, [refreshing, opacity])

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }))

    const alphaHigh = theme.isDark ? '50' : '30'
    const alphaLow = theme.isDark ? '15' : '08'
    const primary = theme.colors.primary

    return (
        <AnimatedGradient
            colors={[primary + alphaHigh, primary + alphaLow, 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[
                {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: GLOW_HEIGHT,
                    zIndex: 1000,
                },
                animatedStyle,
            ]}
        />
    )
}

export const createHiddenRefreshControl = (refreshing, onRefresh) => (
    <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor="transparent"
        title=""
        titleColor="transparent"
        colors={['transparent']}
        progressBackgroundColor="transparent"
        {...(Platform.OS === 'android' && { progressViewOffset: -10000 })}
    />
)
