/**
 * Qué fue de una tx difundida sin respuesta clara, en las cinco familias. Solo `dropped` deja
 * firmar otra: si se devolviera de más, el usuario pagaría dos veces.
 * @jest-environment node
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, encodeVarintField } from '../tron/protobuf'
import { lookupTronTransaction, TRON_LOOKUP_MARGIN_MS } from '../tron/tx'
import { lookupSolanaTransaction, lookupSponsoredSolanaTransaction } from '../solana/tx'
import { EVM_LOOKUP_MAX_DEPTH, EVM_LOOKUP_MIN_DEPTH, lookupEvmTransaction } from '../evm/tx'
import { BTC_LOOKUP_CONFIRMATIONS, lookupBtcTransaction } from '../btc/tx'
import { lookupStacksTransaction } from '../stacks/tx'
import { isDataUnavailable, isRetryableRpcError } from '../registry/rpcRouter'
import { toBase64 } from '../solana/codec'

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

// Una tx patrocinada lleva como id la firma del pagador (QvaPay), que la app no tiene. Pero el
// remitente también la firma: si entró, está en su historial, y es la que lleva exactamente el
// mensaje que firmó. Sin esto la app dependía de lo que dijera el backend, que ante una
// difusión sin respuesta contesta «no se gastó nada» sin haberlo comprobado
describe('lookupSponsoredSolanaTransaction', () => {
	const OWNER = 'Owner1111111111111111111111111111111111111'
	const LAST_VALID = 250_000_150
	const BLOCKHASH_SLOT = 270_000_000
	const POST_EXPIRY_SLOT = BLOCKHASH_SLOT + 400
	const MESSAGE = Uint8Array.from({ length: 120 }, (_, i) => (i * 7 + 3) % 256)
	const OTHER_MESSAGE = Uint8Array.from({ length: 120 }, (_, i) => (i * 5 + 1) % 256)

	/** Una tx serializada: nº de firmas, las firmas (64 bytes cada una) y el mensaje. */
	const serialized = (message, signatures = 2) => toBase64(Uint8Array.from([signatures, ...new Array(64 * signatures).fill(9), ...message]))
	const onChain = (message, err = null) => ({ slot: BLOCKHASH_SLOT + 20, transaction: [serialized(message), 'base64'], meta: { err } })
	const OLDER = { signature: 'older', slot: BLOCKHASH_SLOT - 10, err: null }

	let calls
	const mockRpc = ({ epoch = { absoluteSlot: POST_EXPIRY_SLOT, blockHeight: LAST_VALID + 5 }, history = [OLDER], txs = {}, historyNodeSlot = POST_EXPIRY_SLOT }) => {
		calls = []
		global.fetch = jest.fn(async (_url, init) => {
			const { method, params } = JSON.parse(init.body)
			calls.push({ method, params })
			const ok = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) })
			if (method === 'getEpochInfo') return ok(epoch)
			if (method === 'getSignaturesForAddress') {
				const min = params?.[1]?.minContextSlot ?? 0
				if (historyNodeSlot < min) return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32016, message: 'Minimum context slot has not been reached' } }) }
				return ok(history)
			}
			if (method === 'getTransaction') return ok(txs[params[0]] ?? null)
			return ok(null)
		})
	}
	const lookup = (blockhashSlot = BLOCKHASH_SLOT) => lookupSponsoredSolanaTransaction(RPC, { owner: OWNER, messageBytes: MESSAGE, lastValidBlockHeight: LAST_VALID, blockhashSlot })
	const after = (signature, offset = 20) => ({ signature, slot: BLOCKHASH_SLOT + offset, err: null })

	test('está en el historial del remitente con NUESTRO mensaje → landed, con la firma del pagador como id', async () => {
		mockRpc({ history: [after('PAYER_SIG'), OLDER], txs: { PAYER_SIG: onChain(MESSAGE) } })
		await expect(lookup()).resolves.toEqual({ status: 'landed', txid: 'PAYER_SIG' })
		// Se pidió la tx entera para comparar el mensaje byte a byte
		expect(calls.find(c => c.method === 'getTransaction').params).toEqual(['PAYER_SIG', { commitment: 'confirmed', encoding: 'base64', maxSupportedTransactionVersion: 0 }])
	})

	// Lo importante: antes de que caduque también se puede saber que SÍ entró
	test('entró y aún no ha caducado el blockhash → landed igualmente (la prueba positiva no espera)', async () => {
		mockRpc({ epoch: { absoluteSlot: BLOCKHASH_SLOT + 30, blockHeight: LAST_VALID - 100 }, historyNodeSlot: BLOCKHASH_SLOT + 30, history: [after('PAYER_SIG'), OLDER], txs: { PAYER_SIG: onChain(MESSAGE) } })
		await expect(lookup()).resolves.toEqual({ status: 'landed', txid: 'PAYER_SIG' })
	})

	test('entró pero falló en la cadena → dropped (no movió fondos y ese blockhash ya no se repite)', async () => {
		mockRpc({ history: [after('PAYER_SIG'), OLDER], txs: { PAYER_SIG: onChain(MESSAGE, { InstructionError: [2, 'Custom'] }) } })
		await expect(lookup()).resolves.toEqual({ status: 'dropped' })
	})

	test('otra tx del remitente en esa ventana, con OTRO mensaje, no es la nuestra', async () => {
		mockRpc({ history: [after('OTRA'), OLDER], txs: { OTRA: onChain(OTHER_MESSAGE) } })
		await expect(lookup()).resolves.toEqual({ status: 'dropped' })
	})

	test('caducó, el historial llega a antes del blockhash y no está → dropped', async () => {
		mockRpc({})
		await expect(lookup()).resolves.toEqual({ status: 'dropped' })
		expect(calls.map(c => c.method)).toEqual(['getEpochInfo', 'getSignaturesForAddress'])
		// El historial lo contesta un nodo que ya llegó al slot en que se vio la caducidad
		expect(calls[1].params[1].minContextSlot).toBe(POST_EXPIRY_SLOT)
	})

	test('no está pero TODAVÍA puede entrar (no ha caducado) → unknown: ni se paga ni se reconstruye', async () => {
		mockRpc({ epoch: { absoluteSlot: BLOCKHASH_SLOT + 30, blockHeight: LAST_VALID - 100 }, historyNodeSlot: BLOCKHASH_SLOT + 30 })
		await expect(lookup()).resolves.toEqual({ status: 'unknown' })
	})

	test('caducó pero el historial no alcanza hasta antes del blockhash → unknown', async () => {
		mockRpc({ history: [after('OTRA')], txs: { OTRA: onChain(OTHER_MESSAGE) } })
		await expect(lookup()).resolves.toEqual({ status: 'unknown' })
	})

	test('una candidata que el nodo no devuelve no se puede descartar → unknown', async () => {
		mockRpc({ history: [after('PODADA'), OLDER], txs: {} })
		await expect(lookup()).resolves.toEqual({ status: 'unknown' })
	})

	test('demasiadas tx del remitente en la ventana para inspeccionarlas todas → unknown', async () => {
		const many = Array.from({ length: 9 }, (_, i) => after(`tx${i}`, 10 + i))
		mockRpc({ history: [...many, OLDER], txs: Object.fromEntries(many.map(h => [h.signature, onChain(OTHER_MESSAGE)])) })
		await expect(lookup()).resolves.toEqual({ status: 'unknown' })
		expect(calls.some(c => c.method === 'getTransaction')).toBe(false)
	})

	test('sin saber en qué slot se leyó el blockhash no se pregunta nada → unknown', async () => {
		mockRpc({})
		await expect(lookup(null)).resolves.toEqual({ status: 'unknown' })
		expect(calls).toEqual([])
	})

	test.each([
		['historial que no es una lista', { history: { value: [] } }],
		['entradas sin forma', { history: [{ slot: 1 }, OLDER] }],
		['epoch sin altura', { epoch: { absoluteSlot: POST_EXPIRY_SLOT } }],
		['tx con una codificación rara', { history: [after('RARA'), OLDER], txs: { RARA: { transaction: { message: {} }, meta: null } } }],
	])('%s → unknown', async (_label, config) => {
		mockRpc(config)
		await expect(lookup()).resolves.toEqual({ status: 'unknown' })
	})

	test('una tx que no tiene forma de tx (bytes sueltos) simplemente no es la nuestra', async () => {
		mockRpc({ history: [after('CORTA'), OLDER], txs: { CORTA: { transaction: [toBase64(Uint8Array.from([2, 1, 2, 3])), 'base64'], meta: { err: null } } } })
		await expect(lookup()).resolves.toEqual({ status: 'dropped' })
	})

	test('un nodo rezagado no puede contestar el historial: error (el router rota), nunca «no está»', async () => {
		mockRpc({ historyNodeSlot: POST_EXPIRY_SLOT - 50 })
		await expect(lookup()).rejects.toThrow()
	})
})

// Una tx EVM no caduca: «no está» solo vale si OTRA tx gastó su nonce, y hace tiempo
describe('lookupEvmTransaction', () => {
	const NODE = { url: 'https://evm.example', owner: 'test', priority: 1 }
	const HASH = `0x${'ab'.repeat(32)}`
	const FROM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'
	const SENT = { hash: HASH, from: FROM, nonce: 7 }
	const HEAD = 5_000_000n
	const hex = (value) => `0x${BigInt(value).toString(16)}`

	let calls
	/** Cada método contesta con su lista de respuestas, una por llamada (la última se repite). */
	const mockNode = (answers) => {
		calls = []
		const seen = {}
		global.fetch = jest.fn(async (_url, init) => {
			const { method, params } = JSON.parse(init.body)
			calls.push([method, ...params])
			const list = answers[method] ?? [null]
			const index = Math.min(seen[method] ?? 0, list.length - 1)
			seen[method] = (seen[method] ?? 0) + 1
			const answer = list[index]
			if (answer instanceof Error) return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: answer.message } }) }
			return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: answer }) }
		})
	}
	const receipt = (status, hash = HASH) => ({ transactionHash: hash, blockNumber: '0x4c4b3f', status })
	/** La punta y el bloque de `EVM_LOOKUP_MAX_DEPTH` atrás, separados por `span` segundos. */
	const blocks = (span) => [{ number: hex(HEAD), timestamp: hex(1_800_000_000) }, { timestamp: hex(1_800_000_000 - span) }]
	// Ethereum: 12 s por bloque → 3 min son 15 bloques
	const ETHEREUM = blocks(1200)

	test('con recibo y status 0x1 → landed', async () => {
		mockNode({ eth_getTransactionReceipt: [receipt('0x1')] })
		await expect(lookupEvmTransaction(NODE, SENT)).resolves.toEqual({ status: 'landed', txid: HASH })
		expect(calls).toEqual([['eth_getTransactionReceipt', HASH]])
	})

	test('con recibo y status 0x0 (revirtió) → dropped: gastó su nonce y no movió el importe', async () => {
		mockNode({ eth_getTransactionReceipt: [receipt('0x0')] })
		await expect(lookupEvmTransaction(NODE, SENT)).resolves.toEqual({ status: 'dropped' })
	})

	test('un recibo de OTRA tx no dice nada → unknown', async () => {
		mockNode({ eth_getTransactionReceipt: [receipt('0x1', `0x${'cd'.repeat(32)}`)] })
		await expect(lookupEvmTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
	})

	test('sin recibo pero el nodo la conoce (mempool) → landed, como una difusión aceptada', async () => {
		mockNode({ eth_getTransactionReceipt: [null], eth_getTransactionByHash: [{ hash: HASH, blockNumber: null }] })
		await expect(lookupEvmTransaction(NODE, SENT)).resolves.toEqual({ status: 'landed', txid: HASH })
		expect(calls.map(c => c[0])).toEqual(['eth_getTransactionReceipt', 'eth_getTransactionByHash'])
	})

	test('sin rastro y el nonce sigue libre → unknown: una tx EVM no caduca y aún puede entrar', async () => {
		mockNode({ eth_getBlockByNumber: ETHEREUM, eth_getTransactionCount: [hex(7)] })
		await expect(lookupEvmTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
		// Sin nonce gastado no se vuelve a buscar
		expect(calls.map(c => c[0])).toEqual(['eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getBlockByNumber', 'eth_getTransactionCount'])
	})

	test('sin rastro y OTRA tx gastó su nonce hace ya 3 min → dropped, tras volver a buscarla', async () => {
		mockNode({ eth_getBlockByNumber: ETHEREUM, eth_getTransactionCount: [hex(8)] })
		await expect(lookupEvmTransaction(NODE, SENT)).resolves.toEqual({ status: 'dropped' })
		// El nonce se mira 3 min atrás (15 bloques de 12 s), no en `latest`, y la tx se busca otra vez DESPUÉS
		expect(calls).toEqual([
			['eth_getTransactionReceipt', HASH],
			['eth_getTransactionByHash', HASH],
			['eth_getBlockByNumber', 'latest', false],
			['eth_getBlockByNumber', hex(HEAD - EVM_LOOKUP_MAX_DEPTH), false],
			['eth_getTransactionCount', FROM, hex(HEAD - 15n)],
			['eth_getTransactionReceipt', HASH],
			['eth_getTransactionByHash', HASH],
		])
	})

	// Los bloques van de 12 s (Ethereum) a 0,2 s (Base): el margen se mide con la propia cadena
	test.each([
		['red rápida (100 bloques en 20 s): se queda en el tope que guarda un nodo completo', 20, EVM_LOOKUP_MAX_DEPTH],
		['bloques de 2 s: 3 min son 90 bloques', 200, 90n],
		['red lenta (bloques de 1 min): nunca menos del mínimo', 6000, EVM_LOOKUP_MIN_DEPTH],
		['marcas de tiempo iguales o al revés: el tope', 0, EVM_LOOKUP_MAX_DEPTH],
	])('%s', async (_name, span, depth) => {
		mockNode({ eth_getBlockByNumber: blocks(span), eth_getTransactionCount: [hex(7)] })
		await lookupEvmTransaction(NODE, SENT)
		expect(calls.find(c => c[0] === 'eth_getTransactionCount')).toEqual(['eth_getTransactionCount', FROM, hex(HEAD - depth)])
	})

	// Detrás de un balanceador, la primera búsqueda pudo contestarla un nodo rezagado
	test('si al volver a buscarla aparece, es que fue ELLA la que gastó el nonce → landed', async () => {
		mockNode({ eth_getTransactionReceipt: [null, receipt('0x1')], eth_getBlockByNumber: ETHEREUM, eth_getTransactionCount: [hex(8)] })
		await expect(lookupEvmTransaction(NODE, SENT)).resolves.toEqual({ status: 'landed', txid: HASH })
	})

	test('…o aparece en el mempool en la segunda vuelta → landed', async () => {
		mockNode({ eth_getTransactionByHash: [null, { hash: HASH }], eth_getBlockByNumber: ETHEREUM, eth_getTransactionCount: [hex(8)] })
		await expect(lookupEvmTransaction(NODE, SENT)).resolves.toEqual({ status: 'landed', txid: HASH })
	})

	test('una cadena recién nacida (menos bloques que el margen) → unknown', async () => {
		mockNode({ eth_getBlockByNumber: [{ number: hex(EVM_LOOKUP_MAX_DEPTH), timestamp: hex(1_800_000_000) }] })
		await expect(lookupEvmTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
	})

	test('un nodo que ya podó el estado de esa altura lanza, y el router rota sin darlo por caído', async () => {
		mockNode({ eth_getBlockByNumber: ETHEREUM, eth_getTransactionCount: [new Error('missing trie node 9f3c (path ) state 0x9f3c is not available')] })
		const error = await lookupEvmTransaction(NODE, SENT).catch(err => err)
		expect(error).toBeInstanceOf(Error)
		expect(isRetryableRpcError(error)).toBe(true)
		expect(isDataUnavailable(error)).toBe(true)
	})
})

// Una tx de Bitcoin tampoco caduca: «no está» solo vale si otra tx gastó uno de sus inputs
describe('lookupBtcTransaction', () => {
	const NODE = { url: 'https://esplora.example/api', api: 'esplora', owner: 'test', priority: 1 }
	const TXID = 'ab'.repeat(32)
	const OTHER = 'cd'.repeat(32)
	const INPUTS = [{ txid: '11'.repeat(32), vout: 0 }, { txid: '22'.repeat(32), vout: 3 }]
	const SENT = { txid: TXID, inputs: INPUTS }
	const TIP = 900_000

	let paths
	const mockNode = ({ tx, outspends = {}, status = 404 }) => {
		paths = []
		global.fetch = jest.fn(async (url) => {
			const path = new URL(url).pathname.replace('/api', '')
			paths.push(path)
			if (path === `/tx/${TXID}`) {
				if (tx) return { ok: true, status: 200, json: async () => tx }
				return { ok: false, status, json: async () => { throw new Error('texto plano') }, text: async () => 'Transaction not found' }
			}
			if (path === '/blocks/tip/height') return { ok: true, status: 200, json: async () => TIP }
			const match = path.match(/^\/tx\/([0-9a-f]{64})\/outspend\/(\d+)$/)
			if (match) return { ok: true, status: 200, json: async () => outspends[`${match[1]}:${match[2]}`] ?? { spent: false } }
			return { ok: false, status: 404, json: async () => ({}) }
		})
	}
	const spentBy = (txid, confirmations) => ({ spent: true, txid, vin: 0, status: confirmations > 0 ? { confirmed: true, block_height: TIP - confirmations + 1 } : { confirmed: false } })

	test('el nodo la conoce (mempool o bloque) → landed', async () => {
		mockNode({ tx: { txid: TXID, status: { confirmed: false } } })
		await expect(lookupBtcTransaction(NODE, SENT)).resolves.toEqual({ status: 'landed', txid: TXID })
		expect(paths).toEqual([`/tx/${TXID}`])
	})

	// `/tx/:txid/status` contesta 200 {"confirmed":false} también a una tx que no existe
	test('nunca usa /status, que no distingue una tx en mempool de una que no existe', async () => {
		mockNode({})
		await lookupBtcTransaction(NODE, SENT)
		expect(paths.some(path => path.endsWith('/status'))).toBe(false)
	})

	test('una respuesta que no es esa tx → unknown', async () => {
		mockNode({ tx: { txid: OTHER } })
		await expect(lookupBtcTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
	})

	test('no está y sus inputs siguen sin gastar → unknown: aún puede entrar', async () => {
		mockNode({})
		await expect(lookupBtcTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
		expect(paths).toEqual([`/tx/${TXID}`, '/blocks/tip/height', `/tx/${INPUTS[0].txid}/outspend/0`, `/tx/${INPUTS[1].txid}/outspend/3`])
	})

	test('no está y OTRA tx gastó un input con las confirmaciones exigidas → dropped', async () => {
		mockNode({ outspends: { [`${INPUTS[1].txid}:3`]: spentBy(OTHER, BTC_LOOKUP_CONFIRMATIONS) } })
		await expect(lookupBtcTransaction(NODE, SENT)).resolves.toEqual({ status: 'dropped' })
	})

	test('…con una confirmación de menos, o solo en mempool, no decide → unknown', async () => {
		mockNode({ outspends: { [`${INPUTS[0].txid}:0`]: spentBy(OTHER, BTC_LOOKUP_CONFIRMATIONS - 1) } })
		await expect(lookupBtcTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
		mockNode({ outspends: { [`${INPUTS[0].txid}:0`]: spentBy(OTHER, 0) } })
		await expect(lookupBtcTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
	})

	test('el índice de gastos dice que el input lo gastó ESTA tx → landed', async () => {
		mockNode({ outspends: { [`${INPUTS[0].txid}:0`]: spentBy(TXID, 1) } })
		await expect(lookupBtcTransaction(NODE, SENT)).resolves.toEqual({ status: 'landed', txid: TXID })
	})

	test('un fallo del nodo no es «no está»: lanza y el router rota', async () => {
		mockNode({ status: 503 })
		const error = await lookupBtcTransaction(NODE, SENT).catch(err => err)
		expect(isRetryableRpcError(error)).toBe(true)
	})
})

// Hiro da `dropped_*` de forma transitoria: lo que decide es qué tx lleva ese nonce en un bloque
describe('lookupStacksTransaction', () => {
	const NODE = { url: 'https://hiro.example', api: 'hiro', owner: 'test', priority: 1 }
	const TXID = 'ab'.repeat(32)
	const OTHER = `0x${'cd'.repeat(32)}`
	const FROM = 'SP3XXK8BG5X7CRH7W07RRJK3JZJXJ799WX3Y0SMCR'
	const SENT = { txid: TXID, from: FROM, nonce: 12n }

	let paths
	const mockNode = ({ tx, history = [], status = 404 }) => {
		paths = []
		global.fetch = jest.fn(async (url) => {
			const { pathname } = new URL(url)
			paths.push(pathname)
			if (pathname === `/extended/v1/tx/0x${TXID}`) {
				if (tx) return { ok: true, status: 200, json: async () => tx }
				return { ok: false, status, json: async () => ({ statusCode: status, error: 'Not Found', message: 'could not find transaction by ID' }) }
			}
			if (pathname === `/extended/v2/addresses/${FROM}/transactions`) return { ok: true, status: 200, json: async () => ({ results: history.map(row => ({ tx: row })) }) }
			return { ok: false, status: 404, json: async () => ({}) }
		})
	}
	const mined = (over = {}) => ({ tx_id: `0x${TXID}`, tx_status: 'success', canonical: true, block_height: 9_487_645, nonce: 12, sender_address: FROM, ...over })

	test('por id y con éxito → landed (sin mirar el historial)', async () => {
		mockNode({ tx: mined() })
		await expect(lookupStacksTransaction(NODE, SENT)).resolves.toEqual({ status: 'landed', txid: TXID })
		expect(paths).toEqual([`/extended/v1/tx/0x${TXID}`])
	})

	test('en el mempool → landed, como una difusión aceptada', async () => {
		mockNode({ tx: mined({ tx_status: 'pending', block_height: undefined }) })
		await expect(lookupStacksTransaction(NODE, SENT)).resolves.toEqual({ status: 'landed', txid: TXID })
	})

	test.each(['abort_by_response', 'abort_by_post_condition'])('entró y falló (%s) → dropped: gastó su nonce y no movió el importe', async (status) => {
		mockNode({ tx: mined({ tx_status: status }) })
		await expect(lookupStacksTransaction(NODE, SENT)).resolves.toEqual({ status: 'dropped' })
	})

	test('`dropped_*` de Hiro NO decide: sin otra tx con ese nonce en un bloque → unknown', async () => {
		mockNode({ tx: mined({ tx_status: 'dropped_replace_by_fee', block_height: undefined }) })
		await expect(lookupStacksTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
		expect(paths).toEqual([`/extended/v1/tx/0x${TXID}`, `/extended/v2/addresses/${FROM}/transactions`])
	})

	test('no está, y OTRA tx del remitente con ese nonce ya está en un bloque → dropped', async () => {
		mockNode({ history: [mined({ tx_id: OTHER })] })
		await expect(lookupStacksTransaction(NODE, SENT)).resolves.toEqual({ status: 'dropped' })
	})

	test('no está por id, pero el historial la enseña minada → landed', async () => {
		mockNode({ history: [mined({ nonce: 13, tx_id: OTHER }), mined()] })
		await expect(lookupStacksTransaction(NODE, SENT)).resolves.toEqual({ status: 'landed', txid: TXID })
	})

	test('otra tx con ese nonce que aún no está en un bloque, o fuera de la cadena canónica, no decide', async () => {
		mockNode({ history: [mined({ tx_id: OTHER, tx_status: 'pending', block_height: undefined })] })
		await expect(lookupStacksTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
		mockNode({ history: [mined({ tx_id: OTHER, canonical: false })] })
		await expect(lookupStacksTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
	})

	// El historial de una dirección trae también lo que RECIBE: el nonce de otro remitente no cuenta
	test('una tx de OTRO remitente con el mismo nonce no cuenta', async () => {
		mockNode({ history: [mined({ tx_id: OTHER, sender_address: 'SP3SBQ9PZEMBNBAWTR7FRPE3XK0EFW9JWVX4G80S2' })] })
		await expect(lookupStacksTransaction(NODE, SENT)).resolves.toEqual({ status: 'unknown' })
	})

	test('un fallo del nodo no es «no está»: lanza y el router rota', async () => {
		mockNode({ status: 502 })
		const error = await lookupStacksTransaction(NODE, SENT).catch(err => err)
		expect(isRetryableRpcError(error)).toBe(true)
	})
})
