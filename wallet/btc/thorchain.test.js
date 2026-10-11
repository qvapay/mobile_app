/**
 * @jest-environment node
 *
 * BTC → otra cadena por THORChain. Los memos son reales (quote de THORChain, 10 oct 2026).
 * Lo que no se puede romper: el depósito va a la bóveda que dicen LOS NODOS (no el backend),
 * el memo paga a una wallet del propio usuario con límite de precio, y la tx no lleva nada más.
 */
import { hexToBytes } from '@noble/hashes/utils.js'
import { Script, Transaction } from '@scure/btc-signer'

import { deriveAddresses, derivePrivateKey } from '../derive'
import { mnemonicToSeed } from '../seed'
import {
	fetchBtcVault,
	memoAssetMatches,
	parseThorchainSwapMemo,
	prepareThorchainBtcSwap,
	signThorchainBtcSwap,
	verifyThorchainMemo,
} from './thorchain'

const SEED = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
const FROM = deriveAddresses(SEED).btc
const PRIV = derivePrivateKey(SEED, 'btc')
const VAULT = 'bc1qjenqvxfl7r9gs0ts39g7e0jch60gchtf3lx2fq'
const EVM = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A'
const TRON = 'TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe'
const USDT_ETH = 'ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7'
const RPC = { url: 'https://mempool.space/api', priority: 10, owner: 'mempool', api: 'esplora' }

// Reales: 0,005 BTC → USDT (Ethereum) y → USDT (TRON), con afiliado "t" al 0,4%
const MEMO_ETH = `=:ETH.USDT:${EVM}:40798854412/1/0:t:40`
const MEMO_TRON = `=:TRON.USDT:${TRON}:40413250743/1/0:t:40`

const intent = (over = {}) => ({ from: FROM, amountSats: 500_000n, memo: MEMO_ETH, pool: USDT_ETH, destination: EVM, shownOut: 41_210_964_053n, maxAffiliateBps: 40, ...over })

describe('memo', () => {

	test('se decodifica entero', () => {
		expect(parseThorchainSwapMemo(MEMO_ETH)).toEqual({ asset: 'ETH.USDT', destination: EVM, limit: 40_798_854_412n, interval: 1, quantity: 0, affiliate: 't', affiliateBps: 40 })
		expect(parseThorchainSwapMemo('=:ETH.ETH:0xabc:4e5').limit).toBe(400_000n)
	})

	test('formas del activo: completa, sin contrato y con el final del contrato', () => {
		expect(memoAssetMatches('ETH.USDT', USDT_ETH)).toBe(true)
		expect(memoAssetMatches(USDT_ETH, USDT_ETH)).toBe(true)
		expect(memoAssetMatches('ETH.USDT-EC7', USDT_ETH)).toBe(true)
		expect(memoAssetMatches('ETH.USDT-AAA', USDT_ETH)).toBe(false)
		expect(memoAssetMatches('BSC.USDT', USDT_ETH)).toBe(false)
		// Alias reales de la API para los nativos; un alias de otro activo no casa
		expect(memoAssetMatches('e', 'ETH.ETH')).toBe(true)
		expect(memoAssetMatches('tr', 'TRON.TRX')).toBe(true)
		expect(memoAssetMatches('s', 'ETH.ETH')).toBe(false)
	})

	test('los memos reales pasan', () => {
		expect(verifyThorchainMemo(intent()).limit).toBe(40_798_854_412n)
		expect(verifyThorchainMemo(intent({ memo: MEMO_TRON, pool: 'TRON.USDT-TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T', destination: TRON, shownOut: 40_821_465_397n })).asset).toBe('TRON.USDT')
	})

	test('otro destino, otro activo, sin límite o con más comisión no pasan', () => {
		expect(() => verifyThorchainMemo(intent({ memo: MEMO_ETH.replace(EVM, '0x000000000000000000000000000000000000dEaD') }))).toThrow(/no es tu wallet/)
		expect(() => verifyThorchainMemo(intent({ memo: MEMO_ETH.replace('ETH.USDT', 'ETH.ETH') }))).toThrow(/otro activo/)
		expect(() => verifyThorchainMemo(intent({ memo: MEMO_ETH.replace('40798854412/1/0', '0/1/0') }))).toThrow(/sin límite/)
		expect(() => verifyThorchainMemo(intent({ memo: MEMO_ETH.replace('40798854412', '30000000000') }))).toThrow(/muy por debajo/)
		expect(() => verifyThorchainMemo(intent({ memo: MEMO_ETH.replace(':t:40', ':t:100') }))).toThrow(/afiliado mayor/)
		expect(() => verifyThorchainMemo(intent({ memo: `${MEMO_ETH}/x:5` }))).toThrow()
	})

	test('un memo que no cabe en un OP_RETURN no se firma', () => {
		expect(() => verifyThorchainMemo(intent({ memo: `=:ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7:${EVM}:40798854412/1/0:t:40` }))).toThrow(/no cabe/)
	})
})

describe('bóveda y transacción', () => {

	const inbound = (address = VAULT, extra = {}) => [{ chain: 'ETH', address: '0x1' }, { chain: 'BTC', address, halted: false, chain_trading_paused: false, global_trading_paused: false, dust_threshold: '1000', ...extra }]
	const mock = ({ a = inbound(), b = inbound(), utxos = [{ txid: 'ab'.repeat(32), vout: 0, value: 1_000_000, status: { confirmed: true } }] } = {}) => {
		global.fetch = jest.fn(async (url) => {
			const json = (body) => ({ ok: true, status: 200, json: async () => body })
			if (url.startsWith('https://n1')) return a ? json(a) : { ok: false, status: 503, json: async () => ({}) }
			if (url.startsWith('https://n2')) return b ? json(b) : { ok: false, status: 503, json: async () => ({}) }
			if (url.endsWith('/utxo')) return json(utxos)
			if (url.endsWith('/fee-estimates')) return json({ '1': 4, '3': 3, '6': 2 })
			return { ok: false, status: 404, json: async () => ({}) }
		})
	}
	const endpoints = ['https://n1', 'https://n2']
	afterEach(() => { delete global.fetch })

	test('la bóveda la dicen los nodos, y tienen que coincidir', async () => {
		mock()
		expect((await fetchBtcVault({ endpoints })).address).toBe(VAULT)
		mock({ b: inbound('bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h') })
		await expect(fetchBtcVault({ endpoints })).rejects.toThrow(/no coinciden/)
		mock({ b: null })
		expect((await fetchBtcVault({ endpoints })).address).toBe(VAULT)
	})

	test('con el trading pausado no se firma', async () => {
		mock({ a: inbound(VAULT, { chain_trading_paused: true }), b: null })
		await expect(fetchBtcVault({ endpoints })).rejects.toThrow(/pausado/)
	})

	test('bóveda → cambio propio → OP_RETURN con el memo, y nada más', async () => {
		mock()
		const prepared = await prepareThorchainBtcSwap(RPC, intent(), { endpoints })
		const signed = signThorchainBtcSwap(prepared, PRIV)
		const tx = Transaction.fromRaw(hexToBytes(signed.hex), { allowUnknownOutputs: true })
		expect(tx.outputsLength).toBe(3)
		expect(tx.getOutput(0).amount).toBe(500_000n)
		expect(tx.getOutput(1).amount).toBe(prepared.selection.change)
		const [op, data] = Script.decode(tx.getOutput(2).script)
		expect(op).toBe('RETURN')
		expect(String.fromCharCode(...data)).toBe(MEMO_ETH)
		expect(tx.getOutput(2).amount).toBe(0n)
	})

	test('gastar todo el saldo no se permite: a la bóveda llegaría menos de lo cotizado', async () => {
		mock({ utxos: [{ txid: 'ab'.repeat(32), vout: 0, value: 500_000, status: { confirmed: true } }] })
		await expect(prepareThorchainBtcSwap(RPC, intent(), { endpoints })).rejects.toThrow(/comisión de red|sin fondos/)
	})

	test('firmar con otra clave no pasa', async () => {
		mock()
		const prepared = await prepareThorchainBtcSwap(RPC, intent(), { endpoints })
		expect(() => signThorchainBtcSwap(prepared, new Uint8Array(32).fill(7))).toThrow(/no corresponde/)
	})
})
