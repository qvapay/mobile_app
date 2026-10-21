import { useEffect, useImperativeHandle } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from 'react-native-reanimated'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../theme/ThemeContext'

export type PinDotsHandle = { shake: () => void }

const DOT = 14
const GAP = 22

/**
 * Los dígitos del bloqueo como PUNTOS, no como cajitas.
 *
 * `QPCodeInput` sigue siendo la implementación única de la rejilla de cajitas y no se toca:
 * la comparten el envío, el retiro, el 2FA del login y el PIN de cuenta, donde la cajita
 * ayuda a corregir un dígito concreto. Aquí no hay nada que corregir —son cuatro dígitos y
 * se verifican solos al caer el cuarto—, así que el punto dice lo mismo con mucho menos.
 *
 * Solo pinta: el PIN se teclea con el teclado de la app (`QPKeypad`), así que no hay
 * entrada oculta ni teclado del sistema que pueda tapar los puntos o perder dígitos.
 */
const PinDots = ({ ref, length = 4, code, tone, testID }: {
	ref?: Ref<PinDotsHandle>
	length?: number
	code: string
	/** Color de los puntos; al fallar se tiñen todos, que es más legible que solo temblar. */
	tone?: string
	testID?: string
}) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const color = tone ?? theme.colors.primary
	const shake = useSharedValue(0)

	useImperativeHandle(ref, () => ({
		shake: () => {
			// Cinco tirones cortos: lo justo para leerse como un "no" sin marear
			shake.value = withSequence(
				...[10, -10, 8, -8, 0].map(to => withTiming(to, { duration: 55 })),
			)
		},
	}), [shake])

	const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))

	return (
		<Animated.View
			testID={testID}
			style={[styles.row, rowStyle]}
			accessible
			accessibilityLabel={t('misc.lock.a11y.pinProgress', { entered: code.length, total: length })}
		>
			{Array.from({ length }).map((_, i) => (
				// Al fallar, el aro vacío también se tiñe: los cuatro cuentan lo ocurrido
				<Dot key={i} filled={i < code.length} color={color} empty={tone ?? theme.colors.border} />
			))}
		</Animated.View>
	)
}

/** Un punto: vacío es un aro; lleno entra con un rebote corto. */
const Dot = ({ filled, color, empty }: { filled: boolean, color: string, empty: string }) => {

	const fill = useSharedValue(filled ? 1 : 0)
	useEffect(() => {
		fill.value = filled ? withSpring(1, { damping: 12, stiffness: 320 }) : withTiming(0, { duration: 120 })
	}, [filled, fill])

	const style = useAnimatedStyle(() => ({
		transform: [{ scale: 0.75 + 0.25 * fill.value }],
		backgroundColor: fill.value > 0.5 ? color : 'transparent',
		borderColor: fill.value > 0.5 ? color : empty,
	}))

	return <Animated.View style={[styles.dot, style]} />
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: GAP, height: DOT * 2 },
	dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 1.5 },
})

export default PinDots
