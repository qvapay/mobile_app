import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'

// Imagecomponents
import FastImage from "@d11/react-native-fast-image"

// Animation
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated'

// SVG for conic gradient halo
import Svg, { Path } from 'react-native-svg'

const AnimatedSvg = Animated.createAnimatedComponent(Svg)

const LOCAL_FALLBACK = require('../../assets/images/ui/logo-qvapay.png')

// Colors matching qpweb: pink (#ec4899) → yellow (#fde68a) → purple (#7e22ce) → pink
const HALO_COLORS = [
	'#ec4899', '#f472b6', '#fbbf24', '#fde68a',
	'#c084fc', '#7e22ce', '#9333ea', '#7e22ce',
	'#c084fc', '#fde68a', '#fbbf24', '#f472b6',
]

/**
 * Animated rotating "conic gradient" halo shown behind VIP avatars.
 * SVG has no conic-gradient primitive, so the wheel is faked with 12 pie-slice
 * paths whose colors mirror qpweb's CSS gradient, spun by an infinite 10s
 * linear Reanimated rotation on the UI thread.
 */
const VipHalo = ({ size }) => {

	const rotation = useSharedValue(0)

	useEffect(() => {
		rotation.value = withRepeat(withTiming(360, { duration: 10000, easing: Easing.linear }), -1, false)
	}, [rotation])

	const animatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }))

	const center = size / 2
	const r = size / 2
	const sliceAngle = 360 / HALO_COLORS.length

	return (
		<AnimatedSvg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={[{ position: 'absolute', top: 0, left: 0 }, animatedStyle]} >
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
		</AnimatedSvg>
	)
}

/**
 * User avatar with optional VIP halo and online-presence dot.
 * Loads `https://media.qvapay.com/{user.image}` through FastImage (immutable cache),
 * falling back to the QvaPay logo. For VIPs the photo is inset by `size / 25` px per
 * side so the rotating halo peeks out as a ring. The green presence dot (P2P/chat)
 * only renders at `size >= 24` — smaller than that it reads as noise.
 *
 * @param {object} props
 * @param {object} props.user - Reads `image` (CDN path) and `vip`.
 * @param {number} [props.size=32] - Outer diameter in px.
 * @param {boolean} [props.isOnline] - Shows the green presence dot.
 */
const QPAvatar = ({ user = {}, size = 32, isOnline }) => {

	// Optional properties
	const vip = user?.vip || false
	const image = user?.image || ''

	// Variables
	const borderVip = size / 25
	const hasImage = !!image
	const source = hasImage ? { uri: `https://media.qvapay.com/${image}`, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable } : LOCAL_FALLBACK

	return (
		<View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
			{vip && <VipHalo size={size} />}
			<View style={[styles.avatarContainer, { width: size - (borderVip * 2), height: size - (borderVip * 2), top: borderVip, left: borderVip }]}>
				<FastImage style={{ width: '100%', height: '100%', borderRadius: (size - (borderVip * 2)) / 2, backgroundColor: vip && !hasImage ? '#ffffff' : 'transparent' }} source={source} resizeMode={FastImage.resizeMode.cover} />
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
