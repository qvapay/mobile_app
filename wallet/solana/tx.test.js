/**
 * @jest-environment node
 *
 * Enviar en Solana con un RPC simulado: SOL nativo y USDT SPL (con y sin crear la cuenta
 * del destinatario), prioridad, tx patrocinada (fee payer ajeno), verificación que rechaza
 * cualquier desviación y broadcast.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { deriveAddresses, derivePrivateKey } from '../derive'
import { mnemonicToSeed } from '../seed'
import {
	associatedTokenAddress,
	compileMessage,
	createAssociatedTokenAccountIdempotentIx,
	deserializeTransaction,
	fromBase64,
	pubkeyBytes,
	serializeMessage,
	systemTransferIx,
	transferCheckedIx,
	TOKEN_PROGRAM,
} from './codec'
import {
	broadcastSolanaTransaction,
	decodeSolanaTransfer,
	LAMPORTS_PER_SIGNATURE,
	MAX_PRIORITY_MICROLAMPORTS,
	prepareSolanaSend,
	priorityFeeFrom,
	signSolanaTransaction,
	SolanaExpiredError,
	SolanaVerifyError,
	verifySignedSolanaTransaction,
} from './tx'

const SEED = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
const FROM = deriveAddresses(SEED).sol
const PRIV = derivePrivateKey(SEED, 'solana')
const DEST = '5rXezEUcPoLLDKATEsDJzUdNojasqE2ekkHntNLfEQtL'
const PAYER = '5ZgHPb447UcXavVTorgYBr8egi3sw7dXKpX4Frec9rYS'
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k'
const RPC = { url: 'https://sol', priority: 10, owner: 'x' }
const USDT_INTENT = { from: FROM, to: DEST, amount: 2_500_000n, mint: USDT, decimals: 6 }

let calls
const mockRpc = ({ prio = [{ prioritizationFee: 0 }, { prioritizationFee: 3000 }, { prioritizationFee: 5000 }, { prioritizationFee: 9000 }], accounts = {}, send } = {}) => {
	calls = []
	global.fetch = jest.fn(async (_url, init) => {
		const { method, params } = JSON.parse(init.body)
		calls.push({ method, params })
		const ok = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) })
		const fail = (message) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32002, message } }) })
		switch (method) {
			case 'getLatestBlockhash': return ok({ context: { slot: 1 }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1234 } })
			case 'getRecentPrioritizationFees': return ok(prio)
			case 'getAccountInfo': return ok({ context: { slot: 1 }, value: accounts[params[0]] ?? null })
			case 'getMinimumBalanceForRentExemption': return ok(params[0] === 165 ? 2039280 : 890880)
			case 'sendTransaction': return send ? send(params, { ok, fail }) : ok('sig')
			default: throw new Error(`método inesperado ${method}`)
		}
	})
}
afterEach(() => { delete global.fetch })

const wallet = { owner: '11111111111111111111111111111111', lamports: 1 }

describe('priorityFeeFrom', () => {
	test('mediana de las no nulas, con tope', () => {
		expect(priorityFeeFrom([{ prioritizationFee: 0 }, { prioritizationFee: 3000 }, { prioritizationFee: 5000 }, { prioritizationFee: 9000 }])).toBe(5000n)
		expect(priorityFeeFrom([{ prioritizationFee: 0 }])).toBe(0n)
		expect(priorityFeeFrom(undefined)).toBe(0n)
		expect(priorityFeeFrom([{ prioritizationFee: 9_999_999 }])).toBe(MAX_PRIORITY_MICROLAMPORTS)
	})
})

describe('USDT SPL', () => {
	test('destino sin cuenta de USDT: se crea (renta 0.002 SOL), prioridad y firma verificada', async () => {
		mockRpc({ accounts: { [DEST]: wallet } })
		const prepared = await prepareSolanaSend(RPC, USDT_INTENT, { now: () => 1000 })
		expect(prepared).toMatchObject({ feePayer: FROM, sponsored: false, createsTokenAccount: true, rentLamports: 2039280n, computeUnitPrice: 5000n, computeUnitLimit: 80000, lastValidBlockHeight: 1234, expiresAt: 61000 })
		expect(prepared.feeLamports).toBe(LAMPORTS_PER_SIGNATURE + 400n) // 5000 µL × 80 000 CU = 400 lamports
		expect(calls.map(c => c.method)).toContain('getMinimumBalanceForRentExemption')

		const decoded = decodeSolanaTransfer(prepared.message)
		expect(decoded).toMatchObject({ feePayer: FROM, kind: 'token', from: FROM, to: associatedTokenAddress(DEST, USDT), amount: 2_500_000n, mint: USDT, decimals: 6, createsTokenAccountFor: DEST, computeUnitLimit: 80000, computeUnitPrice: 5000n })

		const signed = signSolanaTransaction(prepared, PRIV)
		expect(signed.txid).toBe(signed.signature)
		const tx = deserializeTransaction(fromBase64(signed.base64))
		expect(tx.signatures).toHaveLength(1)
		expect(ed25519.verify(tx.signatures[0], tx.messageBytes, pubkeyBytes(FROM))).toBe(true)
	})

	test('destino con cuenta y sin prioridad: una transferencia, tarifa base', async () => {
		mockRpc({ prio: [{ prioritizationFee: 0 }], accounts: { [DEST]: wallet, [associatedTokenAddress(DEST, USDT)]: { owner: TOKEN_PROGRAM, lamports: 2039280 } } })
		const prepared = await prepareSolanaSend(RPC, USDT_INTENT)
		expect(prepared).toMatchObject({ createsTokenAccount: false, rentLamports: 0n, computeUnitPrice: 0n, feeLamports: 5000n })
		expect(prepared.message.instructions).toHaveLength(1)
		expect(() => verifySignedSolanaTransaction(signSolanaTransaction(prepared, PRIV), prepared)).not.toThrow()
	})

	test('pegar la cuenta de token como destino se rechaza (crearía una ATA de una ATA)', async () => {
		const ata = associatedTokenAddress(DEST, USDT)
		mockRpc({ accounts: { [ata]: { owner: TOKEN_PROGRAM, lamports: 2039280 } } })
		await expect(prepareSolanaSend(RPC, { ...USDT_INTENT, to: ata })).rejects.toThrow(/cuenta de token/)
	})
})

describe('SOL nativo', () => {
	test('a una cuenta nueva exige el mínimo exento de renta', async () => {
		mockRpc()
		await expect(prepareSolanaSend(RPC, { from: FROM, to: DEST, amount: 100n, mint: null, decimals: 9 })).rejects.toThrow(/al menos 890880/)
		const prepared = await prepareSolanaSend(RPC, { from: FROM, to: DEST, amount: 1_000_000n, mint: null, decimals: 9 })
		expect(decodeSolanaTransfer(prepared.message)).toMatchObject({ kind: 'native', from: FROM, to: DEST, amount: 1_000_000n })
		expect(() => verifySignedSolanaTransaction(signSolanaTransaction(prepared, PRIV), prepared)).not.toThrow()
	})

	test('entradas inválidas', async () => {
		mockRpc()
		await expect(prepareSolanaSend(RPC, { from: FROM, to: '0xabc', amount: 1n, mint: null, decimals: 9 })).rejects.toThrow(/destino/)
		await expect(prepareSolanaSend(RPC, { from: FROM, to: FROM, amount: 1n, mint: null, decimals: 9 })).rejects.toThrow(/propia/)
		await expect(prepareSolanaSend(RPC, { from: FROM, to: DEST, amount: 0n, mint: null, decimals: 9 })).rejects.toThrow(/cantidad/)
	})
})

describe('patrocinada (fee payer = QvaPay)', () => {
	test('dos firmantes; la cuenta nueva la paga el fee payer; el usuario firma solo su hueco y no hay txid', async () => {
		mockRpc({ accounts: { [DEST]: wallet } })
		const prepared = await prepareSolanaSend(RPC, USDT_INTENT, { feePayer: PAYER })
		expect(prepared).toMatchObject({ feePayer: PAYER, sponsored: true })
		expect(prepared.message.accountKeys[0]).toBe(PAYER)
		expect(prepared.feeLamports).toBe(2n * LAMPORTS_PER_SIGNATURE + 400n)
		const signed = signSolanaTransaction(prepared, PRIV)
		expect(signed.txid).toBeNull()
		const tx = deserializeTransaction(fromBase64(signed.base64))
		expect(tx.signatures[0]).toBeNull()
		expect(tx.signatures[1]).not.toBeNull()
		await expect(broadcastSolanaTransaction(RPC, signed)).rejects.toThrow(/patrocinada/)
	})
})

describe('verificación', () => {
	test('rechaza otra clave y cualquier desviación de lo preparado', async () => {
		mockRpc({ accounts: { [DEST]: wallet } })
		const prepared = await prepareSolanaSend(RPC, USDT_INTENT)
		expect(() => signSolanaTransaction(prepared, new Uint8Array(32).fill(7))).toThrow(SolanaVerifyError)
		const signed = signSolanaTransaction(prepared, PRIV)
		expect(() => verifySignedSolanaTransaction(signed, { ...prepared, intent: { ...prepared.intent, amount: 1n } })).toThrow(/cantidad/)
		expect(() => verifySignedSolanaTransaction(signed, { ...prepared, intent: { ...prepared.intent, to: PAYER } })).toThrow(/destino|creada/)
		expect(() => verifySignedSolanaTransaction(signed, { ...prepared, recentBlockhash: PAYER })).toThrow(/blockhash/)
		const other = { ...prepared, messageBytes: serializeMessage(compileMessage(FROM, [systemTransferIx(FROM, DEST, 1n)], BLOCKHASH)) }
		expect(() => verifySignedSolanaTransaction(signed, other)).toThrow(/no es el preparado/)
	})

	test('el decodificador rechaza programas extra, dos transferencias y ATA ajena', () => {
		const xfer = transferCheckedIx({ source: associatedTokenAddress(FROM, USDT), mint: USDT, destination: associatedTokenAddress(DEST, USDT), owner: FROM, amount: 1n, decimals: 6 })
		const memo = { programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', keys: [], data: Uint8Array.of(1) }
		expect(() => decodeSolanaTransfer(compileMessage(FROM, [xfer, memo], BLOCKHASH))).toThrow(/no permitido/)
		expect(() => decodeSolanaTransfer(compileMessage(FROM, [xfer, xfer], BLOCKHASH))).toThrow(/no permitida/)
		expect(() => decodeSolanaTransfer(compileMessage(FROM, [systemTransferIx(FROM, DEST, 1n), systemTransferIx(FROM, PAYER, 1n)], BLOCKHASH))).toThrow(/no permitida/)
		// ATA creada para un tercero mientras se transfiere a DEST
		expect(() => decodeSolanaTransfer(compileMessage(FROM, [createAssociatedTokenAccountIdempotentIx(FROM, PAYER, USDT), xfer], BLOCKHASH))).toThrow(/destino de la transferencia/)
		// ATA pagada por alguien que no es el fee payer
		expect(() => decodeSolanaTransfer(compileMessage(FROM, [createAssociatedTokenAccountIdempotentIx(PAYER, DEST, USDT), xfer], BLOCKHASH))).toThrow(/fee payer/)
		expect(() => decodeSolanaTransfer(compileMessage(FROM, [], BLOCKHASH))).toThrow(/no transfiere/)
	})
})

describe('broadcast', () => {
	const signedFor = async () => {
		mockRpc({ accounts: { [DEST]: wallet } })
		return signSolanaTransaction(await prepareSolanaSend(RPC, USDT_INTENT), PRIV)
	}

	test('éxito, ya procesada = duplicado, blockhash caducado = SolanaExpiredError', async () => {
		const signed = await signedFor()
		mockRpc({ send: (_p, { ok }) => ok(signed.txid) })
		await expect(broadcastSolanaTransaction(RPC, signed)).resolves.toEqual({ txid: signed.txid, duplicate: false })
		expect(calls[0].params[1]).toMatchObject({ encoding: 'base64', preflightCommitment: 'confirmed' })

		mockRpc({ send: (_p, { fail }) => fail('Transaction simulation failed: This transaction has already been processed') })
		await expect(broadcastSolanaTransaction(RPC, signed)).resolves.toEqual({ txid: signed.txid, duplicate: true })

		mockRpc({ send: (_p, { fail }) => fail('Transaction simulation failed: Blockhash not found') })
		await expect(broadcastSolanaTransaction(RPC, signed)).rejects.toBeInstanceOf(SolanaExpiredError)
	})
})
