import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../theme/ThemeContext'

type Props = { icon: FontAwesome6SolidIconName, tint?: string }

/** Héroe genérico de Novedades: un glifo en un círculo tintado con flotación sutil. */
const IconHero = ({ icon, tint }: Props) => {

	const { theme } = useTheme()
	const reducedMotion = useReducedMotion()
	const color = tint || theme.colors.primary

	const floatY = useSharedValue(0)
	useEffect(() => {
		if (reducedMotion) return
		floatY.value = withRepeat(withSequence(
			withTiming(-8, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
			withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
		), -1)
	}, [reducedMotion, floatY])
	const style = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }))

	return (
		<Animated.View style={[styles.circle, { backgroundColor: color + '1A' }, style]}>
			<View style={[styles.inner, { backgroundColor: color + '22' }]}>
				<FontAwesome6 name={icon} size={56} color={color} iconStyle="solid" />
			</View>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	circle: { width: 180, height: 180, borderRadius: 90, alignItems: 'center', justifyContent: 'center' },
	inner: { width: 136, height: 136, borderRadius: 68, alignItems: 'center', justifyContent: 'center' },
})

export default IconHero
