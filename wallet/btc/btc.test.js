/**
 * @jest-environment node
 *
 * Enviar Bitcoin: selección de UTXOs y fee por tamaño, construcción/firma
 * verificada re-parseando la tx (salidas y fee exactas), broadcast Esplora.
 */
import { Transaction } from '@scure/btc-signer'

import { createPendingBtcSpends, pendingBtcSpends } from './pendingSpends'
import {
	broadcastBtcTransaction,
	BtcVerifyError,
	DUST_SATS,
	estimateBtcSendReserve,
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

// X-05: MÁX de BTC en un intercambio abría la orden por el saldo entero y depositaba el saldo
// menos la comisión: al proveedor le llegaba menos de lo acordado
describe('un importe que tiene que llegar EXACTO (el depósito de un intercambio)', () => {
	test('«enviar todo» no vale: si el saldo no da para la cantidad MÁS la comisión, no hay envío', () => {
		const utxos = [utxo(30_000), utxo(20_000, { vout: 1 })]
		expect(() => selectUtxos(utxos, 50_000n, 2, 0, { exact: true })).toThrow(/sin fondos suficientes para la cantidad más la comisión/)
		// Sin `exact` (un envío normal) sigue siendo «enviar todo»
		expect(selectUtxos(utxos, 50_000n, 2).sendAll).toBe(true)
	})

	test('con sitio para la comisión, llega la cantidad pedida tal cual', () => {
		const sel = selectUtxos([utxo(30_000), utxo(20_000, { vout: 1 })], 49_000n, 2, 0, { exact: true })
		expect(sel.amount).toBe(49_000n)
		expect(sel.sendAll).toBe(false)
		expect(sel.inputs.reduce((sum, u) => sum + u.value, 0n) - sel.change - sel.fee).toBe(49_000n)
	})

	test('la reserva de MÁX deja sitio para esa comisión, también si la tasa sube', async () => {
		global.fetch = jest.fn(async (url) => {
			if (url.endsWith('/utxo')) return { ok: true, status: 200, json: async () => [{ txid: 'aa'.repeat(32), vout: 0, value: 30_000, status: { confirmed: true } }, { txid: 'bb'.repeat(32), vout: 1, value: 20_000, status: { confirmed: true } }] }
			return { ok: true, status: 200, json: async () => ({ 1: 10, 3: 6, 6: 2 }) }
		})
		try {
			const reserve = await estimateBtcSendReserve(RPC, FROM)
			// Dos inputs y dos salidas a la tasa rápida, más la mitad de margen
			expect(reserve).toBe(feeFor(estimateVsize(2, 2), 10) * 3n / 2n)
			// Lo que MÁX ofrecería se puede depositar exacto, incluso al nivel más caro
			const sel = selectUtxos([utxo(30_000), utxo(20_000, { vout: 1 })], 50_000n - reserve, 10, 0, { exact: true })
			expect(sel.amount).toBe(50_000n - reserve)
		} finally { delete global.fetch }
	})

	test('sin UTXOs no hay nada que reservar', async () => {
		global.fetch = jest.fn(async (url) => ({ ok: true, status: 200, json: async () => (url.endsWith('/utxo') ? [] : {}) }))
		try { await expect(estimateBtcSendReserve(RPC, FROM)).resolves.toBe(0n) } finally { delete global.fetch }
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

// Un nodo cuyo índice por dirección va por detrás del mempool (medido: hasta un minuto) sigue
// listando monedas que la wallet acaba de gastar. El segundo envío las volvía a gastar: la red
// lo rechaza o, con más comisión, reemplaza al primero, que ya no llega
describe('gastos pendientes: un segundo envío no vuelve a gastar lo mismo', () => {
	const U1 = 'a1'.repeat(32)
	// Un nodo que acepta la tx contesta con su id, como Esplora
	const accept = async (url, init) => ({ ok: true, status: 200, text: async () => Transaction.fromRaw(hexToBytes(init.body), { allowUnknownOutputs: true }).id })
	// El nodo atrasado: pase lo que pase, sigue listando la moneda de antes
	const staleNode = (broadcast = accept) => jest.fn(async (url, init) => {
		if (init?.method === 'POST') return broadcast(url, init)
		if (url.endsWith('/utxo')) return { ok: true, status: 200, json: async () => [{ txid: U1, vout: 0, value: 100_000, status: { confirmed: true } }] }
		if (url.endsWith('/fee-estimates')) return { ok: true, status: 200, json: async () => ({ '1': 3, '3': 2, '6': 1 }) }
		return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
	})
	const sendOnce = async (pending, amount) => {
		const prepared = await prepareBtcSend(RPC, { from: FROM, to: TO, amount }, { pending })
		const signed = signBtcTransaction(prepared, PRIV)
		await broadcastBtcTransaction(RPC, signed, { pending })
		return { prepared, signed }
	}
	afterEach(() => { delete global.fetch; pendingBtcSpends.clear() })

	test('el segundo envío gasta el cambio del primero, no la moneda que el nodo aún lista', async () => {
		global.fetch = staleNode()
		const pending = createPendingBtcSpends()
		const first = await sendOnce(pending, 30_000n)
		expect(first.prepared.selection.inputs.map(u => u.txid)).toEqual([U1])

		const second = await sendOnce(pending, 20_000n)
		expect(second.prepared.selection.inputs).toEqual([{ txid: first.signed.txid, vout: 1, value: first.prepared.selection.change, confirmed: false }])
		// Y es lo que de verdad firma: el input de la segunda tx es el cambio de la primera
		const parsed = Transaction.fromRaw(hexToBytes(second.signed.hex))
		expect(Array.from(parsed.getInput(0).txid, byte => byte.toString(16).padStart(2, '0')).join('')).toBe(first.signed.txid)
		expect(parsed.getInput(0).index).toBe(1)

		// Un tercero encadena igual: el nodo nunca listó el cambio del primero
		const third = await sendOnce(pending, 10_000n)
		expect(third.prepared.selection.inputs).toEqual([{ txid: second.signed.txid, vout: 1, value: second.prepared.selection.change, confirmed: false }])
	})

	test('sin la libreta era el fallo: la misma moneda dos veces', async () => {
		global.fetch = staleNode()
		const first = await sendOnce(createPendingBtcSpends(), 30_000n)
		const again = await prepareBtcSend(RPC, { from: FROM, to: TO, amount: 20_000n }, { pending: createPendingBtcSpends() })
		expect(again.selection.inputs.map(u => u.txid)).toEqual(first.prepared.selection.inputs.map(u => u.txid))
	})

	test('lo que ya no hay no se ofrece: pedir más que el cambio es «sin fondos», no un envío con lo gastado', async () => {
		global.fetch = staleNode()
		const pending = createPendingBtcSpends()
		const first = await sendOnce(pending, 30_000n)
		await expect(prepareBtcSend(RPC, { from: FROM, to: TO, amount: 80_000n }, { pending })).rejects.toThrow(/sin fondos/)
		// «Enviar todo» es ahora el cambio entero
		const all = await prepareBtcSend(RPC, { from: FROM, to: TO, amount: first.prepared.selection.change }, { pending })
		expect(all.selection.sendAll).toBe(true)
	})

	test('tras «enviar todo» no queda nada: ni envío ni reserva', async () => {
		global.fetch = staleNode()
		const pending = createPendingBtcSpends()
		await sendOnce(pending, 100_000n)
		await expect(prepareBtcSend(RPC, { from: FROM, to: TO, amount: 10_000n }, { pending })).rejects.toThrow(/sin fondos/)
		await expect(estimateBtcSendReserve(RPC, FROM, { pending })).resolves.toBe(0n)
	})

	test('solo una tx ACEPTADA deja nota: «ya la conozco» sí; un rechazo, un 5xx o una difusión sin respuesta, no', async () => {
		const pending = createPendingBtcSpends()
		global.fetch = staleNode()
		const prepared = await prepareBtcSend(RPC, { from: FROM, to: TO, amount: 30_000n }, { pending })
		const signed = signBtcTransaction(prepared, PRIV)

		global.fetch = staleNode(async () => ({ ok: false, status: 400, text: async () => 'min relay fee not met' }))
		await expect(broadcastBtcTransaction(RPC, signed, { pending })).rejects.toThrow(/min relay fee/)
		global.fetch = staleNode(async () => ({ ok: false, status: 503, text: async () => 'busy' }))
		await expect(broadcastBtcTransaction(RPC, signed, { pending })).rejects.toThrow(/503/)
		global.fetch = staleNode(async () => { throw new TypeError('Network request failed') })
		await expect(broadcastBtcTransaction(RPC, signed, { pending })).rejects.toThrow(/Network/)
		// Un 200 que no devuelve el id de ESTA tx se sigue dando por enviado, pero no prueba nada
		for (const body of ['', '<html>ok</html>', 'cd'.repeat(32)]) {
			global.fetch = staleNode(async () => ({ ok: true, status: 200, text: async () => body }))
			await expect(broadcastBtcTransaction(RPC, signed, { pending })).resolves.toMatchObject({ duplicate: false })
		}
		expect(pending.list()).toEqual([])
		// Sin nota manda la lista del nodo: la moneda sigue disponible para reintentar
		global.fetch = staleNode()
		expect((await prepareBtcSend(RPC, { from: FROM, to: TO, amount: 30_000n }, { pending })).selection.inputs.map(u => u.txid)).toEqual([U1])

		global.fetch = staleNode(async () => ({ ok: false, status: 400, text: async () => 'sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}' }))
		await expect(broadcastBtcTransaction(RPC, signed, { pending })).resolves.toEqual({ txid: signed.txid, duplicate: true })
		expect(pending.list().map(note => note.txid)).toEqual([signed.txid])
	})

	test('anotar nunca convierte en fallo una difusión que salió bien', async () => {
		const pending = createPendingBtcSpends()
		// Bytes que la libreta no sabe leer, y el nodo los da por buenos: la difusión contesta
		// igual, y no queda nota
		global.fetch = staleNode(async () => ({ ok: true, status: 200, text: async () => 'cd'.repeat(32) }))
		await expect(broadcastBtcTransaction(RPC, { hex: '0200', txid: 'cd'.repeat(32), from: FROM }, { pending })).resolves.toEqual({ txid: 'cd'.repeat(32), duplicate: false })
		expect(pending.list()).toEqual([])
		// Lo mismo cuando la libreta falla por lo que sea
		const broken = { ...pending, record: () => { throw new Error('boom') } }
		global.fetch = staleNode()
		const signed = signBtcTransaction(await prepareBtcSend(RPC, { from: FROM, to: TO, amount: 30_000n }, { pending }), PRIV)
		await expect(broadcastBtcTransaction(RPC, signed, { pending: broken })).resolves.toEqual({ txid: signed.txid, duplicate: false })
	})

	test('sin pasar nada se usa la libreta de la sesión', async () => {
		global.fetch = staleNode()
		const prepared = await prepareBtcSend(RPC, { from: FROM, to: TO, amount: 30_000n })
		const signed = signBtcTransaction(prepared, PRIV)
		await broadcastBtcTransaction(RPC, signed)
		expect(pendingBtcSpends.list().map(note => note.txid)).toEqual([signed.txid])
		const second = await prepareBtcSend(RPC, { from: FROM, to: TO, amount: 20_000n })
		expect(second.selection.inputs.map(u => u.txid)).toEqual([signed.txid])
	})
})

describe('niveles de fee', () => {
	const { feeRatesFromEstimates } = require('./tx')
	test('fast/normal/slow desde fee-estimates, monótonos y con suelo de 1', () => {
		expect(feeRatesFromEstimates({ '1': 4, '2': 3, '3': 2, '6': 0.5 })).toEqual({ fast: 4, normal: 2, slow: 1 })
		// objetivo ausente → el más cercano por debajo que exista
		expect(feeRatesFromEstimates({ '1': 5, '4': 3 })).toEqual({ fast: 5, normal: 5, slow: 3 })
		expect(feeRatesFromEstimates(null)).toEqual({ fast: 1, normal: 1, slow: 1 })
		// nunca "normal" más caro que "fast"
		expect(feeRatesFromEstimates({ '1': 2, '3': 9, '6': 1 })).toEqual({ fast: 2, normal: 2, slow: 1 })
	})
})
