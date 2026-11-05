/**
 * GlassTabBar — la barra inferior emulada (iOS < 26 y Android): contrato con
 * React Navigation (tabPress / navegación / preventDefault), accesibilidad y
 * etiquetas. El material (GlassSurface) y el degradado se sustituyen por hosts
 * planos: aquí se prueba la barra, no sus capas.
 * @jest-environment node
 */
jest.mock('react-native-reanimated')
jest.mock('react-native-linear-gradient', () => 'LinearGradient')
jest.mock('@react-navigation/native', () => ({
	CommonActions: { navigate: (route) => ({ type: 'NAVIGATE', payload: { name: route.name } }) },
}))
jest.mock('./GlassSurface', () => {
	const { View } = require('react-native')
	return { __esModule: true, default: ({ children, style }) => <View testID="glass" style={style}>{children}</View> }
})
jest.mock('./BottomBarContext', () => ({
	useBottomBar: () => ({ bottomBarVisible: { value: 1 } }),
}))
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})

import { StyleSheet, Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import GlassTabBar from './GlassTabBar'
import { BAR_HEIGHT, BAR_HEIGHT_LABELS, barBottomOffset } from './glassTabBarMetrics'

const ROUTES = ['Home', 'Crypto', 'Keypad']

const build = ({ index = 0, showLabels = false, prevent = false } = {}) => {
	const routes = ROUTES.map(name => ({ key: `${name}-key`, name }))
	const descriptors = {}
	routes.forEach((route) => {
		descriptors[route.key] = {
			options: {
				tabBarShowLabel: showLabels,
				tabBarLabel: showLabels ? `${route.name} label` : '',
				tabBarAccessibilityLabel: `${route.name} a11y`,
				tabBarButtonTestID: `tab-${route.name}`,
				tabBarActiveTintColor: '#111111',
				tabBarInactiveTintColor: '#999999',
				tabBarIcon: ({ color, focused }) => <Text testID={`icon-${route.name}`}>{`${color}|${focused}`}</Text>,
			},
		}
	})
	const navigation = {
		emit: jest.fn(() => ({ defaultPrevented: prevent })),
		dispatch: jest.fn(),
	}
	const props = {
		state: { index, routes, key: 'tabs-key' },
		descriptors,
		navigation,
		insets: { top: 0, right: 0, bottom: 34, left: 0 },
	}
	let tree
	act(() => { tree = create(<GlassTabBar {...props} />) })
	return { tree, navigation }
}

const tab = (tree, name) => tree.root.findAll(n => n.props.testID === `tab-${name}` && typeof n.props.onPress === 'function')[0]

afterEach(() => { jest.clearAllMocks() })

test('pinta una pestaña por ruta con su icono teñido según el foco', () => {
	const { tree } = build({ index: 1 })
	expect(tree.root.findByProps({ testID: 'icon-Home' }).props.children).toBe('#999999|false')
	expect(tree.root.findByProps({ testID: 'icon-Crypto' }).props.children).toBe('#111111|true')
	expect(tab(tree, 'Crypto').props.accessibilityState).toEqual({ selected: true })
	expect(tab(tree, 'Home').props.accessibilityState).toEqual({ selected: false })
})

test('una pestaña sin etiqueta visible conserva su nombre accesible', () => {
	const { tree } = build({ showLabels: false })
	expect(tab(tree, 'Keypad').props.accessibilityLabel).toBe('Keypad a11y')
	expect(tree.root.findAllByType(Text).some(n => n.props.children === 'Keypad label')).toBe(false)
})

test('con etiquetas las pinta y la cápsula crece', () => {
	const withLabels = build({ showLabels: true })
	expect(withLabels.tree.root.findAllByType(Text).some(n => n.props.children === 'Home label')).toBe(true)

	const heightOf = ({ tree }) => StyleSheet.flatten(tree.root.findAll(n => n.props.testID === 'glass')[0].props.style).height
	expect(heightOf(withLabels)).toBe(BAR_HEIGHT_LABELS)
	expect(heightOf(build({ showLabels: false }))).toBe(BAR_HEIGHT)
})

test('la cápsula flota sobre el borde según el inset inferior', () => {
	const { tree } = build()
	const style = StyleSheet.flatten(tree.root.findAll(n => n.props.testID === 'glass')[0].props.style)
	expect(style.bottom).toBe(barBottomOffset(34))
	expect(style.position).toBe('absolute')
})

test('tocar otra pestaña emite tabPress y navega dentro de ESTE navigator', () => {
	const { tree, navigation } = build({ index: 0 })
	act(() => { tab(tree, 'Keypad').props.onPress() })
	expect(navigation.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'Keypad-key', canPreventDefault: true })
	expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', payload: { name: 'Keypad' }, target: 'tabs-key' })
})

test('tocar la pestaña activa emite tabPress pero no navega', () => {
	const { tree, navigation } = build({ index: 0 })
	act(() => { tab(tree, 'Home').props.onPress() })
	expect(navigation.emit).toHaveBeenCalledTimes(1)
	expect(navigation.dispatch).not.toHaveBeenCalled()
})

test('un listener que hace preventDefault cancela la navegación', () => {
	const { tree, navigation } = build({ index: 0, prevent: true })
	act(() => { tab(tree, 'Crypto').props.onPress() })
	expect(navigation.dispatch).not.toHaveBeenCalled()
})

test('la pulsación larga emite tabLongPress', () => {
	const { tree, navigation } = build()
	act(() => { tab(tree, 'Crypto').props.onLongPress() })
	expect(navigation.emit).toHaveBeenCalledWith({ type: 'tabLongPress', target: 'Crypto-key' })
})
