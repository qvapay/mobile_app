/**
 * Render tests for the full-screen coin picker modal (search, quick pills,
 * recents in AsyncStorage) — node environment with theme, safe-area, storage
 * and child particles mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }))
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
}))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPCoin', () => 'QPCoin')
jest.mock('./particles/QPInput', () => 'QPInput')
jest.mock('./QPCoinRow', () => 'QPCoinRow')

import React from 'react'
import { act, create } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import QPCoinPicker from './QPCoinPicker'

const COINS = [
	{ id: 1, tick: 'BTC', name: 'Bitcoin', logo: 'btc', price: '60000' },
	{ id: 2, tick: 'TRX', name: 'Tron', logo: 'trx', price: '0.1' },
	{ id: 3, tick: 'USDTTRC20', name: 'USDT (TRC20)', logo: 'usdt', price: '1' },
]

const renderPicker = async (props = {}) => {
	let tree
	await act(async () => {
		tree = create(
			<QPCoinPicker
				visible
				onClose={jest.fn()}
				onSelect={jest.fn()}
				coins={COINS}
				{...props}
			/>
		)
	})
	return tree
}

const pressables = (tree) => tree.root.findAll(n => typeof n.props.onPress === 'function')
const coinRowPressables = (tree) => pressables(tree).filter(n => n.findAllByType('QPCoinRow').length > 0)
const pillPressables = (tree) => pressables(tree).filter(n => n.findAllByType('QPCoin').length > 0 && n.findAllByType('QPCoinRow').length === 0)

beforeEach(() => {
	jest.clearAllMocks()
	AsyncStorage.getItem.mockResolvedValue(null)
})

test('renders one row per coin forwarding amount, direction and showFees', async () => {
	const tree = await renderPicker({ amount: '25', direction: 'in', showFees: false })
	const rows = tree.root.findAllByType('QPCoinRow')
	expect(rows.map(r => r.props.coin.tick)).toEqual(['BTC', 'TRX', 'USDTTRC20'])
	expect(rows[0].props.amount).toBe('25')
	expect(rows[0].props.direction).toBe('in')
	expect(rows[0].props.showFees).toBe(false)
})

test('shows the loading and empty states', async () => {
	const loading = await renderPicker({ isLoading: true })
	expect(JSON.stringify(loading.toJSON())).toContain('Cargando monedas...')
	const empty = await renderPicker({ coins: [] })
	expect(JSON.stringify(empty.toJSON())).toContain('No hay monedas disponibles')
})

test('the header search toggle reveals an input that filters by name or tick', async () => {
	const tree = await renderPicker()
	expect(tree.root.findAllByType('QPInput')).toHaveLength(0)
	act(() => { pressables(tree)[0].props.onPress() }) // magnifying glass
	const input = tree.root.findByType('QPInput')
	act(() => { input.props.onChangeText('tron') })
	expect(tree.root.findAllByType('QPCoinRow').map(r => r.props.coin.tick)).toEqual(['TRX'])
	act(() => { input.props.onChangeText('usdt') })
	expect(tree.root.findAllByType('QPCoinRow').map(r => r.props.coin.tick)).toEqual(['USDTTRC20'])
})

test('selecting a coin row reports the coin and records it as recent', async () => {
	const onSelect = jest.fn()
	const tree = await renderPicker({ onSelect, recentKey: 'recent_coins' })
	await act(async () => { coinRowPressables(tree)[1].props.onPress() })
	expect(onSelect).toHaveBeenCalledWith(COINS[1])
	expect(AsyncStorage.setItem).toHaveBeenCalledWith('recent_coins', JSON.stringify(['TRX']))
})

test('quick pills pad the persisted recents with the default coins', async () => {
	AsyncStorage.getItem.mockResolvedValue(JSON.stringify(['TRX']))
	const tree = await renderPicker({
		recentKey: 'recent_coins',
		defaultCoins: [{ tick: 'BTC', label: 'Bitcoin' }, { tick: 'TRX', label: 'Tron' }],
	})
	const pills = pillPressables(tree)
	expect(pills).toHaveLength(2) // recent TRX first, BTC default, TRX not duplicated
	expect(pills[0].findByType('QPCoin').props.coin).toBe('trx')
	expect(tree.root.findAllByType('QPCoinRow')).toHaveLength(3) // sanity: list still full
})

test('tapping a quick pill selects its coin', async () => {
	const onSelect = jest.fn()
	const tree = await renderPicker({ onSelect, defaultCoins: [{ tick: 'BTC', label: 'Bitcoin' }] })
	const pills = pillPressables(tree)
	expect(pills).toHaveLength(1)
	await act(async () => { pills[0].props.onPress() })
	expect(onSelect).toHaveBeenCalledWith(COINS[0])
})

test('the close button and the sheet dismissal both call onClose', async () => {
	const onClose = jest.fn()
	const tree = await renderPicker({ onClose })
	act(() => { pressables(tree)[1].props.onPress() }) // xmark
	const modal = tree.root.findByProps({ presentationStyle: 'pageSheet' })
	act(() => { modal.props.onRequestClose() })
	expect(onClose).toHaveBeenCalledTimes(2)
})
