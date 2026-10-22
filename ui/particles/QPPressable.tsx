import { useEffect, useRef } from 'react'
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated'
import type { ReactNode } from 'react'
import type { StyleProp, ViewProps, ViewStyle } from 'react-native'

type QPPressableProps = {
    variant?: 'scale' | 'opacity' | 'none'
    onPress?: () => void
    onPressIn?: () => void
    onPressOut?: () => void
    /** Pulsación larga; cuando dispara, el `onPress` de esa misma pulsación se omite. */
    onLongPress?: () => void
    /** Milisegundos con el dedo puesto antes de `onLongPress` (como `Pressable`). */
    delayLongPress?: number
    disabled?: boolean
    style?: StyleProp<ViewStyle>
    children?: ReactNode
} & Omit<ViewProps, 'style' | 'children'>

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
 * @param props
 * @param [props.variant='scale'] - Press feedback style.
 * @param [props.disabled=false] - Disables press handling and animation.
 * @param [props.onPress] - Press handler; `onPressIn` / `onPressOut` also supported.
 * @param [props.onLongPress] - Long-press handler (timer started on grant, cancelled on
 *   release/terminate — a scroll never fires it). Also exposed as the `longpress`
 *   accessibility action for VoiceOver/TalkBack.
 * @param [props.delayLongPress=500] - Long-press threshold in ms.
 * @param [props.style] - Style object/array (NOT the `({ pressed }) => ...` function form).
 *
 * Spring tuning and pressed-state values live below, in one place.
 */

// Press spring: snappy, with a hint of bounce on release.
const PRESS_SPRING = { mass: 0.6, damping: 14, stiffness: 220 }

// Pressed-state values.
const ACTIVE_SCALE = 0.95
const ACTIVE_OPACITY = 0.6

// Same threshold as RN's Pressable
const DEFAULT_LONG_PRESS_DELAY = 500

// Screen readers expose the long press as a custom action (no timer to hold)
const LONG_PRESS_ACTIONS = [{ name: 'longpress' as const }]

const QPPressable = ({ variant = 'scale', onPress, onPressIn, onPressOut, onLongPress, delayLongPress = DEFAULT_LONG_PRESS_DELAY, disabled = false, style, children, ...rest }: QPPressableProps) => {
    const progress = useSharedValue(0)

    // Long press: timer only when there is a handler, so the plain press path is untouched
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const longPressFired = useRef(false)
    const clearLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
        }
    }
    // Unmounting with the finger down must not fire later
    useEffect(() => clearLongPress, [])

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
        longPressFired.current = false
        if (onLongPress) {
            longPressTimer.current = setTimeout(() => {
                longPressTimer.current = null
                longPressFired.current = true
                onLongPress()
            }, delayLongPress)
        }
    }

    const pressOut = () => {
        clearLongPress()
        progress.value = withSpring(0, PRESS_SPRING)
        onPressOut?.()
    }

    return (
        <Animated.View
            accessible
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            accessibilityActions={onLongPress ? LONG_PRESS_ACTIONS : undefined}
            onAccessibilityAction={onLongPress ? (event) => { if (event.nativeEvent.actionName === 'longpress' && !disabled) onLongPress() } : undefined}
            style={[style, animatedStyle]}
            onStartShouldSetResponder={() => !disabled}
            onMoveShouldSetResponder={() => false}
            onResponderGrant={pressIn}
            onResponderRelease={() => {
                pressOut()
                // A long press that already fired consumes the gesture
                if (!disabled && !longPressFired.current) onPress?.()
            }}
            onResponderTerminate={pressOut}
            onResponderTerminationRequest={() => true}
            {...rest}>
            {children}
        </Animated.View>
    )
}

export default QPPressable
