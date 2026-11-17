/**
 * Render tests del campo de monto de una oferta por rango: lo comparten la
 * pantalla (input a la vista) y el modal de confirmación, así que aquí se fija
 * que el motivo del rechazo, la contrapartida y la garantía salgan de las
 * mismas reglas puras de `p2pFlexible`.
 * @jest-environment node
 */
jest.mock('../../ui/particles/QPInput', () => 'QPInput')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
import { createTextStyles } from '../../theme/themeUtils'
import P2PFlexibleTakeForm from './P2PFlexibleTakeForm'

const theme = createTheme(true)
const textStyles = createTextStyles(theme)

const SELL = {
	uuid: 'offer-1',
	type: 'sell',
	offer_kind: 'flexible',
	amount: '10.00',
	receive: '5000',
	available_amount: '10.00',
	order_min: '2.00',
	order_max: '10.00',
	Coin: { name: 'QUSD' },
}

const render = ({ offer = SELL, ...props } = {}) => {
	let tree
	act(() => {
		tree = create(
			<P2PFlexibleTakeForm
				offer={offer}
				amount=""
				setAmount={jest.fn()}
				balance={100}
				theme={theme}
				textStyles={textStyles}
				{...props}
			/>
		)
	})
	return tree
}

const text = (tree) => JSON.stringify(tree.toJSON())
const byTestId = (tree, id) => tree.root.findAll(n => n.props.testID === id)

test('el hint enseña el rango que se puede tomar', () => {
	expect(text(render({ hint: true }))).toContain('Indica cuánto quieres tomar, entre $2.00 y $10.00.')
	expect(text(render({ hint: false }))).not.toContain('Indica cuánto quieres tomar')
})

test('vacío no regaña: ni motivo ni contrapartida', () => {
	const tree = render()
	expect(byTestId(tree, 'p2p-flexible-amount-error')).toHaveLength(0)
	expect(byTestId(tree, 'p2p-flexible-quote')).toHaveLength(0)
})

test.each([
	['1', 'El mínimo por orden es $2.00'],
	['11', 'El máximo que puedes tomar es $10.00'],
	['1.234', 'Monto inválido: usa hasta 2 decimales'],
])('un monto fuera de rango (%s) explica por qué', (amount, copy) => {
	const tree = render({ amount })
	expect(byTestId(tree, 'p2p-flexible-amount-error')[0].props.children).toBe(copy)
	expect(byTestId(tree, 'p2p-flexible-quote')).toHaveLength(0)
})

test('en una oferta de venta dice cuánto se envía a la tasa de la oferta', () => {
	const out = text(render({ amount: '5' }))
	expect(out).toContain('Enviarás 2500 QUSD')
	expect(out).not.toContain('garantía')
})

test('en una oferta de compra dice cuánto se recibe y avisa de la garantía', () => {
	const tree = render({ offer: { ...SELL, type: 'buy' }, amount: '5', balance: 100 })
	expect(text(tree)).toContain('Recibirás 2500 QUSD')
	expect(text(tree)).toContain('Saldo: $100.00')
})

test('en una oferta de compra el monto sale del saldo: sin saldo, no vale', () => {
	const tree = render({ offer: { ...SELL, type: 'buy' }, amount: '5', balance: 3 })
	expect(byTestId(tree, 'p2p-flexible-amount-error')[0].props.children).toBe('Saldo insuficiente')
})

test('lo tecleado se sanea a punto decimal antes de subir al estado', () => {
	const setAmount = jest.fn()
	const tree = render({ setAmount })
	tree.root.findByType('QPInput').props.onChangeText('7,5x')
	expect(setAmount).toHaveBeenCalledWith('7.5')
})
