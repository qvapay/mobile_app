/**
 * Render tests for the custom bottom tab bar — node environment with theme,
 * settings, icons and QPPressable mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../settings/SettingsContext', () => ({ useSettings: jest.fn() }))
jest.mock('./particles/QPPressable', () => 'QPPressable')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useSettings } from '../settings/SettingsContext'
import BottomBar from './BottomBar'

const ROUTE_NAMES = ['Home', 'Invest', 'Keypad', 'P2P', 'Store']

const makeProps = (index = 0) => {
	const routes = ROUTE_NAMES.map(name => ({ key: `${name}-key`, name }))
	return {
		state: { index, routes },
		descriptors: Object.fromEntries(routes.map(r => [r.key, { options: {} }])),
		navigation: {
			emit: jest.fn(() => ({ defaultPrevented: false })),
			navigate: jest.fn(),
		},
	}
}

const renderBar = (props) => {
	let tree
	act(() => { tree = create(<BottomBar {...props} />) })
	return tree
}

beforeEach(() => {
	jest.clearAllMocks()
	useSettings.mockReturnValue({ settings: { appearance: { bottomBarLabels: true } } })
})

test('renders one tab per route with the navItems icons', () => {
	const tree = renderBar(makeProps())
	expect(tree.root.findAllByType('QPPressable')).toHaveLength(5)
	const icons = tree.root.findAllByType('FontAwesome6').map(i => i.props.name)
	expect(icons).toEqual(['wallet', 'bitcoin-sign', 'dollar-sign', 'users', 'store'])
})

test('shows the Spanish labels only when the appearance setting is on', () => {
	const labeled = JSON.stringify(renderBar(makeProps()).toJSON())
	;['Inicio', 'Invertir', 'Enviar', 'P2P', 'Tienda'].forEach(label => expect(labeled).toContain(label))

	useSettings.mockReturnValue({ settings: { appearance: { bottomBarLabels: false } } })
	const bare = JSON.stringify(renderBar(makeProps()).toJSON())
	expect(bare).not.toContain('Inicio')
	expect(bare).not.toContain('Tienda')
})

test('the focused tab is marked selected and gets the larger icon', () => {
	const tree = renderBar(makeProps(2))
	const tabs = tree.root.findAllByType('QPPressable')
	expect(tabs[2].props.accessibilityState).toEqual({ selected: true })
	expect(tabs[0].props.accessibilityState).toEqual({})
	const icons = tree.root.findAllByType('FontAwesome6')
	expect(JSON.stringify(icons[2].props.style)).toContain('"fontSize":24')
	expect(JSON.stringify(icons[0].props.style)).toContain('"fontSize":20')
})

test('pressing another tab emits tabPress and navigates with merge', () => {
	const props = makeProps(0)
	const tree = renderBar(props)
	act(() => { tree.root.findAllByType('QPPressable')[3].props.onPress() })
	expect(props.navigation.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'P2P-key', canPreventDefault: true })
	expect(props.navigation.navigate).toHaveBeenCalledWith({ name: 'P2P', merge: true })
})

test('pressing the focused tab or a prevented event never navigates', () => {
	const focused = makeProps(0)
	const tree = renderBar(focused)
	act(() => { tree.root.findAllByType('QPPressable')[0].props.onPress() })
	expect(focused.navigation.navigate).not.toHaveBeenCalled()

	const prevented = makeProps(0)
	prevented.navigation.emit.mockReturnValue({ defaultPrevented: true })
	const tree2 = renderBar(prevented)
	act(() => { tree2.root.findAllByType('QPPressable')[1].props.onPress() })
	expect(prevented.navigation.navigate).not.toHaveBeenCalled()
})
