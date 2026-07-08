import { useMemo, useEffect } from 'react'
import LinearGradient from 'react-native-linear-gradient'
import { View, Text, Pressable, StyleSheet, Image } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withDelay, Easing } from 'react-native-reanimated'


import { ROUTES } from '../routes'
import { useTheme } from '../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Delivery vehicle SVGs (isometric)
import Delivery1 from '../assets/images/ui/delivery/1.svg'
import Delivery2 from '../assets/images/ui/delivery/2.svg'
import Delivery3 from '../assets/images/ui/delivery/3.svg'
import Delivery4 from '../assets/images/ui/delivery/4.svg'
import Delivery5 from '../assets/images/ui/delivery/5.svg'
import Delivery6 from '../assets/images/ui/delivery/6.svg'
import Delivery7 from '../assets/images/ui/delivery/7.svg'
import Delivery8 from '../assets/images/ui/delivery/8.svg'

const ALL_DELIVERIES = [Delivery1, Delivery2, Delivery3, Delivery4, Delivery5, Delivery6, Delivery7, Delivery8]

// Generate random position within safe bounds (avoids title overlay at bottom)
const randomPos = () => ({
	top: `${10 + Math.floor(Math.random() * 40)}%`,
	left: `${5 + Math.floor(Math.random() * 70)}%`,
})

// Isometric directions — source SVGs are cyclists facing SW by default.
// We derive the other 3 directions via mirroring (rotation alone breaks iso perspective).
const ISO_DIRECTIONS = [
	{ dx: -0.85, dy: 0.5,  scaleX: 1,  scaleY: 1  }, // SW (default — no transform)
	{ dx: 0.85,  dy: 0.5,  scaleX: -1, scaleY: 1  }, // SE (horizontal mirror)
	{ dx: -0.85, dy: -0.5, scaleX: 1,  scaleY: -1 }, // NW (vertical mirror)
	{ dx: 0.85,  dy: -0.5, scaleX: -1, scaleY: -1 }, // NE (both mirrors)
]

/**
 * One looping delivery-vehicle sprite: fades in, glides 70–130px along its iso
 * direction over 22–32s, fades out, and repeats forever (randomized start delay
 * desynchronizes the fleet). Mirroring (`scaleX`/`scaleY`) comes from the
 * direction, since rotating the SVG would break the isometric perspective.
 *
 * @param {object} props
 * @param {React.ComponentType} props.Component - Imported delivery SVG.
 * @param {{top: string, left: string}} props.position - Random start position (percent offsets).
 * @param {{dx: number, dy: number, scaleX: number, scaleY: number}} props.direction - One of ISO_DIRECTIONS.
 */
const AnimatedDelivery = ({ Component, position, direction }) => {

	const translateX = useSharedValue(0)
	const translateY = useSharedValue(0)
	const opacity = useSharedValue(0)

	useEffect(() => {
		const distance = 70 + Math.random() * 60                  // 70–130px travel
		const travelDuration = 22000 + Math.random() * 10000      // 22–32s per leg
		const fadeDuration = 2500
		const startDelay = Math.floor(Math.random() * 4000)
		const ease = Easing.inOut(Easing.sin)

		const tx = direction.dx * distance
		const ty = direction.dy * distance

		opacity.value = withDelay(startDelay, withRepeat(
			withSequence(
				withTiming(1, { duration: fadeDuration, easing: Easing.out(Easing.sin) }),
				withTiming(1, { duration: Math.max(0, travelDuration - fadeDuration * 2) }),
				withTiming(0, { duration: fadeDuration, easing: Easing.in(Easing.sin) }),
			),
			-1,
			false,
		))

		translateX.value = withDelay(startDelay, withRepeat(
			withSequence(
				withTiming(0, { duration: 0 }),
				withTiming(tx, { duration: travelDuration, easing: ease }),
			),
			-1,
			false,
		))

		translateY.value = withDelay(startDelay, withRepeat(
			withSequence(
				withTiming(0, { duration: 0 }),
				withTiming(ty, { duration: travelDuration, easing: ease }),
			),
			-1,
			false,
		))
	}, [direction, opacity, translateX, translateY])

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scaleX: direction.scaleX },
			{ scaleY: direction.scaleY },
		],
	}))

	return (
		<Animated.View style={[styles.deliveryIcon, position, animatedStyle]}>
			<Component width={25} height={25} />
		</Animated.View>
	)
}

/**
 * Home screen promo card for the USD CASH delivery service (cash delivered in
 * Havana within 48h). Shows a Havana map with three randomly chosen animated
 * delivery vehicles drifting across it; tapping opens the Withdraw flow with
 * `USDCASH` preselected. Border only appears in light mode (house rule: no
 * borders on dark surfaces); the bottom LinearGradient fades the map into the
 * card surface so the action row blends in.
 *
 * @param {object} props
 * @param {object} props.navigation - React Navigation object used for `navigate()`.
 */
const CashDeliveryCard = ({ navigation }) => {

	const { theme } = useTheme()

	// Pick 3 random delivery SVGs, each with a random iso direction + start position
	const deliveryIcons = useMemo(() => {
		const shuffled = [...ALL_DELIVERIES].sort(() => Math.random() - 0.5)
		return shuffled.slice(0, 3).map(icon => ({
			Component: icon,
			direction: ISO_DIRECTIONS[Math.floor(Math.random() * ISO_DIRECTIONS.length)],
			position: randomPos(),
		}))
	}, [])

	return (
		<View style={styles.section}>

			<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.lg }]}>
				Envío de efectivo
			</Text>

			<Pressable onPress={() => navigation.navigate(ROUTES.WITHDRAW, { preselectedCoin: 'USDCASH' })} style={({ pressed }) => [styles.card, { backgroundColor: theme.colors.surface, transform: [{ scale: pressed ? 0.98 : 1 }] }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }]}>

				{/* Map background area */}
				<View style={styles.mapArea}>

					{/* Havana map image */}
					<Image
						source={require('../assets/images/maps/havana.png')}
						style={styles.mapImage}
						resizeMode="cover"
					/>

					{/* Bottom fade — matches action row surface color, fades up to transparent */}
					<LinearGradient
						colors={[
							'transparent',
							theme.colors.surface,
						]}
						style={styles.overlay}
					/>

					{/* Delivery vehicle icons — travel along iso direction, rotation matches movement */}
					{deliveryIcons.map(({ Component, direction, position }, index) => (
						<AnimatedDelivery key={index} Component={Component} direction={direction} position={position} />
					))}

					{/* Title overlay */}
					<View style={styles.titleOverlay}>
						<Text style={[styles.cardTitle, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xxl }]}>
							USD CASH
						</Text>
						<Text style={[styles.cardSubtitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>
							Recibe USD en efectivo en La Habana{'\n'}en menos de 48 horas
						</Text>
					</View>
				</View>

				{/* Bottom action row */}
				<View style={styles.actionRow}>
					<Text style={[styles.actionText, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.md }]}>
						Enviar efectivo
					</Text>
					<FontAwesome6 name="chevron-right" size={14} color={theme.colors.primary} iconStyle="solid" />
				</View>
			</Pressable>
		</View>
	)
}

const styles = StyleSheet.create({
	section: {
		marginVertical: 10,
		gap: 8,
	},
	sectionTitle: {},
	card: {
		borderRadius: 16,
		overflow: 'hidden',
	},
	mapArea: {
		height: 200,
		position: 'relative',
		overflow: 'hidden',
	},
	mapImage: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		width: '100%',
		height: '100%',
	},
	overlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	deliveryIcon: {
		position: 'absolute',
	},
	titleOverlay: {
		position: 'absolute',
		bottom: 16,
		left: 16,
		right: 16,
	},
	cardTitle: {},
	cardSubtitle: {
		marginTop: 4,
	},
	actionRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	actionText: {},
})

export default CashDeliveryCard
