/**
 * Crypto detection for the withdraw destination gate — the category id is the
 * canonical signal (parity with the web wizard) and `network` the fallback for
 * backends that don't expose `coins_categories_id` on /coins/v2 yet.
 * @jest-environment node
 */
import { isCryptoCoin, CRYPTO_CATEGORY_ID } from './withdrawDestination'

describe('isCryptoCoin', () => {
	test('a coin in the crypto category is crypto', () => {
		expect(isCryptoCoin({ tick: 'BTC', coins_categories_id: CRYPTO_CATEGORY_ID })).toBe(true)
	})

	test('the category id also matches as a string (JSON-serialized backends)', () => {
		expect(isCryptoCoin({ tick: 'BTC', coins_categories_id: '1' })).toBe(true)
	})

	test('a coin with only a network falls back to crypto', () => {
		expect(isCryptoCoin({ tick: 'USDT', network: 'TRC20' })).toBe(true)
	})

	test('a bank coin with neither signal is not crypto', () => {
		expect(isCryptoCoin({ tick: 'BANK_CUP', coins_categories_id: 2, network: null })).toBe(false)
	})

	test('missing coin or missing fields are not crypto', () => {
		expect(isCryptoCoin(null)).toBe(false)
		expect(isCryptoCoin(undefined)).toBe(false)
		expect(isCryptoCoin({ tick: 'ETECSA' })).toBe(false)
	})
})
