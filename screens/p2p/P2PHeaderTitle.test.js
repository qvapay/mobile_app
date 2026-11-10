/**
 * Tests for the P2POffer screen title: coin + amount + side, the market colors
 * for each side, the status line and the countdown taking its place during the
 * payment window — node environment with the real dark theme.
 * @jest-environment node
 */
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../ui/particles/QPCoin', () => 'QPCoin')
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
import P2PHeaderTitle from './P2PHeaderTitle'

const theme = createTheme(true)

const PROPS = { side: 'buy', amount: '3353.39', coinLogo: 'cup', coinName: 'CUP', status: 'completed' }

const renderTitle = (props) => {
	let tree
	act(() => { tree = create(<P2PHeaderTitle {...PROPS} {...props} />) })
	return tree
}

const dump = (tree) => JSON.stringify(tree.toJSON())

test('shows the coin logo, the amount and the coin name', () => {
	const tree = renderTitle()
	const out = dump(tree)
	expect(tree.root.findByType('QPCoin').props.coin).toBe('cup')
	expect(out).toContain('3353.39')
	expect(out).toContain('CUP')
})

test('a buy reads «Compra» with the market red and a down arrow', () => {
	const tree = renderTitle()
	const out = dump(tree)
	expect(out).toContain('Compra')
	expect(out).toContain(theme.colors.dangerText)
	expect(tree.root.findByType('FontAwesome6').props.name).toBe('arrow-down')
})

test('a sell reads «Venta» with the market green and an up arrow', () => {
	const tree = renderTitle({ side: 'sell' })
	const out = dump(tree)
	expect(out).toContain('Venta')
	expect(out).toContain(theme.colors.successText)
	expect(tree.root.findByType('FontAwesome6').props.name).toBe('arrow-up')
})

test('without a payment window the second line shows the status', () => {
	expect(dump(renderTitle({ status: 'completed' }))).toContain('Completada')
	expect(dump(renderTitle({ status: 'open' }))).toContain('Abierta')
	expect(dump(renderTitle({ status: 'revision' }))).toContain('Revisión')
})

test('a paused offer stays open for the API but reads «En pausa», also to VoiceOver', () => {
	const tree = renderTitle({ status: 'open', paused: true })
	const out = dump(tree)
	expect(out).toContain('En pausa')
	expect(out).not.toContain('Abierta')
	expect(out).toContain(theme.colors.warning)
	expect(tree.toJSON().props.accessibilityLabel).toBe('Compra, 3353.39 CUP, En pausa')
})

describe('during the payment window', () => {
	beforeEach(() => { jest.useFakeTimers() })
	afterEach(() => { jest.useRealTimers() })

	test('the countdown takes the place of the status', () => {
		const expiresAt = new Date(Date.now() + 45 * 60000 + 500).toISOString()
		const tree = renderTitle({ status: 'processing', expiresAt })
		const visible = tree.root.findAllByType('Text').flatMap(text => text.props.children)
		expect(visible).toContain('45:00')
		expect(visible).not.toContain('Procesando')
	})
})

test('the whole title is announced as a single header', () => {
	const view = renderTitle().toJSON()
	expect(view.props.accessible).toBe(true)
	expect(view.props.accessibilityRole).toBe('header')
	expect(view.props.accessibilityLabel).toBe('Compra, 3353.39 CUP, Completada')
})
