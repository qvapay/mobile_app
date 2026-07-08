/**
 * Render tests for the store brand tile — node environment with the theme and
 * OperatorAvatar mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: { ...createTheme(true), mode: 'dark' } }) }
})
jest.mock('./OperatorAvatar', () => 'OperatorAvatar')

import React from 'react'
import { act, create } from 'react-test-renderer'
import BrandTile from './BrandTile'

const makeBrand = (overrides = {}) => ({
	brand: 'Netflix',
	logo_url: 'https://media.qvapay.com/operators/netflix.png',
	bg_color: '#E50914',
	price_min: 10,
	price_max: 100,
	offer_count: 8,
	...overrides,
})

const renderTile = (brand, props = {}) => {
	let tree
	act(() => { tree = create(<BrandTile brand={brand} onPress={jest.fn()} {...props} />) })
	return tree
}

test('shows the brand name and the "$min – $max" price range', () => {
	const out = JSON.stringify(renderTile(makeBrand()).toJSON())
	expect(out).toContain('Netflix')
	expect(out).toContain('$10 – $100')
})

test('falls back to "desde $min" when min equals max', () => {
	const out = JSON.stringify(renderTile(makeBrand({ price_min: 25, price_max: 25 })).toJSON())
	expect(out).toContain('desde $25.00')
})

test('falls back to the offer count when there is no price data', () => {
	const out = JSON.stringify(renderTile(makeBrand({ price_min: null, price_max: null })).toJSON())
	expect(out).toContain('8 opciones')
})

test('prepends the country flag emoji when provided', () => {
	const out = JSON.stringify(renderTile(makeBrand(), { country: { flag: '🇨🇺' } }).toJSON())
	expect(out).toContain('🇨🇺')
})

test('the banner uses the brand color, defaulting to the theme elevation', () => {
	const withColor = renderTile(makeBrand())
	const banner = withColor.root.findByType('OperatorAvatar').parent
	expect(JSON.stringify(banner.props.style)).toContain('#E50914')
	const noColor = renderTile(makeBrand({ bg_color: null }))
	expect(JSON.stringify(noColor.root.findByType('OperatorAvatar').parent.props.style)).toContain('#9DA3B4')
})

test('taps flow through onPress', () => {
	const onPress = jest.fn()
	let tree
	act(() => { tree = create(<BrandTile brand={makeBrand()} onPress={onPress} />) })
	act(() => { tree.root.find(n => typeof n.props.onPress === 'function').props.onPress() })
	expect(onPress).toHaveBeenCalled()
})
