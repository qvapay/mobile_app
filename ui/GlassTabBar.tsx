import { useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import LinearGradient from 'react-native-linear-gradient'
import { CommonActions } from '@react-navigation/native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

import { useTheme } from '../theme/ThemeContext'
import { hexToRgba } from '../theme/themeUtils'
import { useBottomBar } from './BottomBarContext'
import GlassSurface from './GlassSurface'
import {
	BAR_FADE_ABOVE,
	BAR_INNER_PADDING,
	barBottomOffset,
	barHeight,
	barWidth,
	glassMaterial,
	pillFrame,
} from './glassTabBarMetrics'

/** Muelle de la píldora de selección: rápido y sin rebote largo. */
const PILL_SPRING = { damping: 22, stiffness: 260, mass: 0.7 }

const ICON_SIZE = 22

/** El fundido se cierra pronto: detrás de la cápsula ya va casi opaco. */
const FADE_STOPS = [0, 0.45, 1]

/**
 * Barra inferior «glass» emulada: la de iOS 26+ (cápsula flotante con el
 * contenido pasando por debajo) para iOS < 26 y Android, donde el liquid glass
 * nativo no existe. Es el `tabBar` del navigator JS de MainStack.
 *
 * Va en `position: 'absolute'`: las escenas ocupan toda la altura y cada
 * pestaña reserva su hueco con `useTabBarClearance`. Se esconde con el mismo
 * `bottomBarVisible` de BottomBarContext que usaba la barra anterior (P2P la
 * baja al hacer scroll), en el hilo de UI y sin re-renders.
 *
 * @param props - Props estándar de tab bar de React Navigation.
 */
const GlassTabBar = ({ state, descriptors, navigation, insets }: BottomTabBarProps) => {
	const { theme } = useTheme()
	const { bottomBarVisible } = useBottomBar()
	const { width: windowWidth } = useWindowDimensions()

	const focusedOptions = descriptors[state.routes[state.index].key].options
	const showLabels = focusedOptions.tabBarShowLabel !== false
	const activeColor = focusedOptions.tabBarActiveTintColor ?? theme.colors.primary
	const inactiveColor = focusedOptions.tabBarInactiveTintColor ?? theme.colors.secondaryText

	const height = barHeight(showLabels)
	const bottom = barBottomOffset(insets.bottom)
	const width = barWidth(windowWidth)
	const frame = pillFrame(state.index, state.routes.length, width - BAR_INNER_PADDING * 2)

	// La píldora arranca YA en su sitio (sin animación de entrada) y después sigue al índice
	const pillX = useSharedValue(frame.x)
	useEffect(() => {
		pillX.value = withSpring(frame.x, PILL_SPRING)
	}, [frame.x, pillX])

	const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.value }] }))

	// Escondida = fuera de la pantalla entera (cápsula + fundido), así tampoco recibe toques
	const travel = bottom + height + BAR_FADE_ABOVE
	const visibilityStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: interpolate(bottomBarVisible.value, [0, 1], [travel, 0]) }],
		opacity: bottomBarVisible.value,
	}))

	const themed = useMemo(() => {
		const background = theme.colors.background
		return {
			// Fundido del contenido hacia el fondo: es lo que mantiene legible la barra
			// sobre una lista en movimiento (y lo único que hay en Android, sin desenfoque)
			fade: [hexToRgba(background, 0), hexToRgba(background, 0.82), hexToRgba(background, 0.96)],
			pill: { backgroundColor: glassMaterial(theme.isDark, false).pill },
			label: { fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xxs },
		}
	}, [theme])

	return (
		<Animated.View style={[styles.root, { height: travel }, visibilityStyle]} pointerEvents="box-none">
			<LinearGradient colors={themed.fade} locations={FADE_STOPS} style={StyleSheet.absoluteFill} pointerEvents="none" />

			<GlassSurface radius={height / 2} style={[styles.capsule, { bottom, width, height }]}>
				<View style={styles.tabs} accessibilityRole="tablist">
					<Animated.View
						style={[styles.pill, themed.pill, { width: frame.width, borderRadius: (height - BAR_INNER_PADDING * 2) / 2 }, pillStyle]}
						pointerEvents="none"
					/>

					{state.routes.map((route, index) => {
						const { options } = descriptors[route.key]
						const focused = index === state.index
						const color = focused ? activeColor : inactiveColor
						const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : ''

						const onPress = () => {
							const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
							if (!focused && !event.defaultPrevented) {
								navigation.dispatch({ ...CommonActions.navigate(route), target: state.key })
							}
						}

						return (
							<Pressable
								key={route.key}
								style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
								onPress={onPress}
								onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
								accessibilityRole="tab"
								accessibilityState={{ selected: focused }}
								accessibilityLabel={options.tabBarAccessibilityLabel ?? (label || options.title || route.name)}
								testID={options.tabBarButtonTestID}
							>
								{options.tabBarIcon?.({ focused, color, size: ICON_SIZE })}
								{showLabels && label ? (
									<Text style={[themed.label, { color }]} numberOfLines={1}>{label}</Text>
								) : null}
							</Pressable>
						)
					})}
				</View>
			</GlassSurface>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	root: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
	},
	capsule: {
		position: 'absolute',
		alignSelf: 'center',
	},
	tabs: {
		flex: 1,
		flexDirection: 'row',
		margin: BAR_INNER_PADDING,
	},
	pill: {
		position: 'absolute',
		top: 0,
		bottom: 0,
		left: 0,
	},
	tab: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 2,
	},
	pressed: {
		opacity: 0.6,
	},
})

export default GlassTabBar
