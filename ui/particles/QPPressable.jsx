import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated'

/**
 * QPPressable — wrapper central de animaciones de press, sobre `react-native-reanimated`.
 *
 * Es UN SOLO elemento: un `Animated.View` que lleva el `style` completo (layout idéntico
 * al original, sin wrappers que descuadren) y el transform animado. La detección de toque
 * usa el Responder system nativo de RN — NO un `Pressable` envolvente ni
 * `Animated.createAnimatedComponent(Pressable)` (este último corrompe el commit de Fabric:
 * SIGSEGV en MountingCoordinator::pullTransaction).
 *
 * El scale corre en el UI thread con `withSpring`.
 *
 * API:
 *   - `variant`: 'scale' (default) | 'opacity' | 'none'
 *   - `disabled`: deshabilita press y animación
 *   - `onPress` / `onPressIn` / `onPressOut`: handlers de press
 *   - `style`: objeto o array de estilos (no la forma función `({ pressed }) => ...`)
 *
 * Tuning del spring y valores activos: aquí, en un solo lugar.
 */

// Spring del press: snappy con un toque de rebote al soltar.
const PRESS_SPRING = { mass: 0.6, damping: 14, stiffness: 220 }

// Valores en estado presionado.
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
