/**
 * Render tests for the USD CASH delivery promo card — node environment with
 * theme, reanimated (manual mock), gradient, icons and the delivery SVGs
 * mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
let mockIsDark = true
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: { ...createTheme(mockIsDark), mode: mockIsDark ? 'dark' : 'light' } }) }
})
jest.mock('react-native-reanimated')
jest.mock('react-native-linear-gradient', () => 'LinearGradient')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../assets/images/ui/delivery/1.svg', () => 'Delivery1')
jest.mock('../assets/images/ui/delivery/2.svg', () => 'Delivery2')
jest.mock('../assets/images/ui/delivery/3.svg', () => 'Delivery3')
jest.mock('../assets/images/ui/delivery/4.svg', () => 'Delivery4')
jest.mock('../assets/images/ui/delivery/5.svg', () => 'Delivery5')
jest.mock('../assets/images/ui/delivery/6.svg', () => 'Delivery6')
jest.mock('../assets/images/ui/delivery/7.svg', () => 'Delivery7')
jest.mock('../assets/images/ui/delivery/8.svg', () => 'Delivery8')

import React from 'react'
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

beforeEach(() => { mockIsDark = true })

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

test('spawns exactly three animated delivery sprites over the map', () => {
	const tree = renderCard()
	const sprites = tree.root.findAll(node => typeof node.type === 'string' && node.type.startsWith('Delivery'))
	expect(sprites).toHaveLength(3)
	sprites.forEach(sprite => {
		expect(sprite.props.width).toBe(25)
		expect(sprite.props.height).toBe(25)
	})
})

test('the map fades into the surface through the bottom gradient', () => {
	const tree = renderCard()
	const gradient = tree.root.findByType('LinearGradient')
	expect(gradient.props.colors[0]).toBe('transparent')
})

test('card border only shows in light mode (house dark-surface rule)', () => {
	const dark = findCardPressable(renderCard())
	expect(JSON.stringify(dark.props.style({ pressed: false }))).not.toContain('borderWidth')
	mockIsDark = false
	const light = findCardPressable(renderCard())
	expect(JSON.stringify(light.props.style({ pressed: false }))).toContain('"borderWidth":1')
})
