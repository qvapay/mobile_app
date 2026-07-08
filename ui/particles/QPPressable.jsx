import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated'

/**
 * QPPressable — the app's central press-feedback wrapper, built on `react-native-reanimated`.
 * It backs QPButton and press animations across ~50 screens.
 *
 * Exists because `Animated.createAnimatedComponent(Pressable)` corrupts the Fabric
 * commit on RN 0.84 (SIGSEGV in MountingCoordinator::pullTransaction). So this is
 * ONE element only: a single `Animated.View` that carries both the full `style`
 * (layout identical to the original — no extra wrappers to break it) and the
 * animated transform. Touch detection uses RN's native Responder system directly,
 * NOT a wrapping `Pressable`. The scale/opacity spring runs on the UI thread
 * via `withSpring`.
 *
 * @param {object} props
 * @param {'scale'|'opacity'|'none'} [props.variant='scale'] - Press feedback style.
 * @param {boolean} [props.disabled=false] - Disables press handling and animation.
 * @param {function} [props.onPress] - Press handler; `onPressIn` / `onPressOut` also supported.
 * @param {object|Array} [props.style] - Style object/array (NOT the `({ pressed }) => ...` function form).
 *
 * Spring tuning and pressed-state values live below, in one place.
 */

// Press spring: snappy, with a hint of bounce on release.
const PRESS_SPRING = { mass: 0.6, damping: 14, stiffness: 220 }

// Pressed-state values.
const ACTIVE_SCALE = 0.95
const ACTIVE_OPACITY = 0.6

const QPPressable = ({ variant = 'scale', onPress, onPressIn, onPressOut, disabled = false, style, children, ...rest }) => {
    const progress = useSharedValue(0)

    const animatedStyle = useAnimatedStyle(() => {
        if (variant === 'none') return {}
        if (variant === 'opacity') {
            return { opacity: interpolate(progress.value, [0, 1], [1, ACTIVE_OPACITY], Extrapolation.CLAMP) }
        }
        return { transform: [{ scale: interpolate(progress.value, [0, 1], [1, ACTIVE_SCALE], Extrapolation.CLAMP) }] }
    })

    const pressIn = () => {
        progress.value = withSpring(1, PRESS_SPRING)
        onPressIn?.()
    }

    const pressOut = () => {
        progress.value = withSpring(0, PRESS_SPRING)
        onPressOut?.()
    }

    return (
        <Animated.View
            accessible
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            style={[style, animatedStyle]}
            onStartShouldSetResponder={() => !disabled}
            onMoveShouldSetResponder={() => false}
            onResponderGrant={pressIn}
            onResponderRelease={() => {
                pressOut()
                if (!disabled) onPress?.()
            }}
            onResponderTerminate={pressOut}
            onResponderTerminationRequest={() => true}
            {...rest}>
            {children}
        </Animated.View>
    )
}

export default QPPressable
