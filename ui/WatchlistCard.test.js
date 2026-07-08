/**
 * Render tests for the watchlist grid tile — node environment with theme,
 * particles and icons mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: { ...createTheme(true), mode: 'dark' } }) }
})
jest.mock('./particles/QPCoin', () => 'QPCoin')
jest.mock('./Sparkline', () => 'Sparkline')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import WatchlistCard from './WatchlistCard'

const makeCoin = (overrides = {}) => ({
	tick: 'BTC',
	price: 64250.5,
	change: 2.35,
	priceHistory: [{ value: 1 }, { value: 2 }],
	...overrides,
})

const renderCard = (coin, onPress = jest.fn()) => {
	let tree
	act(() => { tree = create(<WatchlistCard coin={coin} onPress={onPress} />) })
	return tree
}

test('prices from $1 get thousands separators with 2 decimals', () => {
	const out = JSON.stringify(renderCard(makeCoin()).toJSON())
	expect(out).toContain('$64,250.50')
})

test('sub-dollar prices show 4 decimals', () => {
	const out = JSON.stringify(renderCard(makeCoin({ price: 0.12345 })).toJSON())
	expect(out).toContain('$0.1235')
})

test('positive change renders green with a + and caret-up', () => {
	const tree = renderCard(makeCoin({ change: 2.35 }))
	const out = JSON.stringify(tree.toJSON())
	expect(out).toContain('+2.35%')
	expect(tree.root.findByType('FontAwesome6').props.name).toBe('caret-up')
	expect(tree.root.findByType('Sparkline').props.color).toBe('#7BFFB1')
})

test('negative change renders red with caret-down and no plus sign', () => {
	const tree = renderCard(makeCoin({ change: -1.2 }))
	const out = JSON.stringify(tree.toJSON())
	expect(out).toContain('-1.20%')
	expect(out).not.toContain('+-')
	expect(tree.root.findByType('FontAwesome6').props.name).toBe('caret-down')
	expect(tree.root.findByType('Sparkline').props.color).toBe('#DB253E')
})

test('zero change counts as positive (green)', () => {
	const tree = renderCard(makeCoin({ change: 0 }))
	expect(JSON.stringify(tree.toJSON())).toContain('+0.00%')
})

test('passes the price history into the sparkline and taps open the detail', () => {
	const onPress = jest.fn()
	const history = [{ value: 1 }, { value: 3 }]
	const tree = renderCard(makeCoin({ priceHistory: history }), onPress)
	expect(tree.root.findByType('Sparkline').props.data).toBe(history)
	act(() => { tree.root.find(n => typeof n.props.onPress === 'function').props.onPress() })
	expect(onPress).toHaveBeenCalled()
})
