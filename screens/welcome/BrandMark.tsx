import { useEffect } from 'react'
import { Text, View, Image, StyleSheet } from 'react-native'
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
import { useTheme } from '../../theme/ThemeContext'

const LOGO_SIZE = 30
const GLOW_SIZE = 84
const PING_SIZE = 44

/**
 * Marca del welcome: isotipo (doble check) + "QvaPay" en texto plano. El juego
 * vive en el trasfondo del isotipo: un halo radial del acento que respira
 * lentamente y un anillo que emana del logo cada ~4s y se disuelve. Logo
 * blanco en dark / violeta en light. Reduced-motion deja el halo fijo a media
 * intensidad y sin ping.
 */
const BrandMark = () => {

	// Theme
	const { theme } = useTheme()
	const reducedMotion = useReducedMotion()

	const breathe = useSharedValue(0)
	const ping = useSharedValue(0)

	useEffect(() => {
		if (reducedMotion) {
			breathe.value = 0.5
			return
		}
		breathe.value = withRepeat(
			withSequence(
				withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
				withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) })
			),
			-1
		)
		ping.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false)
		return () => {
			cancelAnimation(breathe)
			cancelAnimation(ping)
		}
	}, [reducedMotion, breathe, ping])

	const glowStyle = useAnimatedStyle(() => ({
		opacity: 0.5 + 0.5 * breathe.value,
		transform: [{ scale: 1 + 0.16 * breathe.value }],
	}))

	// El anillo se expande y disuelve en el primer 55% del ciclo; el resto es
	// reposo (opacity 0), así no marca un ritmo metrónomo
	const pingStyle = useAnimatedStyle(() => {
		const p = Math.min(ping.value / 0.55, 1)
		return {
			opacity: 0.45 * (1 - p),
			transform: [{ scale: 1 + p * 1.3 }],
		}
	})

	return (
		<View style={styles.row}>
			<View style={styles.logoBox}>

				{/* Halo radial respirando */}
				<Animated.View style={[styles.backdrop, styles.glow, glowStyle]} pointerEvents="none">
					<Svg width={GLOW_SIZE} height={GLOW_SIZE}>
						<Defs>
							<RadialGradient id="brandGlow">
								<Stop offset="0" stopColor={theme.colors.primary} stopOpacity="0.55" />
								<Stop offset="0.6" stopColor={theme.colors.primary} stopOpacity="0.22" />
								<Stop offset="1" stopColor={theme.colors.primary} stopOpacity="0" />
							</RadialGradient>
						</Defs>
						<Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#brandGlow)" />
					</Svg>
				</Animated.View>

				{/* Anillo emanando */}
				{!reducedMotion && (
					<Animated.View style={[styles.backdrop, styles.pingRing, { borderColor: theme.colors.primary }, pingStyle]} pointerEvents="none" />
				)}

				<Image
					source={theme.isDark
						? require('../../assets/images/ui/qvapay-logo-white.png')
						: require('../../assets/images/ui/logo-qvapay.png')}
					style={styles.logo}
					resizeMode="contain"
				/>
			</View>

			<Text style={[styles.name, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }]}>
				QvaPay
			</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
	},
	logoBox: {
		width: LOGO_SIZE,
		height: LOGO_SIZE,
		alignItems: 'center',
		justifyContent: 'center',
	},
	// Capas del trasfondo, centradas respecto al logo
	backdrop: {
		position: 'absolute',
		left: '50%',
		top: '50%',
	},
	glow: {
		width: GLOW_SIZE,
		height: GLOW_SIZE,
		marginLeft: -GLOW_SIZE / 2,
		marginTop: -GLOW_SIZE / 2,
	},
	pingRing: {
		width: PING_SIZE,
		height: PING_SIZE,
		marginLeft: -PING_SIZE / 2,
		marginTop: -PING_SIZE / 2,
		borderRadius: PING_SIZE / 2,
		borderWidth: 1.5,
	},
	logo: {
		width: LOGO_SIZE,
		height: LOGO_SIZE,
	},
	name: {
		fontSize: 21,
		letterSpacing: -0.4,
	},
})

export default BrandMark
