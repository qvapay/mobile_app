import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions } from 'react-native'
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	useDerivedValue,
	useReducedMotion,
	withTiming,
	withRepeat,
	cancelAnimation,
	Easing,
} from 'react-native-reanimated'
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia'
import { useTheme } from '../theme/ThemeContext'
import { useLoading } from '../loading/LoadingContext'

// Master clock period. Every rate inside the shader is a whole-number multiple
// of this, so the loop wraps seamlessly with a linear, non-reversing repeat.
const LOOP_MS = 14000

// Fraction of the window height the canvas covers. The shader's vertical
// falloff reaches alpha 0 by 0.235 screen-heights (+0.01 of per-ray bob), so
// 0.28 clips only fully-transparent pixels — anything shorter would guillotine
// the curtain's lower edge.
const VEIL_HEIGHT = 0.28

// Aurora-curtain field, ported from SchroederNathan/react-native-motion
// (aurora-curtain.tsx) — a shader whose constants were measured off a real
// aurora rather than chosen by eye. Deltas from the source: the drag/pull
// mechanic is removed (u_pull, TOP guard), the opaque near-black backdrop is
// replaced by premultiplied alpha output so the veil composites over the app
// UI, peak alpha arrives via u_gain (theme-dependent) instead of a constant,
// and the violet tint's strong end leans towards the QvaPay primary #6759EF.
const AURORA_SKSL = `
uniform float2 u_res;
uniform float  u_t;
uniform float  u_gain;         // peak alpha
uniform float3 u_tint_strong;  // accent-derived light color, strong cast
uniform float3 u_tint_weak;    // same hue, washed towards white

// How far the swing lags per screen-height down a ray, in loop-normalised time
// (4.0s / 14.0s). The lag is what leans and curves the rays while they move —
// there is no slant drawn into them.
const float LAG = 0.2857;

// Vertical falloff: plateau at the top edge, half-bright at 0.13
// screen-heights, gone by 0.235 — (1 - smoothstep)^0.55 because the measured
// falloff is nearly linear through its middle, not an S-curve.
const float FADE_A = -0.20;
const float FADE_B = 0.22;
const float FADE_P = 0.55;

const float EDGE_P = 1.6;        // ray edge softness
const float BOB_AMP = 0.01;      // per-ray fade-height drift, screen-heights

// How far each ray fades (down to 12% and back). With u_gain this sets how
// FILLED the curtain looks — gaps want to sit near 0.69x of the mean.
const float BREATHE_DEPTH = 0.88;

const float PULSE_DEPTH = 0.40;  // global swell, measured bright:dim of 1.60

float hash(float2 p) {
  return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
}

// Independent opacity cycle per ray. Two harmonics rather than one, so a ray
// sometimes lingers bright and sometimes drops out early instead of fading
// like a metronome. Rates stay whole numbers to keep the loop seamless.
float breathe(float t, float speed, float phase, float depth) {
  float TAU = 6.2831853;
  float w = 0.5 + 0.5 * sin((t * speed + phase) * TAU);
  w = clamp(w + 0.25 * sin((t * (speed * 2.0 + 1.0) + phase * 3.1) * TAU), 0.0, 1.0);
  return (1.0 - depth) + depth * w;
}

// One ray: a soft band hanging straight down at rest, its centre swinging on
// two summed sines (so it visibly speeds up and slows down). The swing is read
// at a lagged time further down the ray (td carries the lag), which is what
// makes it lean and straighten as it settles.
float ray(float x, float ys, float td, float tw, float base, float halfWidth,
          float a1, float s1, float p1,
          float a2, float s2, float p2,
          float bobSpeed, float bobPhase,
          float brSpeed, float brPhase, float weight) {
  float TAU = 6.2831853;
  float swing = a1 * sin((td * s1 + p1) * TAU)
              + a2 * sin((td * s2 + p2) * TAU);
  float f = 1.0 - smoothstep(0.0, halfWidth, abs(x - (base + swing)));
  f = pow(f, EDGE_P);

  // Each ray fades out at its own drifting height, so it lengthens and
  // shortens — kept small or the lower edge scallops into separate lobes.
  float yy = ys + BOB_AMP * sin((tw * bobSpeed + bobPhase) * TAU);
  float fade = pow(1.0 - smoothstep(FADE_A, FADE_B, yy), FADE_P);

  return f * fade * breathe(tw, brSpeed, brPhase, BREATHE_DEPTH) * weight;
}

half4 main(float2 fragCoord) {
  float TAU = 6.2831853;

  float x = fragCoord.x / u_res.x;
  float ys = fragCoord.y / u_res.y;

  float t = u_t;

  // Warped clock: two whole-rate periodic offsets swell the effective playback
  // between ~0.5x and ~1.5x, so the field surges and lulls instead of drifting
  // at one flat speed — and tw still advances exactly 1 per loop.
  float tw = t
           + 0.012 * sin((t * 3.0 + 0.37) * TAU)
           + 0.006 * sin((t * 7.0 + 0.71) * TAU);

  // The lagged clock, shared by every ray so they all lean together.
  float td = tw - ys * LAG;

  // Nine rays, heavily overlapping — centres scattered off any even lattice and
  // widths varying widely, so the horizontal spectrum has no peak and the field
  // never reads as regularly spaced vertical lines.
  float v = 0.0;
  v += ray(x, ys, td, tw, 0.000, 0.300, 0.0665, 3.0, 0.00, 0.0266, 2.0, 0.20, 1.0, 0.00, 1.0, 0.00, 0.85);
  v += ray(x, ys, td, tw, 0.336, 0.210, 0.0546, 3.0, 0.37, 0.0315, 2.0, 0.62, 2.0, 0.35, 2.0, 0.17, 0.90);
  v += ray(x, ys, td, tw, 0.165, 0.435, 0.0735, 3.0, 0.68, 0.0224, 4.0, 0.15, 1.0, 0.70, 1.0, 0.33, 0.86);
  v += ray(x, ys, td, tw, 0.543, 0.255, 0.0595, 3.0, 0.15, 0.0287, 2.0, 0.85, 2.0, 0.10, 3.0, 0.50, 0.88);
  v += ray(x, ys, td, tw, 0.366, 0.375, 0.0630, 3.0, 0.52, 0.0252, 2.0, 0.40, 1.0, 0.45, 2.0, 0.67, 0.84);
  v += ray(x, ys, td, tw, 0.804, 0.165, 0.0504, 3.0, 0.83, 0.0336, 4.0, 0.70, 2.0, 0.80, 1.0, 0.83, 0.89);
  v += ray(x, ys, td, tw, 0.816, 0.345, 0.0700, 3.0, 0.26, 0.0238, 2.0, 0.05, 1.0, 0.20, 2.0, 0.42, 0.87);
  v += ray(x, ys, td, tw, 1.263, 0.225, 0.0574, 3.0, 0.60, 0.0301, 2.0, 0.95, 2.0, 0.55, 3.0, 0.92, 0.85);
  v += ray(x, ys, td, tw, 1.035, 0.405, 0.0616, 3.0, 0.44, 0.0259, 4.0, 0.28, 1.0, 0.90, 2.0, 0.08, 0.86);

  // Global swell on top of the per-ray fades.
  v *= 1.0 + PULSE_DEPTH * sin(t * TAU);

  // Soft-compress rather than clamp: overlaps still read brighter than a lone
  // ray, but nothing hits a ceiling, so the light keeps its internal shape.
  float v2 = v / (1.0 + v);
  float a = clamp(v2 * u_gain, 0.0, 1.0);

  // Grain: dithers the large low-alpha gradients so they do not band on a
  // phone display. 2-physical-pixel cells so it survives downscaling; the
  // floor term keeps most of it in the dark areas, faded out before the
  // field's lower edge so it never ends in a visible line.
  float g = 1.0 - smoothstep(0.11, 0.28, ys);
  a += (hash(floor(fragCoord / 0.5)) - 0.5) * 0.055 * (0.55 * g + 0.45 * v2);
  a = clamp(a, 0.0, 1.0);

  // One hue throughout — the user's selected accent, lifted towards white by
  // the component. The two mix ends are the strong and weak casts of that same
  // hue, so what varies across the width is how much cast the light carries,
  // never its color. About one and a half cycles across, slowly trading places
  // at a whole-number rate.
  float m = 0.5 + 0.5 * sin((x * 1.5 + t) * TAU);
  float3 tint = mix(u_tint_strong, u_tint_weak, m);

  // Premultiplied: the veil composites over the app UI, not over a backdrop.
  return half4(tint * a, a);
}
`

const AURORA_SHADER = Skia.RuntimeEffect.Make(AURORA_SKSL)

// Peak alpha per mode — THE intensity knobs, tunable independently (the
// source's 0.2664 was fitted against a near-black backdrop, so these are a
// taste call, not a derivation). Ceiling: text under the veil must stay
// comfortably legible in both modes.
const GAIN_DARK = 0.50
const GAIN_LIGHT = 0.75

// The two ends of the shader's tint ramp, per mode: the selected accent lifted
// towards white by these amounts. STRONG carries the cast, WEAK is the same
// hue washed further out, so the shader varies cast strength, never color.
// Dark mode is light against a night sky — near-white with a colored cast.
// Light mode inverts the trick: near-white is invisible on light surfaces, so
// the veil stays close to the saturated accent and reads as a soft watercolor
// mist instead.
const TINT_LIFTS = {
	dark: { strong: 0.35, weak: 0.78 },
	light: { strong: 0.05, weak: 0.5 },
}

// Accent hex → shader float3, lifted towards white by `lift`. Aurora light is
// additive-looking: near-white with a colored cast, never the saturated
// accent itself, which would read as paint smeared over the UI.
const auroraTint = (hex: string, lift: number): number[] =>
	[0, 1, 2].map((i) => {
		const channel = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
		return channel + (1 - channel) * lift
	})

/**
 * Global loading indicator: an aurora-borealis curtain draped over the top of
 * the screen — a Skia shader field of nine overlapping light rays that lean,
 * sway and breathe on a seamless 14s loop. Rendered above the navigator in
 * `App.tsx`, driven by LoadingContext, which `LoadingBridge` wires into the
 * axios client — any in-flight request shows it unless the request opts out
 * with `{ silent: true }`. The light carries the user's selected accent color
 * (theme.colors.primary) — an emerald accent gets an emerald aurora — tuned
 * per mode: luminous near-white casts in dark mode, a quieter saturated mist
 * in light mode (see TINT_LIFTS). The whole veil fades in/out on
 * start/stop, respects reduced-motion (static frame instead of the loop),
 * unmounts the canvas entirely once hidden so an idle veil costs nothing, and
 * `pointerEvents="none"` keeps it from blocking touches.
 */
export default function GlobalLoadingBar() {
	const { theme } = useTheme()
	const { isLoading } = useLoading()
	const { width, height } = useWindowDimensions()
	const reducedMotion = useReducedMotion()
	const opacity = useSharedValue(0)
	const phase = useSharedValue(0)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		if (isLoading) {
			setMounted(true)
			opacity.value = withTiming(1, { duration: 400 })
		} else {
			opacity.value = withTiming(0, { duration: 600 })
			const idle = setTimeout(() => setMounted(false), 650)
			return () => clearTimeout(idle)
		}
	}, [isLoading, opacity])

	// The phase loop is tied to `mounted`, NOT to `isLoading`: back-to-back
	// requests flip isLoading while the veil is still fading out, and resetting
	// the phase then teleports the whole field mid-view — the loop must survive
	// those flips untouched (and keep the rays moving through the fade-out).
	// The reset to 0 only ever happens on a fresh mount, behind opacity 0.
	useEffect(() => {
		if (!mounted) {
			return
		}
		if (reducedMotion) {
			phase.value = 0.18
			return
		}
		phase.value = 0
		phase.value = withRepeat(
			withTiming(1, { duration: LOOP_MS, easing: Easing.linear }),
			-1,
			false
		)
		return () => cancelAnimation(phase)
	}, [mounted, reducedMotion, phase])

	const containerStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
	}))

	const accent = theme.colors.primary
	const isDark = theme.isDark
	const look = useMemo(() => {
		const lifts = TINT_LIFTS[isDark ? 'dark' : 'light']
		return {
			gain: isDark ? GAIN_DARK : GAIN_LIGHT,
			strong: auroraTint(accent, lifts.strong),
			weak: auroraTint(accent, lifts.weak),
		}
	}, [accent, isDark])
	const uniforms = useDerivedValue(() => ({
		u_res: [width, height],
		u_t: phase.value,
		u_gain: look.gain,
		u_tint_strong: look.strong,
		u_tint_weak: look.weak,
	}))

	if (!AURORA_SHADER || !mounted) {
		return null
	}

	return (
		<Animated.View
			style={[styles.container, { height: height * VEIL_HEIGHT }, containerStyle]}
			pointerEvents="none"
		>
			<Canvas style={StyleSheet.absoluteFill}>
				<Fill>
					<Shader source={AURORA_SHADER} uniforms={uniforms} />
				</Fill>
			</Canvas>
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
		backgroundColor: 'transparent',
	},
})
