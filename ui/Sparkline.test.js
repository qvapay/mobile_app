/**
 * Render tests for the SVG price sparkline — node environment with
 * react-native-svg mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native-svg', () => ({
	__esModule: true,
	default: 'Svg',
	Polyline: 'Polyline',
	Polygon: 'Polygon',
	Defs: 'Defs',
	LinearGradient: 'LinearGradient',
	Stop: 'Stop',
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import Sparkline from './Sparkline'

const series = (...values) => values.map(value => ({ value }))

const renderSpark = (props) => {
	let tree
	act(() => { tree = create(<Sparkline {...props} />) })
	return tree
}

test('renders nothing with fewer than 2 points', () => {
	expect(renderSpark({ data: undefined }).toJSON()).toBeNull()
	expect(renderSpark({ data: [] }).toJSON()).toBeNull()
	expect(renderSpark({ data: series(1) }).toJSON()).toBeNull()
})

test('normalizes values to the series min/max across the default 80x32 box', () => {
	const tree = renderSpark({ data: series(0, 10) })
	const line = tree.root.findByType('Polyline')
	// min lands at the bottom (y = height - padding), max at the top (y = padding)
	expect(line.props.points).toBe('2,30 78,2')
})

test('a flat series stays flat instead of dividing by zero', () => {
	const tree = renderSpark({ data: series(5, 5, 5) })
	const line = tree.root.findByType('Polyline')
	expect(line.props.points).toBe('2,30 40,30 78,30')
})

test('the gradient fill polygon closes along the bottom edge', () => {
	const tree = renderSpark({ data: series(0, 10) })
	const polygon = tree.root.findByType('Polygon')
	expect(polygon.props.points).toBe('2,30 78,2 78,32 2,32')
	expect(polygon.props.fill).toBe('url(#sparkFill)')
})

test('color drives both the stroke and the gradient stops', () => {
	const tree = renderSpark({ data: series(1, 2), color: '#DB253E' })
	expect(tree.root.findByType('Polyline').props.stroke).toBe('#DB253E')
	for (const stop of tree.root.findAllByType('Stop')) {
		expect(stop.props.stopColor).toBe('#DB253E')
	}
})

test('honors custom dimensions', () => {
	const tree = renderSpark({ data: series(1, 2), width: 100, height: 40 })
	const svg = tree.root.findByType('Svg')
	expect(svg.props.width).toBe(100)
	expect(svg.props.height).toBe(40)
})
