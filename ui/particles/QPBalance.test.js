/**
 * Render tests for QPBalance — theme comes in as a prop, so no mocks needed.
 * @jest-environment node
 */
import { Text } from 'react-native'
import { act, create } from 'react-test-renderer'

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
