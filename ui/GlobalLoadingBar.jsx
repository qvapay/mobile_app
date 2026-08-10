import { useEffect } from 'react'
import { StyleSheet, useWindowDimensions } from 'react-native'
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	withRepeat,
	cancelAnimation,
	Easing,
} from 'react-native-reanimated'
import LinearGradient from 'react-native-linear-gradient'
import { useTheme } from '../theme/ThemeContext'
import { hexToRgba } from '../theme/themeUtils'
import { useLoading } from '../loading/LoadingContext'

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient)

// Fraction of the window height the aurora veil covers
const VEIL_HEIGHT = 0.15

// Bands extend this far above the screen top (fraction of the veil height) so
// their tilt and drift never expose an uncovered strip along the top edge.
const OVERHANG = 0.4

// Each band: color (null = theme primary), peak alpha at the top edge,
// width/left as fractions of the screen, horizontal drift amplitude (px,
// sign = direction), drift period (ms) and a static tilt for an organic slant.
const BANDS = [
	{ color: null, peak: 0.08, width: 1.6, left: -0.3, amplitude: 90, duration: 5200, tilt: '-6deg' },
	{ color: '#7BFFB1', peak: 0.05, width: 1.1, left: 0.2, amplitude: -70, duration: 6800, tilt: '5deg' },
	{ color: '#9B51E0', peak: 0.04, width: 1.0, left: -0.05, amplitude: 60, duration: 8400, tilt: '-4deg' },
]

/**
 * One drifting aurora band: a vertical color fade (peak alpha at the top,
 * fully transparent at the bottom) that slowly sways side to side while
 * `active`. The drift runs on the UI thread and is cancelled when idle so a
 * hidden veil costs nothing.
 */
const AuroraBand = ({ active, color, peak, amplitude, duration, tilt, style }) => {
	const drift = useSharedValue(0)

	useEffect(() => {
		if (active) {
			drift.value = withRepeat(
				withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
				-1,
				true
			)
		} else {
			cancelAnimation(drift)
		}
	}, [active, duration, drift])

	const driftStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: (drift.value - 0.5) * amplitude },
			{ rotate: tilt },
		],
	}))

	return (
		<AnimatedGradient
			colors={[hexToRgba(color, peak), hexToRgba(color, peak), hexToRgba(color, peak * 0.45), hexToRgba(color, 0)]}
			locations={[0, 0.35, 0.6, 1]}
			start={{ x: 0.5, y: 0 }}
			end={{ x: 0.5, y: 1 }}
			style={[styles.band, style, driftStyle]}
		/>
	)
}

/**
 * Global loading indicator: a barely-perceptible aurora-borealis veil over the
 * top 15% of the screen, rendered above the navigator in `App.tsx`. Driven by
 * LoadingContext, which `LoadingBridge` wires into the axios client — any
 * in-flight request shows it unless the request opts out with `{ silent: true }`.
 * Three soft color bands (accent, green, violet) fade vertically to nothing and
 * drift horizontally at different speeds; the whole veil fades in/out on
 * start/stop and `pointerEvents="none"` keeps it from blocking touches.
 */
export default function GlobalLoadingBar() {
	const { theme } = useTheme()
	const { isLoading } = useLoading()
	const { width, height } = useWindowDimensions()
	const opacity = useSharedValue(0)

	useEffect(() => {
		if (isLoading) {
			opacity.value = withTiming(1, { duration: 400 })
		} else {
			opacity.value = withTiming(0, { duration: 600 })
		}
	}, [isLoading, opacity])

	const containerStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
	}))

	const veilHeight = height * VEIL_HEIGHT

	return (
		<Animated.View style={[styles.container, { height: veilHeight }, containerStyle]} pointerEvents="none">
			{BANDS.map((band, index) => (
				<AuroraBand
					key={index}
					active={isLoading}
					color={band.color || theme.colors.primary}
					peak={band.peak}
					amplitude={band.amplitude}
					duration={band.duration}
					tilt={band.tilt}
					style={{
						width: width * band.width,
						left: width * band.left,
						top: -veilHeight * OVERHANG,
						height: veilHeight * (1 + OVERHANG),
					}}
				/>
			))}
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		zIndex: 9999,
		overflow: 'hidden',
		backgroundColor: 'transparent',
	},
	band: {
		position: 'absolute',
		top: 0,
	},
})
