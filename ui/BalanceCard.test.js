/**
 * Render tests for the Home balance hero (paged main/savings balance) — node
 * environment with theme, settings and savingApi mocked
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../settings/SettingsContext', () => ({ useSettings: jest.fn() }))
jest.mock('../api/savingApi', () => ({ savingApi: { getSummary: jest.fn() } }))
jest.mock('../helpers/dataCache', () => ({
	CACHE_KEYS: { SAVINGS_SUMMARY: 'savings_summary' },
	readCache: jest.fn(async () => null),
	writeCache: jest.fn(),
}))
jest.mock('./particles/QPBalance', () => 'QPBalance')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useSettings } from '../settings/SettingsContext'
import { savingApi } from '../api/savingApi'
import BalanceCard from './BalanceCard'

const getSetting = jest.fn()
const updateSetting = jest.fn()

const renderCard = async (props = {}) => {
	let tree
	await act(async () => {
		tree = create(<BalanceCard balance={props.balance ?? '123.45'} navigation={props.navigation} />)
	})
	return tree
}

const pages = (tree) => tree.root.findAll(node => typeof node.props.onPress === 'function')

beforeEach(() => {
	jest.clearAllMocks()
	getSetting.mockReturnValue(true)
	updateSetting.mockResolvedValue({ success: true })
	useSettings.mockReturnValue({ getSetting, updateSetting })
	savingApi.getSummary.mockResolvedValue({ success: true, data: { balance: 50, rate: 4.2 } })
})

test('shows the main balance and the fetched savings balance with its APY', async () => {
	const tree = await renderCard()
	const balances = tree.root.findAllByType('QPBalance')
	expect(balances[0].props.formattedAmount).toBe('123.45')
	expect(balances[1].props.formattedAmount).toBe('50.00')
	expect(JSON.stringify(tree.toJSON())).toContain('"4.2"') // rendered next to the % sign
})

test('keeps the default 3.75% APY when the summary brings no rate', async () => {
	savingApi.getSummary.mockResolvedValue({ success: true, data: { balance: 10 } })
	const tree = await renderCard()
	expect(JSON.stringify(tree.toJSON())).toContain('"3.75"')
})

test('respects the persisted privacy.showBalance=false with length-matched asterisks', async () => {
	getSetting.mockReturnValue(false)
	const tree = await renderCard({ balance: '1234.56' })
	expect(tree.root.findAllByType('QPBalance')).toHaveLength(0)
	expect(JSON.stringify(tree.toJSON())).toContain('*'.repeat(7))
})

test('tapping the main balance toggles visibility and persists it', async () => {
	const tree = await renderCard()
	await act(async () => { pages(tree)[0].props.onPress() })
	expect(tree.root.findAllByType('QPBalance')).toHaveLength(0) // hidden now
	expect(updateSetting).toHaveBeenCalledWith('privacy', 'showBalance', false)
})

test('tapping the savings page navigates to the Savings screen', async () => {
	const navigation = { navigate: jest.fn() }
	const tree = await renderCard({ navigation })
	await act(async () => { pages(tree)[1].props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith('Savings')
})

test('a failed savings fetch leaves the card rendering with defaults', async () => {
	savingApi.getSummary.mockResolvedValue({ success: false, error: 'x' })
	const tree = await renderCard()
	const balances = tree.root.findAllByType('QPBalance')
	expect(balances[1].props.formattedAmount).toBe('0.00')
})
