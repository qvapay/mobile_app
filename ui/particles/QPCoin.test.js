/**
 * Render tests for QPCoin — CDN SVG with AsyncStorage cache, SvgUri stopgap
 * while the first fetch is in flight, and a lettered placeholder on failure.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-async-storage/async-storage', () => ({
	__esModule: true,
	default: { getItem: jest.fn(), setItem: jest.fn() },
}))
jest.mock('react-native-svg', () => ({ __esModule: true, SvgXml: 'SvgXml', SvgUri: 'SvgUri' }))

import { StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import QPCoin from './QPCoin'

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPCoin {...props} />) })
	return tree
}

beforeEach(() => {
	AsyncStorage.getItem.mockReset().mockResolvedValue(null)
	AsyncStorage.setItem.mockReset().mockResolvedValue()
	global.fetch = jest.fn(() => new Promise(() => {})) // in flight forever by default
})

describe('QPCoin', () => {

	test('without a coin renders the "?" placeholder and never touches the network', async () => {
		const tree = await render({})
		expect(JSON.stringify(tree.toJSON())).toContain('"?"')
		expect(global.fetch).not.toHaveBeenCalled()
	})

	test('a cache hit renders the stored SVG XML and skips the fetch', async () => {
		AsyncStorage.getItem.mockResolvedValue('<svg>cached-btc</svg>')
		const tree = await render({ coin: 'BTC' })
		expect(AsyncStorage.getItem).toHaveBeenCalledWith('svg_cache_btc')
		expect(tree.root.findByType('SvgXml').props.xml).toBe('<svg>cached-btc</svg>')
		expect(global.fetch).not.toHaveBeenCalled()
	})

	test('a cache miss fetches the SVG, renders it and stores it', async () => {
		global.fetch = jest.fn().mockResolvedValue({ text: async () => '<svg>fresh</svg>' })
		const tree = await render({ coin: 'TRX' })
		expect(global.fetch).toHaveBeenCalledWith('https://media.qvapay.com/coins/trx.svg')
		expect(tree.root.findByType('SvgXml').props.xml).toBe('<svg>fresh</svg>')
		expect(AsyncStorage.setItem).toHaveBeenCalledWith('svg_cache_trx', '<svg>fresh</svg>')
	})

	test('while the first fetch is in flight, SvgUri streams the same URL as a stopgap', async () => {
		const tree = await render({ coin: 'ETH' })
		const uri = tree.root.findByType('SvgUri')
		expect(uri.props.uri).toBe('https://media.qvapay.com/coins/eth.svg')
	})

	test('a payload without an <svg> tag degrades to the lettered placeholder', async () => {
		global.fetch = jest.fn().mockResolvedValue({ text: async () => 'Not Found' })
		const tree = await render({ coin: 'usdtbsc' })
		expect(JSON.stringify(tree.toJSON())).toContain('"USD"')
		expect(AsyncStorage.setItem).not.toHaveBeenCalled()
	})

	test('a network error also falls back to the first 3 letters, sized to the coin', async () => {
		global.fetch = jest.fn().mockRejectedValue(new Error('offline'))
		const tree = await render({ coin: 'BANK_MLC', size: 40 })
		expect(JSON.stringify(tree.toJSON())).toContain('"BAN"')
		expect(StyleSheet.flatten(tree.toJSON().props.style)).toMatchObject({ width: 40, height: 40 })
	})
})
