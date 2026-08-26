import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'

// Imagecomponents
import FastImage from "@d11/react-native-fast-image"

// Animation
import Animated, { makeMutable, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation, ReduceMotion } from 'react-native-reanimated'

// SVG for conic gradient halo
import Svg, { Path } from 'react-native-svg'

const LOCAL_FALLBACK = require('../../assets/images/ui/logo-qvapay.png')

// Colors matching qpweb: pink (#ec4899) → yellow (#fde68a) → purple (#7e22ce) → pink
const HALO_COLORS = [
	'#ec4899', '#f472b6', '#fbbf24', '#fde68a',
	'#c084fc', '#7e22ce', '#9333ea', '#7e22ce',
	'#c084fc', '#fde68a', '#fbbf24', '#f472b6',
]

// Single module-level rotation shared by every mounted halo: N VIP avatars on
// screen cost 1 UI-thread animator instead of N, and all rings spin in phase.
// Refcounted so the animator only runs while at least one halo is mounted.
const haloRotation = makeMutable(0)
let haloCount = 0

const retainHaloRotation = () => {
	haloCount += 1
	if (haloCount === 1) {
		haloRotation.value = 0
		haloRotation.value = withRepeat(withTiming(360, { duration: 10000, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false)
	}
}

const releaseHaloRotation = () => {
	haloCount -= 1
	if (haloCount === 0) cancelAnimation(haloRotation)
}

type ConicHaloWheelProps = {
	size: number
	overscan?: number
}

/**
 * Animated rotating "conic gradient" wheel shared by every halo in the app.
 * SVG has no conic-gradient primitive, so the wheel is faked with 12 pie-slice
 * paths whose colors mirror qpweb's CSS gradient, spun by an infinite 10s
 * linear Reanimated rotation on the UI thread (one shared animator for all halos).
 *
 * `overscan` scales the wheel beyond its container (centered): a circular
 * wheel inscribed in a square leaves the corners uncovered, so squircle-
 * clipped halos (featured stores) render it at ~1.5x and let the parent's
 * `overflow: hidden` + borderRadius do the masking.
 *
 * @param props
 * @param props.size - Container size in px.
 * @param [props.overscan=1] - Wheel diameter multiplier.
 */
export const ConicHaloWheel = ({ size, overscan = 1 }: ConicHaloWheelProps) => {

	useEffect(() => {
		retainHaloRotation()
		return releaseHaloRotation
	}, [])

	const animatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${haloRotation.value}deg` }] }))

	const wheel = size * overscan
	const offset = (size - wheel) / 2
	const center = wheel / 2
	const r = wheel / 2
	const sliceAngle = 360 / HALO_COLORS.length

	return (
		<Animated.View
			style={[{ position: 'absolute', top: offset, left: offset, width: wheel, height: wheel }, animatedStyle]}
			shouldRasterizeIOS
			renderToHardwareTextureAndroid
		>
			<Svg width={wheel} height={wheel} viewBox={`0 0 ${wheel} ${wheel}`}>
				{HALO_COLORS.map((color, i) => {
					const startDeg = i * sliceAngle - 90
					const endDeg = (i + 1) * sliceAngle - 90
					const startRad = startDeg * (Math.PI / 180)
					const endRad = endDeg * (Math.PI / 180)
					const x1 = center + r * Math.cos(startRad)
					const y1 = center + r * Math.sin(startRad)
					const x2 = center + r * Math.cos(endRad)
					const y2 = center + r * Math.sin(endRad)
					return (<Path key={i} d={`M ${center} ${center} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`} fill={color} />)
				})}
			</Svg>
		</Animated.View>
	)
}

// Circle-shaped VIP halo behind user avatars (wheel inscribed, no overscan).
const VipHalo = ({ size }: { size: number }) => <ConicHaloWheel size={size} />

/** Subconjunto del user que el avatar lee (perfil propio, peers P2P, contactos…). */
type AvatarUser = {
	image?: string | null
	vip?: boolean | number | null
}

type QPAvatarProps = {
	user?: AvatarUser | null
	size?: number
	isOnline?: boolean
}

/**
 * User avatar with optional VIP halo and online-presence dot.
 * Loads `https://media.qvapay.com/{user.image}` through FastImage (immutable cache),
 * falling back to the QvaPay logo. For VIPs the photo is inset by `size / 25` px per
 * side so the rotating halo peeks out as a ring. The green presence dot (P2P/chat)
 * only renders at `size >= 24` — smaller than that it reads as noise.
 *
 * @param props
 * @param [props.user] - Reads `image` (CDN path) and `vip`; null pinta el placeholder.
 * @param [props.size=32] - Outer diameter in px.
 * @param [props.isOnline] - Shows the green presence dot.
 */
const QPAvatar = ({ user = {}, size = 32, isOnline }: QPAvatarProps) => {

	// Optional properties
	const vip = user?.vip || false
	const image = user?.image || ''

	// Variables
	const borderVip = size / 25
	const hasImage = !!image
	const source = hasImage ? { uri: `https://media.qvapay.com/${image}`, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable } : LOCAL_FALLBACK

	// Opaque white backfill: transparent PNG avatars would otherwise blend into
	// the dark background (and for VIPs the spinning halo would bleed through)
	const backfill = 'white'

	return (
		<View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
			{vip && <VipHalo size={size} />}
			<View style={[styles.avatarContainer, { width: size - (borderVip * 2), height: size - (borderVip * 2), top: borderVip, left: borderVip }]}>
				<FastImage style={{ width: '100%', height: '100%', borderRadius: (size - (borderVip * 2)) / 2, backgroundColor: backfill }} source={source} resizeMode={FastImage.resizeMode.cover} />
			</View>
			{isOnline && size >= 24 && (
				<View style={{
					position: 'absolute',
					bottom: size * 0.02,
					right: size * 0.02,
					width: size * 0.28,
					height: size * 0.28,
					borderRadius: size * 0.14,
					backgroundColor: '#22c55e',
					borderWidth: size * 0.04,
					borderColor: '#ffffff',
				}} />
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		position: 'relative',
	},
	avatarContainer: {
		position: 'absolute',
		borderRadius: 50,
		overflow: 'hidden',
	}
})

export default QPAvatar
