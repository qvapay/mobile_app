/**
 * Selector de método: fuera de Brasil no pinta nada, y con PIX elegido los avisos están antes de
 * pagar. El aviso del IOF va en portugués en todos los idiomas.
 * @jest-environment node
 */
jest.mock('../../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = require('../../../theme/themeTokens')
	const theme = createTheme(true)
	return { useTheme: () => ({ theme }) }
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import PixMethodPicker from './PixMethodPicker'

const QUOTE = { totalUsd: 10.4, totalBrl: 57.78 }
const pixState = (over) => ({
	offer: { kind: 'ready', quote: QUOTE },
	selected: false,
	starting: false,
	estimate: false,
	holdHours: 72,
	payLabel: '',
	choose: jest.fn(),
	openCpf: jest.fn(),
	openGold: jest.fn(),
	pay: jest.fn(),
	...over,
})

const render = (pix) => {
	let tree
	act(() => { tree = create(<PixMethodPicker pix={pix} balance={12} />) })
	return tree
}
const text = (tree) => JSON.stringify(tree.toJSON())
const row = (tree, testID) => tree.root.findAll(node => node.type === 'QPPressable' && node.props.testID === testID)[0]

test('oculta: no pinta absolutamente nada', () => {
	expect(render(pixState({ offer: { kind: 'hidden' } })).toJSON()).toBeNull()
})

test('sin CPF es una sola fila que lleva a verificarlo, sin precio', () => {
	const pix = pixState({ offer: { kind: 'cpf' } })
	const tree = render(pix)
	expect(text(tree)).toContain('¿Pagar con PIX?')
	expect(text(tree)).not.toContain('R$')
	act(() => { row(tree, 'pix-method-cpf').props.onPress() })
	expect(pix.openCpf).toHaveBeenCalled()
})

test('sin GOLD la misma fila lleva a comprarlo y dice por qué', () => {
	const pix = pixState({ offer: { kind: 'gold' } })
	const tree = render(pix)
	expect(text(tree)).toContain('Hazte GOLD para verificar tu CPF')
	act(() => { row(tree, 'pix-method-gold').props.onPress() })
	expect(pix.openGold).toHaveBeenCalled()
	expect(pix.openCpf).not.toHaveBeenCalled()
})

test('lista: saldo y PIX con su precio, y sin avisos hasta elegirlo', () => {
	const pix = pixState()
	const tree = render(pix)
	expect(text(tree)).toContain('$')
	expect(text(tree)).toContain('R$ 57,78')
	expect(text(tree)).not.toContain('IOF')
	expect(row(tree, 'pix-method-balance').props.accessibilityState).toEqual({ selected: true })
	act(() => { row(tree, 'pix-method-pix').props.onPress() })
	expect(pix.choose).toHaveBeenCalledWith(true)
})

test('con PIX elegido salen la retención y el aviso legal literal', () => {
	const tree = render(pixState({ selected: true }))
	expect(text(tree)).toContain('puede tardar hasta 72 h')
	expect(text(tree)).toContain('Esta é uma compra internacional e não inclui a tarifa de 3.5% de IOF.')
	expect(text(tree)).toContain('termos e condições do Ebanx')
})

test('un precio sin el envío se marca como estimado y lo dice', () => {
	const tree = render(pixState({ selected: true, estimate: true }))
	expect(text(tree)).toContain('≈ R$ 57,78')
	expect(text(tree)).toContain('se suma al generar el QR')
})
