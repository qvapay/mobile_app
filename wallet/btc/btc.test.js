/**
 * @jest-environment node
 *
 * Enviar Bitcoin: selección de UTXOs y fee por tamaño, construcción/firma
 * verificada re-parseando la tx (salidas y fee exactas), broadcast Esplora.
 */
import { Transaction } from '@scure/btc-signer'

import {
	broadcastBtcTransaction,
	BtcVerifyError,
	DUST_SATS,
	estimateVsize,
	feeFor,
	isValidBtcAddress,
	prepareBtcSend,
	selectUtxos,
	signBtcTransaction,
	verifySignedBtcTransaction,
} from './tx'
import { deriveAddresses, derivePrivateKey } from '../derive'
import { mnemonicToSeed } from '../seed'
import { isRetryableRpcError } from '../registry/rpcRouter'

const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map(b => parseInt(b, 16)))

const SEED = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
const FROM = deriveAddresses(SEED).btc // bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu
const PRIV = derivePrivateKey(SEED, 'btc')
const TO = 'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h'
const RPC = { url: 'https://mempool.space/api', priority: 10, owner: 'mempool', api: 'esplora' }

const utxo = (value, over = {}) => ({ txid: 'ab'.repeat(32), vout: 0, value: BigInt(value), confirmed: true, ...over })

describe('direcciones y tamaño', () => {
	test('acepta bech32 (q/p), P2SH y legacy de mainnet; rechaza testnet, EVM y basura', () => {
		expect(isValidBtcAddress(FROM)).toBe(true)
		expect(isValidBtcAddress('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr')).toBe(true)
		expect(isValidBtcAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true)
		expect(isValidBtcAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true)
		expect(isValidBtcAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBe(false)
		expect(isValidBtcAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(false)
		expect(isValidBtcAddress(FROM.slice(0, -1) + 'x')).toBe(false)
	})

	test('vsize y fee', () => {
		expect(estimateVsize(1, 2)).toBe(141)
		expect(feeFor(141, 1.638)).toBe(231n)
		expect(feeFor(141, 0.5)).toBe(71n)
	})
})

describe('selectUtxos', () => {
	test('cubre cantidad + fee con los grandes primero y devuelve cambio', () => {
		const sel = selectUtxos([utxo(20_000, { vout: 1 }), utxo(100_000), utxo(5_000, { vout: 2 })], 50_000n, 2)
		expect(sel.inputs.map(u => u.value)).toEqual([100_000n])
		expect(sel.amount).toBe(50_000n)
		expect(sel.fee).toBe(feeFor(estimateVsize(1, 2), 2))
		expect(sel.change).toBe(100_000n - 50_000n - sel.fee)
		expect(sel.sendAll).toBe(false)
	})

	test('confirmados antes que no confirmados; cambio de polvo va a la fee', () => {
		const sel = selectUtxos([utxo(100_000, { confirmed: false }), utxo(60_000, { vout: 1 })], 59_500n, 1)
		expect(sel.inputs[0].value).toBe(60_000n)
		// 60000 − 59500 − 141 = 359 < 546 de polvo: sin salida de cambio, los 500 sobrantes son la fee
		expect(sel.change).toBe(0n)
		expect(sel.fee).toBe(500n)
		expect(sel.fee).toBeLessThan(DUST_SATS + feeFor(estimateVsize(1, 2), 1))
	})

	test('enviar todo: fee descontada, sin cambio', () => {
		const sel = selectUtxos([utxo(30_000), utxo(20_000, { vout: 1 })], 50_000n, 2)
		expect(sel.sendAll).toBe(true)
		expect(sel.inputs).toHaveLength(2)
		expect(sel.fee).toBe(feeFor(estimateVsize(2, 1), 2))
		expect(sel.amount).toBe(50_000n - sel.fee)
		expect(sel.change).toBe(0n)
	})

	test('insuficiente, cantidad 0 y fee rate mínima 1', () => {
		expect(() => selectUtxos([utxo(1_000)], 5_000n, 1)).toThrow(/sin fondos/)
		expect(() => selectUtxos([utxo(1_000)], 0n, 1)).toThrow(/inválida/)
		expect(selectUtxos([utxo(100_000)], 1_000n, 0.2).feeRate).toBe(1)
		expect(() => selectUtxos([utxo(600)], 600n, 1)).toThrow(/no cubre/)
	})
})

describe('firma verificada', () => {
	const prepared = { intent: { from: FROM, to: TO, amount: 50_000n }, selection: selectUtxos([utxo(100_000)], 50_000n, 2) }

	test('construye, firma y re-parsea: destino, cambio y fee exactos', () => {
		const signed = signBtcTransaction(prepared, PRIV)
		expect(signed.txid).toMatch(/^[0-9a-f]{64}$/)
		const parsed = Transaction.fromRaw(hexToBytes(signed.hex))
		expect(parsed.outputsLength).toBe(2)
		expect(parsed.getOutput(0).amount).toBe(50_000n)
		expect(() => verifySignedBtcTransaction(signed, prepared)).not.toThrow()
		// vsize real ≤ estimado (la estimación es conservadora)
		expect(estimateVsize(1, 2)).toBeGreaterThanOrEqual(Math.ceil(signed.hex.length / 2 * 0.5))
	})

	test('enviar todo: una sola salida con total − fee', () => {
		const all = { intent: { from: FROM, to: TO, amount: 100_000n }, selection: selectUtxos([utxo(100_000)], 100_000n, 1) }
		const signed = signBtcTransaction(all, PRIV)
		const parsed = Transaction.fromRaw(hexToBytes(signed.hex))
		expect(parsed.outputsLength).toBe(1)
		expect(parsed.getOutput(0).amount).toBe(all.selection.amount)
	})

	test('la verificación rechaza destino, cantidad o fee distintos; otra clave no firma', () => {
		const signed = signBtcTransaction(prepared, PRIV)
		expect(() => verifySignedBtcTransaction(signed, { ...prepared, intent: { ...prepared.intent, to: FROM } })).toThrow(/destino/)
		expect(() => verifySignedBtcTransaction(signed, { ...prepared, selection: { ...prepared.selection, amount: 49_999n } })).toThrow(/cantidad/)
		expect(() => verifySignedBtcTransaction(signed, { ...prepared, selection: { ...prepared.selection, fee: prepared.selection.fee + 1n } })).toThrow(/fee/)
		expect(() => signBtcTransaction(prepared, new Uint8Array(32).fill(7))).toThrow(BtcVerifyError)
	})
})

describe('Esplora', () => {
	afterEach(() => { delete global.fetch })

	test('prepareBtcSend: UTXOs + fee-estimates → selección', async () => {
		global.fetch = jest.fn(async (url) => {
			if (url.endsWith('/utxo')) return { ok: true, status: 200, json: async () => [{ txid: 'ab'.repeat(32), vout: 0, value: 100_000, status: { confirmed: true } }] }
			if (url.endsWith('/fee-estimates')) return { ok: true, status: 200, json: async () => ({ '1': 3, '2': 2, '3': 1.5 }) }
			return { ok: false, status: 404, json: async () => ({}) }
		})
		const prepared = await prepareBtcSend(RPC, { from: FROM, to: TO, amount: 40_000n })
		expect(prepared.selection.feeRate).toBe(1.5)
		expect(prepared.selection.inputs[0].value).toBe(100_000n)
		await expect(prepareBtcSend(RPC, { from: FROM, to: 'nope', amount: 1n })).rejects.toThrow(/destino/)
	})

	test('broadcast: txid en texto, ya conocida = duplicado, fee baja = error no reintentable, 5xx rota', async () => {
		const signed = { hex: '0200', txid: 'cd'.repeat(32) }
		global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => signed.txid }))
		await expect(broadcastBtcTransaction(RPC, signed)).resolves.toEqual({ txid: signed.txid, duplicate: false })
		global.fetch = jest.fn(async () => ({ ok: false, status: 400, text: async () => 'sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}' }))
		await expect(broadcastBtcTransaction(RPC, signed)).resolves.toEqual({ txid: signed.txid, duplicate: true })
		global.fetch = jest.fn(async () => ({ ok: false, status: 400, text: async () => 'min relay fee not met' }))
		const rejected = await broadcastBtcTransaction(RPC, signed).catch(e => e)
		expect(rejected.message).toMatch(/min relay fee/)
		expect(isRetryableRpcError(rejected)).toBe(false)
		global.fetch = jest.fn(async () => ({ ok: false, status: 503, text: async () => 'busy' }))
		const busy = await broadcastBtcTransaction(RPC, signed).catch(e => e)
		expect(isRetryableRpcError(busy)).toBe(true)
	})
})
