/**
 * Render tests for QPTransaction — sign/color by payer, smart description
 * fallbacks, sticker descriptions and the privacy showBalance setting.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../settings/SettingsContext', () => ({ useSettings: jest.fn() }))
jest.mock('./QPCoin', () => 'QPCoin')
jest.mock('./QPAvatar', () => 'QPAvatar')
jest.mock('./TransactionSticker', () => 'TransactionSticker')

// helpers.js drags in untransformed ESM deps — stub them out
jest.mock('sonner-native', () => ({ toast: jest.fn() }))
jest.mock('@react-native-clipboard/clipboard', () => ({ __esModule: true, default: { setString: jest.fn() } }))
jest.mock('react-native-haptic-feedback', () => ({ __esModule: true, default: { trigger: jest.fn() } }))

import { Pressable, Text, StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPTransaction from './QPTransaction'
import { useAuth } from '../../auth/AuthContext'
import { useSettings } from '../../settings/SettingsContext'
import { createTheme } from '../../theme/ThemeContext'
import { ROUTES } from '../../routes'

const theme = createTheme(true)

// Pressable is a React.memo — findByType needs the inner component
const PressableType = Pressable.type || Pressable

const ME = { uuid: 'me-uuid', username: 'erich' }
const PEER = { uuid: 'peer-uuid', username: 'napoles' }

const baseTransaction = (overrides = {}) => ({
	uuid: 'tx-1',
	amount: '10.5',
	description: '',
	User: PEER,
	PaidBy: ME,
	updated_at: new Date().toISOString(),
	...overrides,
})

beforeEach(() => {
	useAuth.mockReturnValue({ user: ME })
	useSettings.mockReturnValue({ getSetting: (category, key, fallback) => fallback })
})

const render = async (transaction, props = {}) => {
	let tree
	const navigation = { navigate: jest.fn() }
	await act(async () => {
		tree = create(<QPTransaction transaction={transaction} navigation={navigation} {...props} />)
	})
	return { tree, navigation }
}

const amountText = (tree) =>
	tree.root.findAllByType(Text).find(t => /^[-+*]/.test(String(t.props.children)))

describe('QPTransaction', () => {

	test('paid by me renders a red negative amount and the Envío fallback label', async () => {
		const { tree } = await render(baseTransaction())
		const amount = amountText(tree)
		expect(amount.props.children).toBe('-10.50')
		expect(StyleSheet.flatten(amount.props.style).color).toBe(theme.colors.danger)
		expect(JSON.stringify(tree.toJSON())).toContain('Envío a @napoles')
	})

	test('received renders a green positive amount and the Pago fallback label', async () => {
		const { tree } = await render(baseTransaction({ PaidBy: PEER }))
		const amount = amountText(tree)
		expect(amount.props.children).toBe('+10.50')
		expect(StyleSheet.flatten(amount.props.style).color).toBe(theme.colors.successText)
		expect(JSON.stringify(tree.toJSON())).toContain('Pago de @napoles')
	})

	test('honors the privacy showBalance setting with ***', async () => {
		useSettings.mockReturnValue({ getSetting: () => false })
		const { tree } = await render(baseTransaction())
		expect(amountText(tree).props.children).toBe('***')
	})

	test('a wallet deposit shows the coin logo and the Depósito label', async () => {
		const { tree } = await render(baseTransaction({ PaidBy: PEER, Wallet: { Coin: { tick: 'BTC' } } }))
		expect(tree.root.findByType('QPCoin').props.coin).toBe('BTC')
		expect(tree.root.findAllByType('QPAvatar')).toHaveLength(0)
		expect(JSON.stringify(tree.toJSON())).toContain('Depósito BTC')
	})

	test('a withdraw shows the payment method and the Extracción label', async () => {
		const { tree } = await render(baseTransaction({ Withdraw: { payment_method: 'BANK_MLC' } }))
		expect(tree.root.findByType('QPCoin').props.coin).toBe('BANK_MLC')
		expect(JSON.stringify(tree.toJSON())).toContain('Extracción BANK_MLC')
	})

	test('a :sticker: description renders the animated chip with a directional @user label', async () => {
		const { tree } = await render(baseTransaction({ description: ':sticker:lol.webm' }))
		expect(tree.root.findByType('TransactionSticker').props.name).toBe('lol.webm')
		expect(JSON.stringify(tree.toJSON())).toContain('→ @napoles')
		const received = await render(baseTransaction({ description: ':sticker:lol.webm', PaidBy: PEER }))
		expect(JSON.stringify(received.tree.toJSON())).toContain('← @napoles')
	})

	test('an unknown sticker name degrades to plain truncated text', async () => {
		const { tree } = await render(baseTransaction({ description: ':sticker:notreal.webm' }))
		expect(tree.root.findAllByType('TransactionSticker')).toHaveLength(0)
		// reduceString clamps the description to its first 16 characters
		expect(JSON.stringify(tree.toJSON())).toContain(':sticker:notreal'.substring(0, 16))
	})

	test('long text descriptions are clamped to 16 characters', async () => {
		const { tree } = await render(baseTransaction({ description: 'Pago de servicios de streaming' }))
		expect(JSON.stringify(tree.toJSON())).toContain('"Pago de servicio"')
	})

	test('pressing the row navigates to the Transaction detail', async () => {
		const transaction = baseTransaction()
		const { tree, navigation } = await render(transaction)
		await act(async () => { tree.root.findByType(PressableType).props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.TRANSACTION, { transaction })
	})

	test('only the group edges get rounded corners so rows read as one card', async () => {
		const tx = baseTransaction()
		const first = await render(tx, { index: 0, totalItems: 3 })
		const firstStyle = StyleSheet.flatten(first.tree.root.findByType(PressableType).props.children.props.style)
		expect(firstStyle.borderTopLeftRadius).toBe(10)
		expect(firstStyle.borderBottomLeftRadius).toBe(0)
		const middle = await render(tx, { index: 1, totalItems: 3 })
		const middleStyle = StyleSheet.flatten(middle.tree.root.findByType(PressableType).props.children.props.style)
		expect(middleStyle.borderTopLeftRadius).toBe(0)
		expect(middleStyle.borderBottomLeftRadius).toBe(0)
		const last = await render(tx, { index: 2, totalItems: 3 })
		const lastStyle = StyleSheet.flatten(last.tree.root.findByType(PressableType).props.children.props.style)
		expect(lastStyle.borderBottomLeftRadius).toBe(10)
		expect(lastStyle.marginBottom).toBe(10)
	})
})
