/**
 * Render tests for the USD CASH delivery promo card — node environment with
 * theme, reanimated (manual mock), icons and react-native-svg mocked
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
let mockIsDark = true
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: { ...createTheme(mockIsDark), mode: mockIsDark ? 'dark' : 'light' } }) }
})
jest.mock('react-native-reanimated')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./KycGateModal', () => 'KycGateModal')

// Usuario verificado por defecto; los tests del gate lo vacían
let mockUser = { kyc: true }
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('react-native-svg', () => ({
	__esModule: true,
	default: 'Svg',
	Svg: 'Svg',
	Path: 'Path',
	Line: 'Line',
	Circle: 'Circle',
	G: 'G',
	Defs: 'Defs',
	ClipPath: 'ClipPath',
	Rect: 'Rect',
}))

import React from 'react'
import { Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import { ROUTES } from '../routes'
import CashDeliveryCard from './CashDeliveryCard'

const renderCard = (navigation = { navigate: jest.fn() }) => {
	let tree
	act(() => { tree = create(<CashDeliveryCard navigation={navigation} />) })
	return tree
}

const findCardPressable = (tree) =>
	tree.root.findAll(node => typeof node.props.onPress === 'function')[0]

beforeEach(() => { mockIsDark = true; mockUser = { kyc: true } })

test('shows the section title, hero copy and the action row', () => {
	const out = JSON.stringify(renderCard().toJSON())
	expect(out).toContain('Envío de efectivo')
	expect(out).toContain('USD CASH')
	expect(out).toContain('Recibe USD en efectivo en La Habana')
	expect(out).toContain('Enviar efectivo')
})

test('tapping the card opens the Withdraw flow with USDCASH preselected', () => {
	const navigation = { navigate: jest.fn() }
	const tree = renderCard(navigation)
	act(() => { findCardPressable(tree).props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.WITHDRAW, { preselectedCoin: 'USDCASH' })
})

test('sin KYC la card queda sombreada, con candado, y el toque abre el gate en vez de navegar', () => {
	mockUser = { kyc: false }
	const navigation = { navigate: jest.fn() }
	const tree = renderCard(navigation)

	// Sombreada + fila de acción con el porqué
	const card = findCardPressable(tree)
	expect(JSON.stringify(card.props.style({ pressed: false }))).toContain('"opacity":0.55')
	const out = JSON.stringify(tree.toJSON())
	expect(out).toContain('Requiere identidad verificada')
	expect(out).not.toContain('Enviar efectivo')

	// Inaccesible: no navega, abre el KycGateModal
	act(() => { card.props.onPress() })
	expect(navigation.navigate).not.toHaveBeenCalled()
	const modal = tree.root.findByType('KycGateModal')
	expect(modal.props.visible).toBe(true)
	expect(modal.props.message).toMatch(/identidad verificada/)

	act(() => { modal.props.onClose() })
	expect(tree.root.findByType('KycGateModal').props.visible).toBe(false)
})

test('draws the vector map from real geography: sea, land and road network', () => {
	const tree = renderCard()
	const svgs = tree.root.findAllByType('Svg')
	expect(svgs).toHaveLength(4) // map + one route overlay per courier
	expect(tree.root.findAllByType('Rect')).toHaveLength(1) // water
	const land = tree.root.findAll(n => n.type === 'Path' && n.props.fill && n.props.fill !== 'none')
	expect(land).toHaveLength(1) // real coastline silhouette
	const roadNetworks = tree.root.findAll(n => n.type === 'Path' && n.props.fill === 'none' && n.props.d && n.props.d.length > 2000)
	expect(roadNetworks.length).toBeGreaterThanOrEqual(2) // major + minor OSM networks
})

test('runs three simultaneous couriers, each with a "$" chip and dotted route', () => {
	const tree = renderCard()
	const dollars = tree.root.findAllByType(Text).filter(n => n.props.children === '$')
	expect(dollars).toHaveLength(3)
	const dottedRoutes = tree.root.findAll(n => n.type === 'Path' && n.props.strokeDasharray === '0.1, 7')
	expect(dottedRoutes).toHaveLength(3)
})

test('map colors follow the theme mode (duotone light vs dark water)', () => {
	const darkOut = JSON.stringify(renderCard().toJSON())
	expect(darkOut).toContain('#17233F')
	mockIsDark = false
	const lightOut = JSON.stringify(renderCard().toJSON())
	expect(lightOut).toContain('#D8E4F0')
	expect(lightOut).not.toContain('#17233F')
})

test('card border only shows in light mode (house dark-surface rule)', () => {
	const dark = findCardPressable(renderCard())
	expect(JSON.stringify(dark.props.style({ pressed: false }))).not.toContain('borderWidth')
	mockIsDark = false
	const light = findCardPressable(renderCard())
	expect(JSON.stringify(light.props.style({ pressed: false }))).toContain('"borderWidth":1')
})
