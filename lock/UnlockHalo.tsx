import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
	Easing,
	cancelAnimation,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'

// Theme
import { useTheme } from '../theme/ThemeContext'

// UI
import QPPressable from '../ui/particles/QPPressable'

const GLOW_SIZE = 200
const PING_SIZE = 108

/**
 * El héroe del bloqueo: el glifo que desbloquea, sobre un halo que respira.
 *
 * Comparte deliberadamente el lenguaje del `BrandMark` del Welcome —mismo halo radial del
 * acento, mismo anillo que emana cada ~4 s, mismas duraciones— para que abrir la app y
 * desbloquearla se sientan la misma casa. Aquí el halo es mayor porque no acompaña a un
 * logo de 30 px: es lo único que hay en la pantalla.
 *
 * `reduced motion` deja el halo fijo a media intensidad y sin anillo, igual que allí.
 */
const UnlockHalo = ({ size = 56, onPress, disabled = false, accessibilityLabel, children }: {
	size?: number
	/** Sin handler, el halo es decorativo (no hay biometría disponible). */
	onPress?: () => void
	disabled?: boolean
	accessibilityLabel?: string
	children?: React.ReactNode
}) => {

	const { theme } = useTheme()
	const reducedMotion = useReducedMotion()

	const breathe = useSharedValue(0)
	const ping = useSharedValue(0)

	useEffect(() => {
		if (reducedMotion) { breathe.value = 0.5; return }
		breathe.value = withRepeat(
			withSequence(
				withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
				withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
			),
			-1,
		)
		ping.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false)
		return () => { cancelAnimation(breathe); cancelAnimation(ping) }
	}, [reducedMotion, breathe, ping])

	const glowStyle = useAnimatedStyle(() => ({
		opacity: 0.5 + 0.5 * breathe.value,
		transform: [{ scale: 1 + 0.16 * breathe.value }],
	}))

	// El anillo se expande y se disuelve en el primer 55% del ciclo; el resto es reposo,
	// así no marca un ritmo de metrónomo
	const pingStyle = useAnimatedStyle(() => {
		const p = Math.min(ping.value / 0.55, 1)
		return { opacity: 0.4 * (1 - p), transform: [{ scale: 1 + p * 1.25 }] }
	})

	return (
		<View style={[styles.box, { width: size, height: size }]}>

			<Animated.View style={[styles.backdrop, styles.glow, glowStyle]} pointerEvents="none">
				<Svg width={GLOW_SIZE} height={GLOW_SIZE}>
					<Defs>
						<RadialGradient id="unlockGlow">
							<Stop offset="0" stopColor={theme.colors.primary} stopOpacity="0.5" />
							<Stop offset="0.6" stopColor={theme.colors.primary} stopOpacity="0.18" />
							<Stop offset="1" stopColor={theme.colors.primary} stopOpacity="0" />
						</RadialGradient>
					</Defs>
					<Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#unlockGlow)" />
				</Svg>
			</Animated.View>

			{!reducedMotion && (
				<Animated.View style={[styles.backdrop, styles.pingRing, { borderColor: theme.colors.primary }, pingStyle]} pointerEvents="none" />
			)}

			{onPress
				? <QPPressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={24}>{children}</QPPressable>
				: children}
		</View>
	)
}

const styles = StyleSheet.create({
	box: { alignItems: 'center', justifyContent: 'center' },
	backdrop: { position: 'absolute', left: '50%', top: '50%' },
	glow: { width: GLOW_SIZE, height: GLOW_SIZE, marginLeft: -GLOW_SIZE / 2, marginTop: -GLOW_SIZE / 2 },
	pingRing: {
		width: PING_SIZE, height: PING_SIZE,
		marginLeft: -PING_SIZE / 2, marginTop: -PING_SIZE / 2,
		borderRadius: PING_SIZE / 2, borderWidth: 1.5,
	},
})

export default UnlockHalo
