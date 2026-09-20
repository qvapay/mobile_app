/**
 * @jest-environment node
 *
 * Adaptadores de saldo con fetch simulado: la forma EXACTA de las peticiones
 * (lo que un nodo real aceptaría) y el mapeo respuesta → bigint.
 */
import { displayAmount, formatUnits } from './units'
import { encodeBalanceOf, getEvmNativeBalance, getEvmTokenBalance } from './evm'
import { getTronNativeBalance, getTronTokenBalance, tronJsonRpcUrl, tronToHex20 } from './tron'
import { esploraBalance, getBtcBalance } from './btc'
import { ChainHttpError, hexToBigInt, jsonRpc } from './http'
import { fetchAllBalances, fetchChainBalances } from './index'
import { isRetryableRpcError } from '../registry/rpcRouter'

const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'
const TRON = 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH'
const USDT_TRC20 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const BTC = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
const ADDRESSES = { evm: EVM, tron: TRON, btc: BTC }

const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

let calls
const mockFetch = (handler) => {
	calls = []
	global.fetch = jest.fn(async (url, init = {}) => {
		const body = init.body ? JSON.parse(init.body) : undefined
		calls.push({ url, method: init.method, body })
		return handler(url, body)
	})
}

afterEach(() => { delete global.fetch })

describe('units', () => {
	test('formatUnits exacto con bigint (sin pérdida por Number)', () => {
		expect(formatUnits(0n, 18)).toBe('0')
		expect(formatUnits(1500000n, 6)).toBe('1.5')
		expect(formatUnits(123456789012345678901n, 18)).toBe('123.456789012345678901')
		expect(formatUnits(5n, 8)).toBe('0.00000005')
		expect(formatUnits(42n, 0)).toBe('42')
	})

	test('displayAmount recorta sin redondear hacia arriba y agrupa miles', () => {
		expect(displayAmount('1240.559')).toBe('1,240.55')
		expect(displayAmount('12.123456')).toBe('12.1234')
		expect(displayAmount('0.00012345678')).toBe('0.000123')
		expect(displayAmount('0.00000001')).toBe('<0.000001')
		expect(displayAmount('0')).toBe('0')
		expect(displayAmount('5')).toBe('5')
	})
})

describe('http', () => {
	test('hexToBigInt tolera 0x vacío', () => {
		expect(hexToBigInt('0x')).toBe(0n)
		expect(hexToBigInt(undefined)).toBe(0n)
		expect(hexToBigInt('0x1a')).toBe(26n)
	})

	test('429 y 5xx rotan de nodo; 4xx y revert no', async () => {
		mockFetch(() => jsonResponse({}, 429))
		const rateLimited = await jsonRpc('https://n', 'eth_blockNumber', []).catch(e => e)
		expect(isRetryableRpcError(rateLimited)).toBe(true)

		mockFetch(() => jsonResponse({}, 400))
		const bad = await jsonRpc('https://n', 'eth_blockNumber', []).catch(e => e)
		expect(isRetryableRpcError(bad)).toBe(false)

		mockFetch(() => jsonResponse({ error: { code: 3, message: 'execution reverted' } }))
		const reverted = await jsonRpc('https://n', 'eth_call', []).catch(e => e)
		expect(reverted).toBeInstanceOf(ChainHttpError)
		expect(isRetryableRpcError(reverted)).toBe(false)
	})

	test('respuesta no JSON (captcha/proxy) rota', async () => {
		global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('<html>') } }))
		const err = await jsonRpc('https://n', 'eth_blockNumber', []).catch(e => e)
		expect(isRetryableRpcError(err)).toBe(true)
	})
})

describe('evm', () => {
	test('calldata de balanceOf: selector + address left-pad 32 bytes', () => {
		expect(encodeBalanceOf(EVM)).toBe('0x70a08231' + '000000000000000000000000' + '9858effd232b4033e47d90003d41ec34ecaeda94')
		expect(() => encodeBalanceOf('0x123')).toThrow()
	})

	test('eth_getBalance y eth_call balanceOf', async () => {
		mockFetch((url, body) => jsonResponse({ jsonrpc: '2.0', id: 1, result: body.method === 'eth_getBalance' ? '0xde0b6b3a7640000' : '0x00000000000000000000000000000000000000000000000000000000000f4240' }))
		await expect(getEvmNativeBalance('https://rpc', EVM)).resolves.toBe(10n ** 18n)
		await expect(getEvmTokenBalance('https://rpc', '0xdAC17F958D2ee523a2206206994597C13D831ec7', EVM)).resolves.toBe(1000000n)
		expect(calls[0].body).toEqual({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [EVM, 'latest'] })
		expect(calls[1].body.params[0]).toEqual({ to: '0xdAC17F958D2ee523a2206206994597C13D831ec7', data: encodeBalanceOf(EVM) })
	})
})

describe('tron', () => {
	test('base58check → hex20 (contrato USDT conocido) y checksum verificado', () => {
		expect(tronToHex20(USDT_TRC20)).toBe('a614f803b6fd780986a42c78ec9c7f77e6ded13c')
		expect(() => tronToHex20('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u')).toThrow()
	})

	test('url jsonrpc normalizada con o sin sufijo', () => {
		expect(tronJsonRpcUrl('https://api.trongrid.io/jsonrpc')).toBe('https://api.trongrid.io/jsonrpc')
		expect(tronJsonRpcUrl('https://tron-evm-rpc.publicnode.com/')).toBe('https://tron-evm-rpc.publicnode.com/jsonrpc')
	})

	test('HTTP: cuenta sin activar = 0; con saldo en sun', async () => {
		mockFetch(() => jsonResponse({}))
		await expect(getTronNativeBalance({ url: 'https://api.trongrid.io' }, TRON)).resolves.toBe(0n)
		expect(calls[0]).toMatchObject({ url: 'https://api.trongrid.io/wallet/getaccount', body: { address: TRON, visible: true } })

		mockFetch(() => jsonResponse({ address: TRON, balance: 45100000 }))
		await expect(getTronNativeBalance({ url: 'https://api.trongrid.io' }, TRON)).resolves.toBe(45100000n)
	})

	test('HTTP: triggerconstantcontract balanceOf', async () => {
		mockFetch(() => jsonResponse({ result: { result: true }, constant_result: ['000000000000000000000000000000000000000000000000000000003b9aca00'] }))
		await expect(getTronTokenBalance({ url: 'https://api.trongrid.io' }, USDT_TRC20, TRON)).resolves.toBe(1000000000n)
		expect(calls[0].url).toBe('https://api.trongrid.io/wallet/triggerconstantcontract')
		expect(calls[0].body).toMatchObject({ owner_address: TRON, contract_address: USDT_TRC20, function_selector: 'balanceOf(address)', visible: true })
		expect(calls[0].body.parameter).toHaveLength(64)
	})

	test('jsonrpc: habla hex de 20 bytes', async () => {
		mockFetch(() => jsonResponse({ result: '0x2b0b120' }))
		await getTronTokenBalance({ url: 'https://api.trongrid.io/jsonrpc', api: 'jsonrpc' }, USDT_TRC20, TRON)
		expect(calls[0].url).toBe('https://api.trongrid.io/jsonrpc')
		expect(calls[0].body.params[0].to).toBe('0xa614f803b6fd780986a42c78ec9c7f77e6ded13c')
	})
})

describe('btc', () => {
	test('confirmado + mempool, nunca negativo', () => {
		expect(esploraBalance({ chain_stats: { funded_txo_sum: 150000, spent_txo_sum: 30000 }, mempool_stats: { funded_txo_sum: 5000, spent_txo_sum: 0 } })).toBe(125000n)
		expect(esploraBalance({ chain_stats: { funded_txo_sum: 1000, spent_txo_sum: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 5000 } })).toBe(0n)
		expect(esploraBalance({})).toBe(0n)
	})

	test('GET /address/{addr}', async () => {
		mockFetch(() => jsonResponse({ chain_stats: { funded_txo_sum: 120000, spent_txo_sum: 0 } }))
		await expect(getBtcBalance({ url: 'https://mempool.space/api/' }, BTC)).resolves.toBe(120000n)
		expect(calls[0].url).toBe(`https://mempool.space/api/address/${BTC}`)
	})
})

describe('fetchChainBalances / fetchAllBalances', () => {
	const registry = {
		version: 1,
		updated_at: '',
		chains: {
			bsc: { kind: 'evm', native: { symbol: 'BNB', decimals: 18 }, explorer: '', tokens: [{ symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }], rpcs: [{ url: 'https://bsc', priority: 10, owner: 'x' }] },
			bitcoin: { kind: 'btc', native: { symbol: 'BTC', decimals: 8 }, explorer: '', rpcs: [{ url: 'https://btc', priority: 10, owner: 'x', api: 'esplora' }] },
		},
	}
	const router = { call: (_key, fn) => fn(registry.chains[_key].rpcs[0], new AbortController().signal) }

	test('una cadena = nativo + tokens con ids del catálogo', async () => {
		mockFetch((url, body) => jsonResponse({ result: body.method === 'eth_getBalance' ? '0x0' : '0xde0b6b3a7640000' }))
		await expect(fetchChainBalances(router, registry, 'bsc', ADDRESSES)).resolves.toEqual({
			'bsc:native': '0',
			'bsc:0x55d398326f99059fF775485246999027B3197955': '1000000000000000000',
		})
	})

	test('una cadena caída conserva sus saldos previos y no tumba las demás', async () => {
		mockFetch((url) => {
			if (url.startsWith('https://btc')) return jsonResponse({}, 503)
			return jsonResponse({ result: '0x1' })
		})
		const previous = { balances: { 'bitcoin:native': '777' }, failedChains: [], updatedAt: 0 }
		const result = await fetchAllBalances(router, registry, ADDRESSES, previous, () => 99)
		expect(result.failedChains).toEqual(['bitcoin'])
		expect(result.balances['bitcoin:native']).toBe('777')
		expect(result.balances['bsc:native']).toBe('1')
		expect(result.updatedAt).toBe(99)
	})

	test('todas caídas y sin previo → lanza', async () => {
		mockFetch(() => jsonResponse({}, 503))
		await expect(fetchAllBalances(router, registry, ADDRESSES, null)).rejects.toThrow()
	})
})

describe('roundUpToDecimals', () => {
	const { roundUpToDecimals } = require('./units')
	test('recorta hacia arriba, nunca por debajo de lo pedido', () => {
		expect(roundUpToDecimals('5.1234567', 6)).toBe('5.123457')
		expect(roundUpToDecimals('5.1234560', 6)).toBe('5.123456')
		expect(roundUpToDecimals('5', 6)).toBe('5')
		expect(roundUpToDecimals('0.00000001', 6)).toBe('0.000001')
		expect(roundUpToDecimals('12,5', 2)).toBe('12.5')
		expect(() => roundUpToDecimals('abc', 6)).toThrow()
	})
})
