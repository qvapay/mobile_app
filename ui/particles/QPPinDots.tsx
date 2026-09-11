import { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, interpolateColor } from 'react-native-reanimated'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { hexToRgba } from '../../theme/themeUtils'

// Relleno del punto: entra con un rebote corto, sin llegar a sentirse elástico
const FILL_SPRING = { mass: 0.5, damping: 13, stiffness: 280 }
const ERROR_FADE = { duration: 160 }

type DotProps = {
	filled: boolean
	error: boolean
	size: number
	emptyColor: string
	fillColor: string
	errorColor: string
}

/**
 * Un punto del indicador. Son DOS capas superpuestas a propósito: la base
 * interpola vacío→lleno y la de encima solo sube su opacidad al fallar. Anidar
 * dos `interpolateColor` sobre el mismo estilo mezcla formatos de color y se
 * ve como un parpadeo; con capas cada animación es independiente.
 */
const Dot = ({ filled, error, size, emptyColor, fillColor, errorColor }: DotProps) => {

	const progress = useSharedValue(filled ? 1 : 0)
	const errorProgress = useSharedValue(error ? 1 : 0)

	useEffect(() => { progress.value = withSpring(filled ? 1 : 0, FILL_SPRING) }, [filled, progress])
	useEffect(() => { errorProgress.value = withTiming(error ? 1 : 0, ERROR_FADE) }, [error, errorProgress])

	const baseStyle = useAnimatedStyle(() => ({
		transform: [{ scale: 1 + progress.value * 0.18 }],
		backgroundColor: interpolateColor(progress.value, [0, 1], [emptyColor, fillColor]),
	}))

	const errorStyle = useAnimatedStyle(() => ({ opacity: errorProgress.value }))

	const circle = { width: size, height: size, borderRadius: size / 2 }

	return (
		<Animated.View style={[circle, baseStyle]}>
			<Animated.View style={[StyleSheet.absoluteFill, circle, { backgroundColor: errorColor }, errorStyle]} />
		</Animated.View>
	)
}

type QPPinDotsProps = {
	length?: number
	filled: number
	error?: boolean
	size?: number
}

/**
 * Indicador de progreso de un PIN: un punto por dígito, que se rellena con el
 * acento en cuanto la tecla cae y se tiñe de rojo cuando el PIN es incorrecto.
 *
 * Es solo PRESENTACIÓN — no captura texto ni abre el teclado del sistema. Va de
 * la mano de `QPPinPad`: juntos sustituyen al grid de cajas (`QPCodeInput`) en
 * las pantallas donde el PIN se teclea con el pad propio de la app.
 *
 * @param props
 * @param [props.length=4] - Cuántos dígitos tiene el PIN.
 * @param props.filled - Cuántos dígitos van introducidos.
 * @param [props.error=false] - Pinta los puntos en rojo (PIN incorrecto).
 * @param [props.size=16] - Diámetro del punto en px.
 */
const QPPinDots = ({ length = 4, filled, error = false, size = 16 }: QPPinDotsProps) => {

	const { theme } = useTheme()

	// El punto vacío es el acento a muy baja opacidad, no un gris: así el
	// indicador se lee como una sola pieza con el relleno, en claro y en oscuro
	const emptyColor = hexToRgba(theme.colors.primary, theme.isDark ? 0.22 : 0.16)

	return (
		<View style={styles.row}>
			{Array.from({ length }).map((_, index) => (
				<Dot
					key={index}
					filled={index < filled}
					error={error}
					size={size}
					emptyColor={emptyColor}
					fillColor={theme.colors.primary}
					errorColor={theme.colors.danger}
				/>
			))}
		</View>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 20,
	},
})

export default QPPinDots
