import { useEffect } from 'react'
import { View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
	interpolateColor,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from 'react-native-reanimated'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import type { Theme } from '../../theme/ThemeContext'

/**
 * QPStepDots — indicador de pasos de wizard, usado por Onboard y Register.
 * Fila de puntos centrada donde el activo se estira a píldora con el color
 * primario (spring con un toque de rebote); los demás quedan como puntos
 * neutros con el color de borde del theme.
 *
 * @param props
 * @param props.count - Total de pasos.
 * @param props.activeIndex - Índice del paso activo.
 * @param props.style - Estilo extra para la fila (márgenes, etc.).
 */

type Props = {
	count: number
	activeIndex: number
	style?: StyleProp<ViewStyle>
}

type DotProps = {
	active: boolean
	theme: Theme
}

const DOT_SPRING = { mass: 0.6, damping: 16, stiffness: 200 }

const Dot = ({ active, theme }: DotProps) => {
	const progress = useSharedValue(active ? 1 : 0)
	useEffect(() => {
		progress.value = withSpring(active ? 1 : 0, DOT_SPRING)
	}, [active, progress])
	const animatedStyle = useAnimatedStyle(() => ({
		width: 8 + progress.value * 16,
		backgroundColor: interpolateColor(progress.value, [0, 1], [theme.colors.border, theme.colors.primary]),
	}))
	return <Animated.View style={[styles.dot, animatedStyle]} />
}

const QPStepDots = ({ count, activeIndex, style }: Props) => {

	// Contexts
	const { theme } = useTheme()

	return (
		<View style={[styles.row, style]}>
			{Array.from({ length: count }, (_, index) => (
				<Dot key={index} active={index === activeIndex} theme={theme} />
			))}
		</View>
	)
}

const styles = {
	row: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
	},
	dot: {
		height: 8,
		borderRadius: 4,
		marginHorizontal: 4,
	},
} as const

export default QPStepDots
