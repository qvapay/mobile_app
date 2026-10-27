/**
 * Qué fue de una tx difundida sin respuesta clara, en TRON y Solana. Solo `dropped` deja
 * firmar otra: si se devolviera de más, el usuario pagaría dos veces.
 * @jest-environment node
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, encodeVarintField } from '../tron/protobuf'
import { lookupTronTransaction, TRON_LOOKUP_MARGIN_MS } from '../tron/tx'
import { lookupSolanaTransaction } from '../solana/tx'

const RPC = { url: 'https://node.example', api: 'trongrid', owner: 'test', priority: 1 }

afterEach(() => { delete global.fetch })

describe('lookupTronTransaction', () => {
	const EXPIRATION = 1_800_000_060_000
	// raw_data con solo `expiration` (campo 8): basta para el id y la vigencia
	const RAW = bytesToHex(encodeVarintField(8, EXPIRATION))
	const TXID = bytesToHex(sha256(encodeVarintField(8, EXPIRATION)))

	let paths
	const mockNode = ({ headTime, tx, head }) => {
		paths = []
		global.fetch = jest.fn(async (url) => {
			const path = new URL(url).pathname
			paths.push(path)
			if (path === '/wallet/getnowblock') return { ok: true, status: 200, json: async () => head ?? { block_header: { raw_data: { timestamp: headTime } } } }
			if (path === '/wallet/gettransactionbyid') return { ok: true, status: 200, json: async () => tx ?? {} }
			return { ok: false, status: 404, json: async () => ({}) }
		})
	}

	test('en un bloque y con éxito → landed (con su txID)', async () => {
		mockNode({ headTime: EXPIRATION - 30_000, tx: { txID: TXID, ret: [{ contractRet: 'SUCCESS' }] } })
		await expect(lookupTronTransaction(RPC, RAW)).resolves.toEqual({ status: 'landed', txid: TXID })
	})

	test('en un bloque pero fallida (sin energía) → dropped: no movió fondos y su firma ya no vale', async () => {
		mockNode({ headTime: EXPIRATION - 30_000, tx: { txID: TXID, ret: [{ contractRet: 'OUT_OF_ENERGY' }] } })
		await expect(lookupTronTransaction(RPC, RAW)).resolves.toEqual({ status: 'dropped' })
	})

	test('no está ({} exacto) y la punta pasó su expiration con margen → dropped', async () => {
		mockNode({ headTime: EXPIRATION + TRON_LOOKUP_MARGIN_MS + 3_000 })
		await expect(lookupTronTransaction(RPC, RAW)).resolves.toEqual({ status: 'dropped' })
	})

	test('no está pero la punta acaba de pasar su expiration → unknown: otro nodo del pool puede ir por detrás', async () => {
		mockNode({ headTime: EXPIRATION + 3_000 })
		await expect(lookupTronTransaction(RPC, RAW)).resolves.toEqual({ status: 'unknown' })
	})

	test('el nodo contesta 200 con { Error } (Util.processError de java-tron) → unknown, no "no está"', async () => {
		mockNode({ headTime: EXPIRATION + TRON_LOOKUP_MARGIN_MS + 3_000, tx: { Error: 'class java.lang.NullPointerException : null' } })
		await expect(lookupTronTransaction(RPC, RAW)).resolves.toEqual({ status: 'unknown' })
	})

	test('respuesta sin forma de tx ni {} exacto → unknown', async () => {
		mockNode({ headTime: EXPIRATION + TRON_LOOKUP_MARGIN_MS + 3_000, tx: { result: { code: 'OTHER_ERROR' } } })
		await expect(lookupTronTransaction(RPC, RAW)).resolves.toEqual({ status: 'unknown' })
	})

	test('punta con Error o sin timestamp → unknown', async () => {
		mockNode({ head: { Error: 'no block' } })
		await expect(lookupTronTransaction(RPC, RAW)).resolves.toEqual({ status: 'unknown' })
	})

	test('no está pero la punta aún no llega a su expiration → unknown (puede entrar todavía)', async () => {
		mockNode({ headTime: EXPIRATION - 3_000 })
		await expect(lookupTronTransaction(RPC, RAW)).resolves.toEqual({ status: 'unknown' })
	})

	test('la punta se lee ANTES que la tx: si entrara entre las dos lecturas, el bloque sería anterior a esa punta', async () => {
		mockNode({ headTime: EXPIRATION + TRON_LOOKUP_MARGIN_MS + 3_000 })
		await lookupTronTransaction(RPC, RAW)
		expect(paths).toEqual(['/wallet/getnowblock', '/wallet/gettransactionbyid'])
	})
})

describe('lookupSolanaTransaction', () => {
	const SIGNATURE = '5'.repeat(88)
	const OWNER = 'Owner1111111111111111111111111111111111111'
	const LAST_VALID = 250_000_150
	// Slot en que se leyó el blockhash: la tx no puede haber entrado antes
	const BLOCKHASH_SLOT = 270_000_000
	const POST_EXPIRY_SLOT = BLOCKHASH_SLOT + 400

	let calls
	/** Un pool de RPC: cada método contesta lo suyo, y `getSignaturesForAddress` respeta minContextSlot. */
	const mockRpc = ({ status = null, epoch = { absoluteSlot: POST_EXPIRY_SLOT, blockHeight: LAST_VALID + 5 }, history = [{ signature: 'older', slot: BLOCKHASH_SLOT - 10, err: null }], historyNodeSlot = POST_EXPIRY_SLOT }) => {
		calls = []
		global.fetch = jest.fn(async (_url, init) => {
			const { method, params } = JSON.parse(init.body)
			calls.push({ method, params })
			const ok = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) })
			if (method === 'getSignatureStatuses') return ok({ context: { slot: BLOCKHASH_SLOT - 50 }, value: [status] })
			if (method === 'getEpochInfo') return ok(epoch)
			if (method === 'getSignaturesForAddress') {
				const min = params?.[1]?.minContextSlot ?? 0
				if (historyNodeSlot < min) return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32016, message: 'Minimum context slot has not been reached' } }) }
				return ok(history)
			}
			return ok(null)
		})
	}
	const lookup = (blockhashSlot = BLOCKHASH_SLOT) => lookupSolanaTransaction(RPC, { signature: SIGNATURE, owner: OWNER, lastValidBlockHeight: LAST_VALID, blockhashSlot })

	test('confirmada sin error → landed (una prueba positiva vale venga del nodo que venga)', async () => {
		mockRpc({ status: { confirmationStatus: 'confirmed', err: null } })
		await expect(lookup()).resolves.toEqual({ status: 'landed', txid: SIGNATURE })
	})

	test('finalizada con error → dropped (no movió fondos)', async () => {
		mockRpc({ status: { confirmationStatus: 'finalized', err: { InstructionError: [0, 'Custom'] } } })
		await expect(lookup()).resolves.toEqual({ status: 'dropped' })
	})

	test('vista coherente tras caducar, su historial llega a antes del envío y no está → dropped', async () => {
		mockRpc({})
		await expect(lookup()).resolves.toEqual({ status: 'dropped' })
		const history = calls.find(c => c.method === 'getSignaturesForAddress')
		expect(history.params[0]).toBe(OWNER)
		expect(history.params[1]).toMatchObject({ commitment: 'confirmed', minContextSlot: POST_EXPIRY_SLOT })
	})

	test('el historial de la dirección SÍ la trae → landed', async () => {
		mockRpc({ history: [{ signature: SIGNATURE, slot: BLOCKHASH_SLOT + 3, err: null }, { signature: 'older', slot: BLOCKHASH_SLOT - 10, err: null }] })
		await expect(lookup()).resolves.toEqual({ status: 'landed', txid: SIGNATURE })
	})

	test('el nodo que contesta el historial va por detrás de la caducidad (pool de RPC) → falla, nunca dropped', async () => {
		// El router prueba otro nodo; si ninguno llega, el motor trata el fallo como `unknown`
		mockRpc({ historyNodeSlot: BLOCKHASH_SLOT + 20 })
		await expect(lookup()).rejects.toThrow(/Minimum context slot/)
	})

	test('el historial no llega a antes del envío (podado o cuenta sin actividad previa) → unknown', async () => {
		mockRpc({ history: [{ signature: 'newer', slot: BLOCKHASH_SLOT + 50, err: null }] })
		await expect(lookup()).resolves.toEqual({ status: 'unknown' })
	})

	test('la altura aún no pasó lastValidBlockHeight (aunque nuestro reloj de 60 s sí) → unknown, sin pedir historial', async () => {
		mockRpc({ epoch: { absoluteSlot: POST_EXPIRY_SLOT, blockHeight: LAST_VALID - 10 } })
		await expect(lookup()).resolves.toEqual({ status: 'unknown' })
		expect(calls.map(c => c.method)).not.toContain('getSignaturesForAddress')
	})

	test('solo processed → unknown aunque la red haya caducado', async () => {
		mockRpc({ status: { confirmationStatus: 'processed', err: null } })
		await expect(lookup()).resolves.toEqual({ status: 'unknown' })
	})

	test('sin saber desde qué slot se envió → unknown', async () => {
		mockRpc({})
		await expect(lookup(null)).resolves.toEqual({ status: 'unknown' })
	})

	test('una respuesta de historial con forma rara → unknown', async () => {
		mockRpc({ history: { not: 'an array' } })
		await expect(lookup()).resolves.toEqual({ status: 'unknown' })
	})
})
