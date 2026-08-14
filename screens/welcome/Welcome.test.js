/**
 * Smoke tests del WelcomeScreen (hero Kinetic): monta sin crashear, el verbo
 * del headline rota con el tiempo, los CTAs navegan a Login/Register y el
 * long-press del headline re-arma el onboarding — node environment con los
 * colaboradores nativos mockeados (ver Register.test.js para el patrón).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../settings/SettingsContext', () => ({ useSettings: jest.fn() }))
// Mock artesanal de reanimated (patrón de GlobalLoadingBar.test.js), con la
// superficie extra que usa el hero: Animated.Text y builders de
// entering/exiting encadenables
jest.mock('react-native-reanimated', () => {
	const React = require('react')
	const { View, Text } = require('react-native')
	const builder = () => {
		const b = {}
		for (const k of ['delay', 'duration', 'springify', 'easing', 'damping', 'mass']) { b[k] = () => b }
		return b
	}
	const pass = (e) => e
	return {
		__esModule: true,
		default: { View, Text },
		useSharedValue: (v) => React.useRef({ value: v }).current,
		useAnimatedStyle: () => ({}),
		useDerivedValue: (fn) => ({ value: fn() }),
		useReducedMotion: () => false,
		withTiming: (v) => v,
		withRepeat: (v) => v,
		withDelay: (_d, v) => v,
		withSequence: (...vals) => vals[vals.length - 1],
		withSpring: (v) => v,
		cancelAnimation: () => {},
		Easing: { linear: 'linear', ease: 'ease', sin: 'sin', cubic: 'cubic', inOut: pass, out: pass, in: pass },
		FadeIn: builder(),
		FadeInDown: builder(),
		FadeInUp: builder(),
		FadeOut: builder(),
		FadeOutUp: builder(),
	}
})
jest.mock('react-native-linear-gradient', () => 'LinearGradient')
// react-native-svg (halo radial del BrandMark)
jest.mock('react-native-svg', () => ({
	__esModule: true,
	default: 'Svg',
	Circle: 'Circle',
	Defs: 'Defs',
	RadialGradient: 'RadialGradient',
	Stop: 'Stop',
}))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }))
jest.mock('react-native-device-info', () => ({ getVersion: () => '0.0.0' }))
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../assets/images/coins/btc.svg', () => 'BtcSvg')
jest.mock('../../assets/images/coins/eth.svg', () => 'EthSvg')
jest.mock('../../assets/images/coins/usdt.svg', () => 'UsdtSvg')
jest.mock('../../assets/images/coins/sol.svg', () => 'SolSvg')
jest.mock('../../assets/images/coins/bnb.svg', () => 'BnbSvg')
jest.mock('../../assets/images/coins/ton.svg', () => 'TonSvg')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useSettings } from '../../settings/SettingsContext'
import { ROUTES } from '../../routes'
import WelcomeScreen from './Welcome'
import WelcomeKinetic from './WelcomeKinetic'

const updateSetting = jest.fn()
const navigation = { navigate: jest.fn(), reset: jest.fn() }

const renderWelcome = () => {
	let tree
	act(() => { tree = create(<WelcomeScreen navigation={navigation} />) })
	return tree
}

const button = (tree, title) =>
	tree.root.findAllByType('QPButton').find((b) => b.props.title === title)

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	useSettings.mockReturnValue({ updateSetting })
	updateSetting.mockResolvedValue()
})

afterEach(() => {
	jest.useRealTimers()
})

describe('hero Kinetic', () => {
	test('monta el hero Kinetic con el wordmark de la marca', () => {
		const tree = renderWelcome()
		expect(tree.root.findByType(WelcomeKinetic)).toBeDefined()
		const brand = tree.root.findAllByType('Text')
			.find((t) => t.props.children === 'QvaPay')
		expect(brand).toBeDefined()
	})

	test('el verbo del headline rota con el tiempo', () => {
		const tree = renderWelcome()
		const wordOf = () => tree.root.findAllByType('Text')
			.map((t) => t.props.children).flat().find((c) => typeof c === 'string' && c.endsWith('.') && c !== 'Tu dinero.')
		const first = wordOf()
		act(() => { jest.advanceTimersByTime(2500) })
		expect(wordOf()).not.toBe(first)
	})
})

describe('acciones', () => {
	test('Comenzar navega a Login y Crear cuenta a Register', () => {
		const tree = renderWelcome()
		act(() => { button(tree, 'Comenzar').props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.LOGIN_SCREEN)
		act(() => { button(tree, 'Crear cuenta').props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.REGISTER_SCREEN)
	})

	test('el long-press del headline re-arma el onboarding y resetea a Onboard', async () => {
		const tree = renderWelcome()
		const headline = tree.root.findAllByProps({ delayLongPress: 3000 })[0]
		await act(async () => { headline.props.onLongPress() })
		expect(updateSetting).toHaveBeenCalledWith('appearance', 'firstTime', true)
		expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: ROUTES.ONBOARD_SCREEN }] })
	})
})
