/**
 * Unit tests for the external-wallet deep link registry — node environment
 * with react-native's Linking mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	Linking: { canOpenURL: jest.fn(), openURL: jest.fn() },
}))

import { Linking } from 'react-native'
import { detectInstalledWallets, openInWallet } from './walletDeeplinks'

// Resolve the registry entries for a coin by pretending every wallet is installed.
const walletsFor = async (coin, network) => {
	Linking.canOpenURL.mockResolvedValue(true)
	return detectInstalledWallets(coin, network)
}

beforeEach(() => { jest.clearAllMocks() })

describe('detectInstalledWallets', () => {
	test('BTC matches the bitcoin-capable wallets only', async () => {
		const ids = (await walletsFor('BTC')).map(w => w.id)
		expect(ids.sort()).toEqual(['bluewallet', 'coinbase', 'muun', 'trust'])
	})

	test('USDT on TRC20 matches wallets declaring the bare ticker or the combined tick', async () => {
		const ids = (await walletsFor('USDT', 'TRC20')).map(w => w.id)
		expect(ids).toContain('trust')
		expect(ids).not.toContain('phantom')
		expect(ids).not.toContain('tonkeeper')
	})

	test('TON matches trust and tonkeeper', async () => {
		const ids = (await walletsFor('TON')).map(w => w.id)
		expect(ids.sort()).toEqual(['tonkeeper', 'trust'])
	})

	test('filters out wallets whose scheme cannot be opened', async () => {
		Linking.canOpenURL.mockResolvedValue(false)
		expect(await detectInstalledWallets('BTC')).toEqual([])
	})

	test('a canOpenURL rejection counts as not installed instead of throwing', async () => {
		Linking.canOpenURL.mockRejectedValue(new Error('boom'))
		expect(await detectInstalledWallets('BTC')).toEqual([])
	})

	test('unknown coins match nothing', async () => {
		expect(await walletsFor('DOESNOTEXIST')).toEqual([])
	})
})

describe('per-wallet URI builders', () => {
	const byId = async (id, coin, network) => (await walletsFor(coin, network)).find(w => w.id === id)

	test('Trust Wallet builds a universal link with the CAIP-like asset id', async () => {
		const trust = await byId('trust', 'USDT', 'TRC20')
		const uri = trust.buildUri({ address: 'TAddr123', amount: '25.5', coin: 'USDT', network: 'TRC20' })
		expect(uri).toBe('https://link.trustwallet.com/send?asset=c195_tTR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&address=TAddr123&amount=25.5')
	})

	test('Trust Wallet includes the memo when present and returns null for unmapped assets', async () => {
		const trust = await byId('trust', 'BTC')
		expect(trust.buildUri({ address: 'bc1abc', coin: 'BTC', memo: 'hola mundo' }))
			.toBe('https://link.trustwallet.com/send?asset=c0&address=bc1abc&memo=hola%20mundo')
		expect(trust.buildUri({ address: 'x', coin: 'ZZZ' })).toBeNull()
	})

	test('MetaMask targets chain 56 for BSC and 1 by default', async () => {
		const mm = await byId('metamask', 'USDT', 'BSC')
		expect(mm.buildUri({ address: '0xabc', amount: '10', coin: 'USDT', network: 'BSC' }))
			.toBe('https://metamask.app.link/send/0xabc@56?value=10')
		expect(mm.buildUri({ address: '0xabc', coin: 'ETH' }))
			.toBe('https://metamask.app.link/send/0xabc@1')
	})

	test('Phantom uses the solana: scheme with optional amount', async () => {
		const phantom = await byId('phantom', 'SOL')
		expect(phantom.buildUri({ address: 'So1Addr', amount: '2', coin: 'SOL' })).toBe('solana:So1Addr?amount=2')
		expect(phantom.buildUri({ address: 'So1Addr', coin: 'SOL' })).toBe('solana:So1Addr')
	})

	test('Tonkeeper converts the amount to integer nanotons and memo to text=', async () => {
		const ton = await byId('tonkeeper', 'TON')
		expect(ton.buildUri({ address: 'EQAddr', amount: '1.5', memo: 'dep 1', coin: 'TON' }))
			.toBe('tonkeeper://transfer/EQAddr?amount=1500000000&text=dep%201')
	})

	test('Tonkeeper drops non-finite or non-positive amounts', async () => {
		const ton = await byId('tonkeeper', 'TON')
		expect(ton.buildUri({ address: 'EQAddr', amount: 'abc', coin: 'TON' })).toBe('tonkeeper://transfer/EQAddr')
		expect(ton.buildUri({ address: 'EQAddr', amount: '0', coin: 'TON' })).toBe('tonkeeper://transfer/EQAddr')
	})

	test('BlueWallet builds a BIP21 URI', async () => {
		const blue = await byId('bluewallet', 'BTC')
		expect(blue.buildUri({ address: 'bc1abc', amount: '0.01', coin: 'BTC' })).toBe('bitcoin:bc1abc?amount=0.01')
		expect(blue.buildUri({ address: 'bc1abc', coin: 'BTC' })).toBe('bitcoin:bc1abc')
	})

	test('Coinbase Wallet picks the right scheme per coin (BIP21 / solana / EIP-681)', async () => {
		const cb = await byId('coinbase', 'BTC')
		expect(cb.buildUri({ address: 'bc1abc', coin: 'BTC' })).toBe('bitcoin:bc1abc')
		expect(cb.buildUri({ address: 'LAddr', coin: 'LTC' })).toBe('litecoin:LAddr')
		expect(cb.buildUri({ address: 'So1Addr', coin: 'SOL', amount: '1' })).toBe('solana:So1Addr?amount=1')
		expect(cb.buildUri({ address: '0xabc', coin: 'ETH', amount: '3' })).toBe('ethereum:0xabc?value=3')
	})
})

describe('openInWallet', () => {
	test('opens the built URI and reports success', async () => {
		Linking.openURL.mockResolvedValue()
		const wallet = { buildUri: () => 'bitcoin:bc1abc' }
		await expect(openInWallet(wallet, {})).resolves.toBe(true)
		expect(Linking.openURL).toHaveBeenCalledWith('bitcoin:bc1abc')
	})

	test('returns false when no URI could be built', async () => {
		const wallet = { buildUri: () => null }
		await expect(openInWallet(wallet, {})).resolves.toBe(false)
		expect(Linking.openURL).not.toHaveBeenCalled()
	})

	test('swallows openURL errors and returns false', async () => {
		Linking.openURL.mockRejectedValue(new Error('no handler'))
		const wallet = { buildUri: () => 'tonkeeper://transfer/x' }
		await expect(openInWallet(wallet, {})).resolves.toBe(false)
	})
})
