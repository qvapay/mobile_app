/**
 * Render tests for the "Abre en tu wallet" deposit picker — node environment
 * with theme, icons and the wallet deeplink helper mocked
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../helpers/walletDeeplinks', () => ({ openInWallet: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { openInWallet } from '../helpers/walletDeeplinks'
import WalletPickerSheet from './WalletPickerSheet'

const WALLETS = [
	{ id: 'trust', name: 'Trust Wallet' },
	{ id: 'metamask', name: 'MetaMask' },
]

const CTX = { address: 'TXyz123', amount: '25.00', coin: 'TRX' }

const renderSheet = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<WalletPickerSheet
				visible
				wallets={WALLETS}
				ctx={CTX}
				onClose={jest.fn()}
				onOpened={jest.fn()}
				{...props}
			/>
		)
	})
	return tree
}

// Wallet rows are the only pressables styled with a pressed-state function
const walletRows = (tree) =>
	tree.root.findAll(n => typeof n.props.onPress === 'function' && typeof n.props.style === 'function')

beforeEach(() => {
	jest.clearAllMocks()
	openInWallet.mockResolvedValue(true)
})

test('lists every detected wallet by name', () => {
	const tree = renderSheet()
	const out = JSON.stringify(tree.toJSON())
	expect(out).toContain('Abre en tu wallet')
	expect(out).toContain('Trust Wallet')
	expect(out).toContain('MetaMask')
	expect(walletRows(tree)).toHaveLength(2)
})

test('shows the empty state when no compatible wallet was detected', () => {
	const tree = renderSheet({ wallets: [] })
	expect(JSON.stringify(tree.toJSON())).toContain('No detectamos ninguna wallet instalada')
	expect(walletRows(tree)).toHaveLength(0)
})

test('picking a wallet launches it with the deposit context, closes and reports', async () => {
	const onClose = jest.fn()
	const onOpened = jest.fn()
	const tree = renderSheet({ onClose, onOpened })
	await act(async () => { walletRows(tree)[1].props.onPress() })
	expect(openInWallet).toHaveBeenCalledWith(WALLETS[1], CTX)
	expect(onClose).toHaveBeenCalled()
	expect(onOpened).toHaveBeenCalledWith(WALLETS[1], true)
})

test('a failed launch still closes but reports ok=false', async () => {
	openInWallet.mockResolvedValue(false)
	const onOpened = jest.fn()
	const tree = renderSheet({ onOpened })
	await act(async () => { walletRows(tree)[0].props.onPress() })
	expect(onOpened).toHaveBeenCalledWith(WALLETS[0], false)
})

test('the memo warning strip only renders when the coin requires a memo', () => {
	expect(JSON.stringify(renderSheet().toJSON())).not.toContain('memo')
	const withMemo = renderSheet({ ctx: { ...CTX, memo: '12345' } })
	expect(JSON.stringify(withMemo.toJSON())).toContain('Verifica que el memo se haya copiado')
})

test('backdrop tap and the Android back button both dismiss', () => {
	const onClose = jest.fn()
	const tree = renderSheet({ onClose })
	const backdrop = tree.root.findAll(n => typeof n.props.onPress === 'function')[0]
	act(() => { backdrop.props.onPress() })
	act(() => { tree.root.findByProps({ transparent: true }).props.onRequestClose() })
	expect(onClose).toHaveBeenCalledTimes(2)
})
