import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeInUp, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { NumberFlow } from 'number-flow-react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { getNumberLocale } from '../../i18n'

const SATS_COLOR = '#F7931A'
const ADDRESS = 'tunombre@qvpay.me'
const SATS = 21000
const TYPE_MS = 55
const COUNTER_DELAY_MS = 500

/**
 * Héroe de la slide «Lightning Address» de Novedades: un rayo que late, la
 * dirección tecleándose y un cobro en sats que entra con el odómetro. Solo
 * Reanimated + NumberFlow (el de QPBalance); con «reducir movimiento» se pinta
 * el estado final sin bucles.
 */
const LightningHero = () => {

	const { theme } = useTheme()
	const reducedMotion = useReducedMotion()

	// Rayo: latido + halo
	const pulse = useSharedValue(1)
	const glow = useSharedValue(0.35)
	useEffect(() => {
		if (reducedMotion) return
		pulse.value = withRepeat(withSequence(
			withTiming(1.1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
			withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
		), -1)
		glow.value = withRepeat(withSequence(
			withTiming(0.75, { duration: 900, easing: Easing.inOut(Easing.sin) }),
			withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.sin) }),
		), -1)
	}, [reducedMotion, pulse, glow])
	const boltStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))
	const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: pulse.value * 1.15 }] }))

	// Dirección tecleándose y, al acabar, el cobro
	const [typed, setTyped] = useState(reducedMotion ? ADDRESS.length : 0)
	const [sats, setSats] = useState(reducedMotion ? SATS : 0)
	useEffect(() => {
		if (reducedMotion) return
		let i = 0
		const typing = setInterval(() => {
			i += 1
			setTyped(i)
			if (i >= ADDRESS.length) clearInterval(typing)
		}, TYPE_MS)
		const counter = setTimeout(() => setSats(SATS), ADDRESS.length * TYPE_MS + COUNTER_DELAY_MS)
		return () => { clearInterval(typing); clearTimeout(counter) }
	}, [reducedMotion])
	const done = typed >= ADDRESS.length

	return (
		<View style={styles.wrap}>
			<View style={styles.boltWrap}>
				<Animated.View style={[styles.glow, { backgroundColor: SATS_COLOR }, glowStyle]} />
				<Animated.View style={[styles.boltCircle, { backgroundColor: SATS_COLOR + '22' }, boltStyle]}>
					<FontAwesome6 name="bolt" size={56} color={SATS_COLOR} iconStyle="solid" />
				</Animated.View>
			</View>

			<View style={[styles.chip, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }]}>
				<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.monoMedium, fontSize: theme.typography.fontSize.lg }}>
					{ADDRESS.slice(0, typed)}
					{!done && <Text style={{ color: SATS_COLOR }}>▏</Text>}
				</Text>
			</View>

			<View style={styles.counterSlot}>
				{sats > 0 && (
					<Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(450)} style={styles.counter}>
						<Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xl }}>+</Text>
						<NumberFlow value={sats} locales={getNumberLocale()} continuous style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xl }} />
						<Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xl }}> sats</Text>
					</Animated.View>
				)}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	wrap: { alignItems: 'center', gap: 22 },
	boltWrap: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
	glow: { position: 'absolute', width: 140, height: 140, borderRadius: 70 },
	boltCircle: { width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center' },
	chip: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderCurve: 'continuous', minWidth: 220, alignItems: 'center' },
	counterSlot: { height: 36, justifyContent: 'center' },
	counter: { flexDirection: 'row', alignItems: 'center' },
})

export default LightningHero
