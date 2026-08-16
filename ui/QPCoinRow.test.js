/**
 * Render tests de la fila de moneda del selector: identidad a la izquierda
 * (logo, nombre, red y condiciones en una línea) y a la derecha el número que
 * decide — cuánto recibes — con el precio unitario debajo.
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
import { formatCoinAmount, formatCoinPrice } from '../helpers/coinFormat'

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

// React trocea el texto interpolado en varios children
const flat = (node) => {
	if (node == null || node === false) return ''
	if (typeof node === 'string' || typeof node === 'number') return String(node)
	if (Array.isArray(node)) return node.map(flat).join('')
	return flat(node.children)
}
const textOf = (tree) => flat(tree.toJSON())

describe('identidad', () => {
	test('muestra el logo, el nombre y la red', () => {
		const tree = renderRow()
		expect(tree.root.findByType('QPCoin').props.coin).toBe('trx')
		const out = textOf(tree)
		expect(out).toContain('Tron')
		expect(out).toContain('TRC20')
	})

	test('sin red no se pinta el badge', () => {
		let tree
		act(() => { tree = create(<QPCoinRow coin={{ ...COIN, network: null }} />) })
		expect(textOf(tree)).not.toContain('TRC20')
	})
})

describe('condiciones', () => {
	test('comisión y mínimo van en una sola línea legible, en español', () => {
		const out = textOf(renderRow())
		expect(out).toContain('1% comisión')
		expect(out).toContain('mín. $5')
		// Nada de jerga de API en la interfaz
		expect(out).not.toContain('Fee In')
		expect(out).not.toContain('Min In')
	})

	test('direction="out" usa la comisión y el mínimo de salida', () => {
		const out = textOf(renderRow({ direction: 'out' }))
		expect(out).toContain('2.5% comisión')
		expect(out).toContain('mín. $10')
	})

	test('una moneda sin comisión ni mínimo no muestra línea de condiciones', () => {
		let tree
		act(() => { tree = create(<QPCoinRow coin={{ ...COIN, fee_in: 0, min_in: 0 }} />) })
		expect(textOf(tree)).not.toContain('comisión')
	})

	test('showFees=false deja solo la identidad (modo P2P)', () => {
		const out = textOf(renderRow({ showFees: false, amount: '100' }))
		expect(out).toContain('Tron')
		expect(out).not.toContain('comisión')
		expect(out).not.toContain('$')
	})
})

describe('conversión y precio', () => {
	test('con importe muestra cuánto recibes', () => {
		// 100 / 0.5 = 200
		expect(textOf(renderRow({ amount: '100' }))).toContain('200')
	})

	test('sin importe no se inventa una cifra', () => {
		const out = textOf(renderRow())
		expect(out).toContain('$0.5') // el precio unitario sí
		expect(out).not.toContain('Aprox')
	})

	test('el precio se oculta cuando la moneda va 1:1 con el dólar (raíles fiat)', () => {
		let tree
		act(() => { tree = create(<QPCoinRow coin={{ ...COIN, name: 'Banco CUP', network: null, price: '1' }} />) })
		const out = textOf(tree)
		expect(out).toContain('Banco CUP')
		expect(out).not.toContain('$1')
	})
})

describe('formato de cifras', () => {
	test('los decimales se adaptan a la magnitud', () => {
		expect(formatCoinAmount(0.00084123)).toBe('0.00084123')
		expect(formatCoinAmount(0.0123456)).toBe('0.012346')
		expect(formatCoinAmount(12.5)).toBe('12.5')
		expect(formatCoinAmount(1234.567)).toBe('1,234.57')
		expect(formatCoinAmount(0)).toBe('0')
	})

	test('el precio no arrastra cuatro decimales en cifras grandes', () => {
		expect(formatCoinPrice(118432.55)).toBe('$118,433')
		expect(formatCoinPrice(2.5)).toBe('$2.50')
		expect(formatCoinPrice(0.0842)).toBe('$0.0842')
		expect(formatCoinPrice(0)).toBe(null)
	})
})
