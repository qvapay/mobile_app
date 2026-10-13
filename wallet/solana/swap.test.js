/**
 * @jest-environment node
 *
 * Swap de Jupiter: lo que se firma tiene que ser un swap del PROPIO usuario. Se ataca desde
 * los dos lados: el backend que miente (instrucciones o tablas cambiadas) y la ruta que
 * en la simulación paga de menos o gasta de más.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { base58 } from '@scure/base'
import {
	associatedTokenAddress,
	compileV0Message,
	createAssociatedTokenAccountIdempotentIx,
	deserializeTransactionV0,
	encodeBase58,
	fromBase64,
	setComputeUnitPriceIx,
	systemTransferIx,
	toBase64,
	u64le,
	TOKEN_PROGRAM,
} from './codec'
import {
	assembleInstructions,
	checkSimulatedBalances,
	prepareSolanaSwap,
	signSolanaSwap,
	verifySwapInstructions,
	JUPITER_PROGRAM,
	MAX_COMPUTE_UNITS,
	WSOL_MINT,
} from './swap'

const seed = Uint8Array.from({ length: 32 }, (_, i) => (i * 13 + 5) & 0xff)
const OWNER = encodeBase58(ed25519.getPublicKey(seed))
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const BLOCKHASH = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const ATTACKER = 'GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9'
const POOL = ['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'F82bQDMeZaUvRUJe73uw6K5y5Nf7zUUPqPcALBE3AfgZ', 'EPVnmU33CC16WmHeTkz45g2fzH6bY9WAyqBfA9FJgB8p']
const TABLE_KEY = '7KEAnoRWpkW5XLrDFTnQjJmVPqDPrJ9hL9w4kSqPWDuS'

const wsol = associatedTokenAddress(OWNER, WSOL_MINT)
const usdcAta = associatedTokenAddress(OWNER, USDC)

const raw = (ix) => ({ programId: ix.programId, accounts: ix.keys, data: toBase64(ix.data) })
const swapIx = (extra = []) => ({
	programId: JUPITER_PROGRAM,
	keys: [
		{ pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: OWNER, isSigner: true, isWritable: false },
		{ pubkey: wsol, isSigner: false, isWritable: true },
		{ pubkey: usdcAta, isSigner: false, isWritable: true },
		...POOL.map(pubkey => ({ pubkey, isSigner: false, isWritable: true })),
		...extra,
	],
	data: Uint8Array.of(0xe5, 0x17, 0xcb, 0x97, 1, 2, 3),
})

/** 0,1 SOL → USDC con la forma real de `/build`: wrap, ATA de salida, swap, cierre del wSOL. */
const buildSolToUsdc = ({ setup, swap, cleanup } = {}) => ({
	instructions: {
		computeBudget: [raw(setComputeUnitPriceIx(10_000n))],
		setup: setup ?? [
			raw(createAssociatedTokenAccountIdempotentIx(OWNER, OWNER, WSOL_MINT)),
			raw(systemTransferIx(OWNER, wsol, 100_000_000n)),
			{ programId: TOKEN_PROGRAM, accounts: [{ pubkey: wsol, isSigner: false, isWritable: true }], data: toBase64(Uint8Array.of(17)) },
			raw(createAssociatedTokenAccountIdempotentIx(OWNER, OWNER, USDC)),
		],
		swap: swap ?? raw(swapIx()),
		cleanup: cleanup === undefined
			? { programId: TOKEN_PROGRAM, accounts: [{ pubkey: wsol, isSigner: false, isWritable: true }, { pubkey: OWNER, isSigner: false, isWritable: true }, { pubkey: OWNER, isSigner: true, isWritable: false }], data: toBase64(Uint8Array.of(9)) }
			: cleanup,
		other: [],
	},
	lookupTables: [TABLE_KEY],
})

const INTENT = { owner: OWNER, inputMint: null, outputMint: USDC, amountIn: 100_000_000n, minOut: 10_820_694n }
const TABLE = { key: TABLE_KEY, addresses: POOL }

const compile = (build, tables = [TABLE]) => compileV0Message(OWNER, assembleInstructions(build, 300_000), BLOCKHASH, tables)

describe('verificación estática', () => {

	test('un swap honrado de SOL a USDC pasa, y solo cuenta la renta de la cuenta que queda abierta', () => {
		const check = verifySwapInstructions(compile(buildSolToUsdc()), [TABLE], INTENT)
		expect(check.computeUnitLimit).toBe(300_000)
		expect(check.computeUnitPrice).toBe(10_000n)
		// La de USDC queda; la de wSOL se crea y se cierra en la misma tx
		expect(check.persistentAccounts).toBe(1)
	})

	test('las cuentas de la tabla cuentan como cuentas: el pool va por índice', () => {
		const message = compile(buildSolToUsdc())
		expect(message.addressTableLookups).toHaveLength(1)
		expect(message.addressTableLookups[0].writableIndexes).toHaveLength(3)
	})

	test('un programa desconocido no pasa', () => {
		const build = buildSolToUsdc()
		build.instructions.other = [{ programId: 'Stake11111111111111111111111111111111111111', accounts: [], data: toBase64(Uint8Array.of(1)) }]
		expect(() => verifySwapInstructions(compile(build), [TABLE], INTENT)).toThrow(/programa no permitido/)
	})

	test('mover SOL a otro que no sea el wSOL propio no pasa', () => {
		const setup = buildSolToUsdc().instructions.setup
		setup[1] = raw(systemTransferIx(OWNER, ATTACKER, 100_000_000n))
		expect(() => verifySwapInstructions(compile(buildSolToUsdc({ setup })), [TABLE], INTENT)).toThrow(/fuera de la wallet/)
	})

	test('envolver más SOL del pedido no pasa', () => {
		const setup = buildSolToUsdc().instructions.setup
		setup[1] = raw(systemTransferIx(OWNER, wsol, 100_000_001n))
		expect(() => verifySwapInstructions(compile(buildSolToUsdc({ setup })), [TABLE], INTENT)).toThrow(/más SOL/)
	})

	test('cerrar el wSOL devolviendo el SOL a otro no pasa', () => {
		const cleanup = { programId: TOKEN_PROGRAM, accounts: [{ pubkey: wsol, isSigner: false, isWritable: true }, { pubkey: ATTACKER, isSigner: false, isWritable: true }, { pubkey: OWNER, isSigner: true, isWritable: false }], data: toBase64(Uint8Array.of(9)) }
		expect(() => verifySwapInstructions(compile(buildSolToUsdc({ cleanup })), [TABLE], INTENT)).toThrow(/otro destino/)
	})

	test('una transferencia o un approve de token fuera de Jupiter no pasan', () => {
		for (const tag of [3, 4, 6, 12]) {
			const cleanup = { programId: TOKEN_PROGRAM, accounts: [{ pubkey: usdcAta, isSigner: false, isWritable: true }, { pubkey: ATTACKER, isSigner: false, isWritable: true }, { pubkey: OWNER, isSigner: true, isWritable: false }], data: toBase64(Uint8Array.of(tag, ...u64le(1n))) }
			expect(() => verifySwapInstructions(compile(buildSolToUsdc({ cleanup })), [TABLE], INTENT)).toThrow(/token no permitida/)
		}
	})

	test('crear una cuenta de token para otro no pasa', () => {
		const setup = buildSolToUsdc().instructions.setup
		setup[3] = raw(createAssociatedTokenAccountIdempotentIx(OWNER, ATTACKER, USDC))
		expect(() => verifySwapInstructions(compile(buildSolToUsdc({ setup })), [TABLE], INTENT)).toThrow(/creada para otro/)
	})

	test('un segundo firmante no pasa', () => {
		const swap = raw(swapIx([{ pubkey: ATTACKER, isSigner: true, isWritable: false }]))
		expect(() => verifySwapInstructions(compile(buildSolToUsdc({ swap })), [TABLE], INTENT)).toThrow(/más firmantes/)
	})

	test('dos swaps no pasan', () => {
		const build = buildSolToUsdc()
		build.instructions.other = [raw(swapIx())]
		expect(() => verifySwapInstructions(compile(build), [TABLE], INTENT)).toThrow(/exactamente un swap/)
	})

	test('una prioridad desorbitada no pasa', () => {
		const build = buildSolToUsdc()
		build.instructions.computeBudget = [raw(setComputeUnitPriceIx(10_000_000n))]
		expect(() => verifySwapInstructions(compile(build), [TABLE], INTENT)).toThrow(/prioridad/)
	})

	test('el wrap de SOL en un swap que sale de un token no pasa', () => {
		expect(() => verifySwapInstructions(compile(buildSolToUsdc()), [TABLE], { ...INTENT, inputMint: USDC })).toThrow(/no sale de SOL/)
	})
})

describe('saldos de la simulación', () => {

	const before = { lamports: 1_000_000_000n, input: 0n, output: 5_000_000n }

	test('recibir el mínimo y gastar lo pedido pasa', () => {
		const after = { lamports: 1_000_000_000n - 100_000_000n - 20_000n - 1_488_440n, input: 0n, output: 5_000_000n + 10_875_069n }
		expect(checkSimulatedBalances({ intent: INTENT, before, after, feeLamports: 20_000n, rentLamports: 1_488_440n })).toBe(10_875_069n)
	})

	test('recibir menos del mínimo garantizado no pasa', () => {
		const after = { lamports: 900_000_000n, input: 0n, output: 5_000_000n + 10_000_000n }
		expect(() => checkSimulatedBalances({ intent: INTENT, before, after, feeLamports: 20_000n, rentLamports: 0n })).toThrow(/menos del mínimo/)
	})

	test('gastar más SOL del pedido no pasa, aunque reciba bien', () => {
		const after = { lamports: 1_000_000_000n - 200_000_000n, input: 0n, output: 5_000_000n + 10_875_069n }
		expect(() => checkSimulatedBalances({ intent: INTENT, before, after, feeLamports: 20_000n, rentLamports: 1_488_440n })).toThrow(/más SOL/)
	})

	test('de token a SOL: lo recibido se mide en el SOL del usuario, neto de comisión', () => {
		const intent = { owner: OWNER, inputMint: USDC, outputMint: null, amountIn: 10_000_000n, minOut: 90_000_000n }
		const b = { lamports: 50_000_000n, input: 10_000_000n, output: 0n }
		expect(checkSimulatedBalances({ intent, before: b, after: { lamports: 50_000_000n + 91_000_000n - 20_000n, input: 0n, output: 0n }, feeLamports: 20_000n, rentLamports: 0n })).toBe(91_000_000n)
		expect(() => checkSimulatedBalances({ intent, before: b, after: { lamports: 50_000_000n + 91_000_000n, input: 0n - 1n, output: 0n }, feeLamports: 20_000n, rentLamports: 0n })).toThrow(/más token/)
	})
})

describe('preparar y firmar contra un nodo simulado', () => {

	const tableData = () => {
		const meta = new Uint8Array(56)
		meta[0] = 1
		return toBase64(Uint8Array.from([...meta, ...POOL.flatMap(a => Array.from(base58.decode(a)))]))
	}
	const tokenAccount = (amount) => {
		const data = new Uint8Array(165)
		data.set(u64le(amount), 64)
		return { lamports: 1_488_440, data: [toBase64(data), 'base64'] }
	}

	const mockRpc = ({ table = tableData(), received = 10_875_069n, err = null, unitsConsumed = 150_000 } = {}) => {
		const calls = []
		global.fetch = jest.fn(async (_url, init) => {
			const { method, params, id } = JSON.parse(init.body)
			calls.push({ method, params })
			const reply = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, result }), text: async () => JSON.stringify({ jsonrpc: '2.0', id, result }) })
			if (method === 'getLatestBlockhash') return reply({ value: { blockhash: BLOCKHASH, lastValidBlockHeight: 100 } })
			if (method === 'getMinimumBalanceForRentExemption') return reply(1_488_440)
			if (method === 'getMultipleAccounts') {
				const [keys] = params
				if (keys[0] === TABLE_KEY) return reply({ value: [table ? { data: [table, 'base64'] } : null] })
				return reply({ value: [{ lamports: 1_000_000_000, data: ['', 'base64'] }, tokenAccount(5_000_000n)] })
			}
			if (method === 'simulateTransaction') {
				return reply({ value: { err, logs: ['Program log: x'], unitsConsumed, accounts: [{ lamports: 1_000_000_000 - 100_000_000 - 19_000 - 1_488_440, data: ['', 'base64'] }, tokenAccount(5_000_000n + received)] } })
			}
			throw new Error(`método inesperado ${method}`)
		})
		return calls
	}
	afterEach(() => { delete global.fetch })
	const RPC = { url: 'https://rpc.test', priority: 0 }

	test('compila con la tabla DE LA CADENA, simula, ajusta el cómputo y firma lo verificado', async () => {
		const calls = mockRpc()
		const prepared = await prepareSolanaSwap(RPC, buildSolToUsdc(), INTENT, { now: () => 0 })
		expect(prepared.computeUnitLimit).toBe(180_000)
		expect(prepared.simulatedOut).toBe(10_875_069n)
		expect(prepared.expiresAt).toBe(60_000)
		const sim = calls.find(c => c.method === 'simulateTransaction')
		expect(sim.params[1]).toMatchObject({ sigVerify: false, encoding: 'base64' })
		expect(sim.params[1].accounts.addresses).toEqual([OWNER, usdcAta])

		const signed = signSolanaSwap(prepared, seed)
		const tx = deserializeTransactionV0(fromBase64(signed.base64))
		expect(ed25519.verify(tx.signatures[0], tx.messageBytes, ed25519.getPublicKey(seed))).toBe(true)
		expect(signed.txid).toBe(encodeBase58(tx.signatures[0]))
	})

	test('una tabla que no existe en la cadena no se adivina', async () => {
		mockRpc({ table: null })
		await expect(prepareSolanaSwap(RPC, buildSolToUsdc(), INTENT)).rejects.toThrow(/no existe/)
	})

	test('si la simulación paga de menos, no se firma nada', async () => {
		mockRpc({ received: 1n })
		await expect(prepareSolanaSwap(RPC, buildSolToUsdc(), INTENT)).rejects.toThrow(/menos del mínimo/)
	})

	test('si la simulación falla, se dice por qué', async () => {
		mockRpc({ err: { InstructionError: [4, { Custom: 6001 }] } })
		await expect(prepareSolanaSwap(RPC, buildSolToUsdc(), INTENT)).rejects.toThrow(/simulación del swap falló/)
	})

	test('el límite de cómputo nunca pasa del tope de la red', async () => {
		mockRpc({ unitsConsumed: 1_390_000 })
		const prepared = await prepareSolanaSwap(RPC, buildSolToUsdc(), INTENT)
		expect(prepared.computeUnitLimit).toBe(MAX_COMPUTE_UNITS)
	})

	test('firmar con otra clave no pasa', async () => {
		mockRpc()
		const prepared = await prepareSolanaSwap(RPC, buildSolToUsdc(), INTENT)
		expect(() => signSolanaSwap(prepared, new Uint8Array(32).fill(9))).toThrow(/no es la del usuario/)
	})
})
