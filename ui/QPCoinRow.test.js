/**
 * Render tests for the presentational coin row (logo, network badge, min/fee,
 * price and approximation) — node environment with theme and QPCoin mocked
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('./particles/QPCoin', () => 'QPCoin')

import React from 'react'
import { act, create } from 'react-test-renderer'
import QPCoinRow from './QPCoinRow'

const COIN = {
	name: 'Tron',
	logo: 'trx',
	network: 'TRC20',
	price: '0.5',
	fee_in: 1,
	fee_out: 2.5,
	min_in: 5,
	min_out: 10,
}

const renderRow = (props = {}) => {
	let tree
	act(() => { tree = create(<QPCoinRow coin={COIN} {...props} />) })
	return tree
}

const textOf = (tree) => JSON.stringify(tree.toJSON())

test('shows name, network badge and the in-direction stats by default', () => {
	const out = textOf(renderRow())
	expect(out).toContain('Tron')
	expect(out).toContain('TRC20')
	expect(out).toContain('"$","5"') // min_in
	expect(out).toContain('"1","%"') // fee_in
	expect(out).toContain('Min In')
	expect(out).toContain('Fee In')
	expect(out).toContain('0.5000') // price with 4 decimals
})

test('direction="out" switches to the out fees and minimums', () => {
	const out = textOf(renderRow({ direction: 'out' }))
	expect(out).toContain('"$","10"')
	expect(out).toContain('"2.5","%"')
	expect(out).toContain('Min Out')
	expect(out).toContain('Fee Out')
})

test('an entered amount renders the approximate coin quantity', () => {
	const out = textOf(renderRow({ amount: '10' }))
	expect(out).toContain('20.00000') // 10 / 0.5
	expect(out).toContain('Aprox.')
})

test('without an amount the approximation column shows an em dash', () => {
	expect(textOf(renderRow())).toContain('—')
})

test('showFees=false leaves only the price column', () => {
	const out = textOf(renderRow({ showFees: false, amount: '10' }))
	expect(out).toContain('Precio')
	expect(out).not.toContain('Min In')
	expect(out).not.toContain('Fee In')
	expect(out).not.toContain('Aprox.')
})

test('the network badge is skipped for coins without a network', () => {
	let tree
	act(() => { tree = create(<QPCoinRow coin={{ ...COIN, network: null }} />) })
	expect(textOf(tree)).not.toContain('TRC20')
})
