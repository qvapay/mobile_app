import { useMemo, useState, useEffect, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, interpolate, runOnJS, Easing } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'

import { ROUTES } from '../routes'
import { useTheme } from '../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme-aware vector map of Havana
import HavanaMapArt, { MAP_W, MAP_H } from './HavanaMapArt'
import { COURIER_ROUTES } from './havanaGeo'

// Each courier cycles its own route subset (real street-routed polylines),
// staggered so deliveries overlap but never move in lockstep. `msPerPx`
// keeps speed constant per courier: long trips (around the bay) take
// proportionally longer than short hops.
const COURIERS = [
	{ routes: [COURIER_ROUTES.vedadoHV, COURIER_ROUTES.hvRegla], initialDelay: 0, msPerPx: 85 },
	{ routes: [COURIER_ROUTES.miramarVedado, COURIER_ROUTES.vedadoInterior], initialDelay: 2600, msPerPx: 100 },
	{ routes: [COURIER_ROUTES.este, COURIER_ROUTES.centroCerro], initialDelay: 5400, msPerPx: 92 },
]

// Precompute a route as normalized cumulative distances so the marker moves
// at constant speed along the polyline regardless of segment length.
const buildRoute = (points) => {
	const dists = [0]
	for (let i = 1; i < points.length; i++) {
		dists.push(dists[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]))
	}
	const total = dists[dists.length - 1]
	return { input: dists.map(d => d / total), xs: points.map(p => p[0]), ys: points.map(p => p[1]), length: total }
}

const CHIP_SIZE = 18
const PIN_RING = 24

/**
 * One courier running an endless delivery cycle. A single progress value per
 * cycle drives every phase so nothing can drift out of sync:
 *   0.00–0.06  the order pin pops in at the destination (with its dotted route)
 *   0.06–0.85  the "$" chip travels the polyline at constant speed
 *   0.85–0.98  delivered: success ring bursts at the pin, chip fades
 *   0.98–1.00  everything fades out; the next cycle starts on the next route
 * Route cycling happens in JS (runOnJS on animation end) because worklets
 * can't swap the interpolation arrays mid-flight.
 *
 * @param {object} props
 * @param {number[][][]} props.routes - Street-routed polylines this courier alternates between.
 * @param {number} props.initialDelay - Stagger before the first cycle (ms).
 * @param {number} props.msPerPx - Travel pace; cycle duration scales with route length.
 * @param {number} props.scaleX - Rendered-width / MAP_W ratio (y maps 1:1).
 * @param {string} props.accent - Theme accent color.
 */
const Courier = ({ routes, initialDelay, msPerPx, scaleX, accent }) => {

	const [routeIndex, setRouteIndex] = useState(0)
	const progress = useSharedValue(0)

	const points = routes[routeIndex % routes.length]
	const geom = useMemo(() => buildRoute(points), [points])
	const dest = points[points.length - 1]
	const routePath = useMemo(() => points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' '), [points])
	const duration = Math.min(16000, Math.max(7000, Math.round(geom.length * msPerPx)))

	const nextRoute = useCallback(() => setRouteIndex(i => i + 1), [])

	useEffect(() => {
		progress.value = 0
		progress.value = withDelay(
			routeIndex === 0 ? initialDelay : 600,
			withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }, (finished) => {
				if (finished) { runOnJS(nextRoute)() }
			}),
		)
	}, [routeIndex, initialDelay, duration, nextRoute, progress])

	// Dotted route line, visible while the order is alive
	const routeStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0, 0.06, 0.88, 0.96], [0, 0.85, 0.85, 0]),
	}))

	// "$" chip traveling the route
	const chipStyle = useAnimatedStyle(() => {
		const p = progress.value
		const t = interpolate(p, [0.06, 0.85], [0, 1], 'clamp')
		return {
			opacity: interpolate(p, [0.05, 0.1, 0.84, 0.9], [0, 1, 1, 0]),
			transform: [
				{ translateX: interpolate(t, geom.input, geom.xs) * scaleX - CHIP_SIZE / 2 },
				{ translateY: interpolate(t, geom.input, geom.ys) - CHIP_SIZE / 2 },
			],
		}
	}, [geom, scaleX])

	// Order pin at the destination: pops in, holds, gone once delivered
	const pinStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0, 0.05, 0.9, 0.97], [0, 1, 1, 0]),
		transform: [{ scale: interpolate(progress.value, [0, 0.05, 0.09], [0.3, 1.2, 1]) }],
	}))

	// Success ring burst on delivery
	const burstStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0.84, 0.87, 0.98], [0, 0.6, 0]),
		transform: [{ scale: interpolate(progress.value, [0.84, 0.98], [0.4, 2.4]) }],
	}))

	return (
		<>
			<Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, routeStyle]}>
				<Svg width="100%" height={MAP_H} viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none">
					<Path d={routePath} stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.1, 7" fill="none" />
				</Svg>
			</Animated.View>
			<View pointerEvents="none" style={[styles.pinWrap, { left: dest[0] * scaleX - PIN_RING / 2, top: dest[1] - PIN_RING / 2 }]}>
				<Animated.View style={[styles.pinRing, { borderColor: accent }, burstStyle]} />
				<Animated.View style={[styles.pinDot, { backgroundColor: accent }, pinStyle]} />
			</View>
			<Animated.View pointerEvents="none" style={[styles.chip, { backgroundColor: accent }, chipStyle]}>
				<Text style={styles.chipText}>$</Text>
			</Animated.View>
		</>
	)
}

/**
 * Home screen promo card for the USD CASH delivery service (cash delivered in
 * Havana within 72h). Renders a theme-aware, zoomed-out vector map of Havana
 * (HavanaMapArt) with a fleet of three couriers running staggered delivery
 * cycles: an order pin pops up somewhere in the city, a "$" chip rides its
 * dotted route, a success ring bursts on arrival and the delivery vanishes —
 * then the courier picks its next route. The land fill IS the card surface
 * color, so the copy sits on clean surface with no scrim needed. Tapping
 * opens the Withdraw flow with `USDCASH` preselected. Border only appears in
 * light mode (house rule: no borders on dark surfaces).
 *
 * @param {object} props
 * @param {object} props.navigation - React Navigation object used for `navigate()`.
 */
const CashDeliveryCard = ({ navigation }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()

	// Rendered map width (card width). Seeded from the window so overlays are
	// positioned on first paint; onLayout corrects for iPad/split view.
	const [mapWidth, setMapWidth] = useState(Dimensions.get('window').width - 32)
	const scaleX = mapWidth / MAP_W

	// Duotone palette per mode. Land = card surface so the map melts into the
	// card; light mode uses the classic "white roads on gray land" map look,
	// dark mode uses faint light strokes on the navy surface.
	const palette = useMemo(() => (theme.isDark ? {
		water: '#17233F',
		land: theme.colors.surface,
		coast: 'rgba(247,247,247,0.10)',
		road: 'rgba(247,247,247,0.06)',
		roadMajor: 'rgba(247,247,247,0.13)',
		roadW: 1.2,
		roadMajorW: 2.2,
		accent: theme.colors.primary,
	} : {
		water: '#D8E4F0',
		land: theme.colors.surface,
		coast: 'rgba(14,14,28,0.10)',
		road: 'rgba(255,255,255,0.9)',
		roadMajor: '#FFFFFF',
		roadW: 1.3,
		roadMajorW: 2.2,
		accent: theme.colors.primary,
	}), [theme])

	return (
		<View style={styles.section}>

			<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.lg }]}>
				{t('ui.cashDelivery.sectionTitle')}
			</Text>

			<Pressable onPress={() => navigation.navigate(ROUTES.WITHDRAW, { preselectedCoin: 'USDCASH' })} style={({ pressed }) => [styles.card, { backgroundColor: theme.colors.surface, transform: [{ scale: pressed ? 0.98 : 1 }] }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }]}>

				{/* Map area */}
				<View style={styles.mapArea} onLayout={e => setMapWidth(e.nativeEvent.layout.width)}>

					<HavanaMapArt palette={palette} />

					{/* Courier fleet */}
					{COURIERS.map((courier, index) => (
						<Courier key={index} {...courier} scaleX={scaleX} accent={theme.colors.primary} />
					))}

					{/* Title overlay */}
					<View style={styles.titleOverlay}>
						<Text style={[styles.cardTitle, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xxl }]}>
							USD CASH
						</Text>
						<Text style={[styles.cardSubtitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>
							{t('ui.cashDelivery.subtitle')}
						</Text>
					</View>
				</View>

				{/* Bottom action row */}
				<View style={styles.actionRow}>
					<Text style={[styles.actionText, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.md }]}>
						{t('ui.cashDelivery.cta')}
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
		height: MAP_H,
		position: 'relative',
		overflow: 'hidden',
	},
	chip: {
		position: 'absolute',
		top: 0,
		left: 0,
		width: CHIP_SIZE,
		height: CHIP_SIZE,
		borderRadius: CHIP_SIZE / 2,
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#000',
		shadowOpacity: 0.25,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 2 },
		elevation: 4,
	},
	chipText: {
		color: '#FFFFFF',
		fontSize: 10,
		fontFamily: 'Rubik-SemiBold',
	},
	pinWrap: {
		position: 'absolute',
		width: PIN_RING,
		height: PIN_RING,
		alignItems: 'center',
		justifyContent: 'center',
	},
	pinRing: {
		position: 'absolute',
		width: PIN_RING,
		height: PIN_RING,
		borderRadius: PIN_RING / 2,
		borderWidth: 2,
	},
	pinDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		borderWidth: 1.5,
		borderColor: '#FFFFFF',
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
