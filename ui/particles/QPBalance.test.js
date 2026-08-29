/**
 * Render tests for QPBalance — theme comes in as a prop, so no mocks needed.
 * NumberFlow se stubea como string: aquí se verifica el CONTRATO que recibe
 * (valor absoluto, locale, decimales, modo continuo), no su animación.
 * @jest-environment node
 */
import { Text } from 'react-native'
import { act, create } from 'react-test-renderer'

jest.mock('number-flow-react-native', () => ({ NumberFlow: 'NumberFlow' }))

import QPBalance from './QPBalance'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPBalance theme={theme} fontSize={50} {...props} />) })
	return tree
}

describe('QPBalance', () => {

	test('renders the symbol and the amount for a positive balance', async () => {
		const tree = await render({ formattedAmount: '1,234.56' })
		const texts = tree.root.findAllByType(Text).map(t => t.props.children)
		expect(texts).toContain('$')
		expect(texts).toContain('1,234.56')
	})

	test('moves the minus sign before the symbol for negative balances', async () => {
		const tree = await render({ formattedAmount: '-12.50' })
		const texts = tree.root.findAllByType(Text).map(t => t.props.children)
		expect(texts).toContain('-$')
		expect(texts).toContain('12.50')
		expect(texts).not.toContain('-12.50')
	})

	test('uses the danger color when negative and primary text color when positive', async () => {
		const negative = await render({ formattedAmount: '-5.00' })
		const [negSymbol, negAmount] = negative.root.findAllByType(Text)
		expect(negSymbol.props.style[1].color).toBe(theme.colors.danger)
		expect(negAmount.props.style[1].color).toBe(theme.colors.danger)

		const positive = await render({ formattedAmount: '5.00' })
		const [posSymbol, posAmount] = positive.root.findAllByType(Text)
		expect(posSymbol.props.style[1].color).toBe(theme.colors.secondaryText)
		expect(posAmount.props.style[1].color).toBe(theme.colors.primaryText)
	})

	test('exposes the signed amount through the accessibility label', async () => {
		const tree = await render({ formattedAmount: '-12.50' })
		const amount = tree.root.findAllByType(Text)[1]
		expect(amount.props.accessibilityLabel).toBe('Amount: -$12.50')
	})
})

describe('QPBalance con importe crudo', () => {

	test('formatea con el locale activo (es) y pasa el valor a NumberFlow', async () => {
		const tree = await render({ amount: 1234.56 })
		const flow = tree.root.findByType('NumberFlow')
		expect(flow.props.value).toBe(1234.56)
		expect(flow.props.locales).toBe('es-ES')
		expect(flow.props.continuous).toBe(true)
		expect(flow.props.format).toEqual({ minimumFractionDigits: 2, maximumFractionDigits: 2 })
	})

	test('el signo sale fuera: NumberFlow recibe el valor absoluto y todo va en danger', async () => {
		const tree = await render({ amount: -12.5 })
		const flow = tree.root.findByType('NumberFlow')
		expect(flow.props.value).toBe(12.5)
		expect(flow.props.style.color).toBe(theme.colors.danger)
		expect(tree.root.findAllByType(Text).map(t => t.props.children)).toContain('-$')
	})

	test('fractionDigits configura los decimales (cripto por debajo de $1)', async () => {
		const tree = await render({ amount: 0.1234, fractionDigits: 4 })
		expect(tree.root.findByType('NumberFlow').props.format).toEqual({ minimumFractionDigits: 4, maximumFractionDigits: 4 })
	})

	test('encoge la fuente solo con números largos: el auto-shrink nativo no aplica al partir los dígitos', async () => {
		const normal = await render({ amount: 1234.56 })
		const largo = await render({ amount: 12345678.9 })
		expect(normal.root.findByType('NumberFlow').props.style.fontSize).toBe(50)
		expect(largo.root.findByType('NumberFlow').props.style.fontSize).toBeLessThan(50)
	})

	test('animated=false pinta un Text plano con el MISMO formato (scrubbing)', async () => {
		const tree = await render({ amount: 1234.56, animated: false })
		expect(tree.root.findAllByType('NumberFlow')).toHaveLength(0)
		const texts = tree.root.findAllByType(Text).map(t => t.props.children)
		expect(texts).toContain('$')
		expect(texts).toContain('1234,56')
	})

	test('la figura se lee como UNA sola cosa pese a ir partida en varios elementos', async () => {
		const tree = await render({ amount: -12.5 })
		const container = tree.root.findByProps({ accessibilityRole: 'text', accessible: true })
		expect(container.props.accessibilityLabel).toBe('Amount: -$12,50')
	})
})
