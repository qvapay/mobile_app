/**
 * Qué fue de una tx difundida sin respuesta clara, en TRON y Solana. Solo `dropped` deja
 * firmar otra: si se devolviera de más, el usuario pagaría dos veces.
 * @jest-environment node
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, encodeVarintField } from '../tron/protobuf'
import { lookupTronTransaction } from '../tron/tx'
import { lookupSolanaTransaction } from '../solana/tx'

const RPC = { url: 'https://node.example', api: 'trongrid', owner: 'test', priority: 1 }

afterEach(() => { delete global.fetch })

describe('lookupTronTransaction', () => {
	const EXPIRATION = 1_800_000_060_000
	// raw_data con solo `expiration` (campo 8): basta para el id y la vigencia
	const RAW = bytesToHex(encodeVarintField(8, EXPIRATION))
	const TXID = bytesToHex(sha256(encodeVarintField(8, EXPIRATION)))

	let paths
	const mockNode = ({ headTime, tx }) => {
		paths = []
		global.fetch = jest.fn(async (url) => {
			const path = new URL(url).pathname
			paths.push(path)
			if (path === '/wallet/getnowblock') return { ok: true, status: 200, json: async () => ({ block_header: { raw_data: { timestamp: headTime } } }) }
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

	test('no está y la punta ya pasó su expiration → dropped', async () => {
		mockNode({ headTime: EXPIRATION + 3_000 })
		await expect(lookupTronTransaction(RPC, RAW)).resolves.toEqual({ status: 'dropped' })
	})

	test('no está pero la punta aún no llega a su expiration → unknown (puede entrar todavía)', async () => {
		mockNode({ headTime: EXPIRATION - 3_000 })
		await expect(lookupTronTransaction(RPC, RAW)).resolves.toEqual({ status: 'unknown' })
	})

	test('la punta se lee ANTES que la tx: si entrara entre las dos lecturas, el bloque sería anterior a esa punta', async () => {
		mockNode({ headTime: EXPIRATION + 3_000 })
		await lookupTronTransaction(RPC, RAW)
		expect(paths).toEqual(['/wallet/getnowblock', '/wallet/gettransactionbyid'])
	})
})

describe('lookupSolanaTransaction', () => {
	const SIGNATURE = '5'.repeat(88)
	const LAST_VALID = 250_000_150

	let methods
	const mockRpc = ({ height, status }) => {
		methods = []
		global.fetch = jest.fn(async (_url, init) => {
			const { method } = JSON.parse(init.body)
			methods.push(method)
			const result = method === 'getBlockHeight' ? height : { context: { slot: 1 }, value: [status ?? null] }
			return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) }
		})
	}

	test('confirmada sin error → landed', async () => {
		mockRpc({ height: LAST_VALID - 20, status: { confirmationStatus: 'confirmed', err: null } })
		await expect(lookupSolanaTransaction(RPC, SIGNATURE, LAST_VALID)).resolves.toEqual({ status: 'landed', txid: SIGNATURE })
	})

	test('finalizada con error → dropped (no movió fondos)', async () => {
		mockRpc({ height: LAST_VALID + 5, status: { confirmationStatus: 'finalized', err: { InstructionError: [0, 'Custom'] } } })
		await expect(lookupSolanaTransaction(RPC, SIGNATURE, LAST_VALID)).resolves.toEqual({ status: 'dropped' })
	})

	test('sin rastro y la altura ya pasó lastValidBlockHeight → dropped', async () => {
		mockRpc({ height: LAST_VALID + 1 })
		await expect(lookupSolanaTransaction(RPC, SIGNATURE, LAST_VALID)).resolves.toEqual({ status: 'dropped' })
	})

	test('sin rastro pero dentro de su vigencia REAL (aunque nuestro reloj de 60 s ya la dé por caducada) → unknown', async () => {
		mockRpc({ height: LAST_VALID - 10 })
		await expect(lookupSolanaTransaction(RPC, SIGNATURE, LAST_VALID)).resolves.toEqual({ status: 'unknown' })
	})

	test('solo processed → unknown aunque pase la altura: aún puede caer en un fork o confirmarse', async () => {
		mockRpc({ height: LAST_VALID + 5, status: { confirmationStatus: 'processed', err: null } })
		await expect(lookupSolanaTransaction(RPC, SIGNATURE, LAST_VALID)).resolves.toEqual({ status: 'unknown' })
	})

	test('la altura se lee ANTES que la firma', async () => {
		mockRpc({ height: LAST_VALID + 1 })
		await lookupSolanaTransaction(RPC, SIGNATURE, LAST_VALID)
		expect(methods).toEqual(['getBlockHeight', 'getSignatureStatuses'])
	})
})
