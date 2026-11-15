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
	concat,
	createAssociatedTokenAccountIdempotentIx,
	deserializeTransactionV0,
	encodeBase58,
	fromBase64,
	pubkeyBytes,
	setComputeUnitPriceIx,
	systemTransferIx,
	toBase64,
	u64le,
	SYSTEM_PROGRAM,
	TOKEN_PROGRAM,
	TOKEN_2022_PROGRAM,
} from './codec'
import JUPITER_VECTORS from './jupiterVectors.json'
import {
	assembleInstructions,
	checkSimulatedBalances,
	checkUserTokenAccounts,
	isTokenAccountOf,
	prepareSolanaSwap,
	signSolanaSwap,
	swapAccounts,
	userAccounts,
	verifyJupiterInstruction,
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
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const POOL = ['7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5', 'F82bQDMeZaUvRUJe73uw6K5y5Nf7zUUPqPcALBE3AfgZ', 'EPVnmU33CC16WmHeTkz45g2fzH6bY9WAyqBfA9FJgB8p']
const TABLE_KEY = '7KEAnoRWpkW5XLrDFTnQjJmVPqDPrJ9hL9w4kSqPWDuS'

const wsol = associatedTokenAddress(OWNER, WSOL_MINT)
const usdcAta = associatedTokenAddress(OWNER, USDC)

const raw = (ix) => ({ programId: ix.programId, accounts: ix.keys, data: toBase64(ix.data) })

// Las dos instrucciones que devuelve `/swap/v2/build`, con la forma de las reales (ver `jupiterVectors.json`)
const ROUTE_V2 = Uint8Array.of(0xbb, 0x64, 0xfa, 0xcc, 0x31, 0xc4, 0xaf, 0x14)
const SHARED_ROUTE_V2 = Uint8Array.of(0xd1, 0x98, 0x53, 0x93, 0x7c, 0xfe, 0xd8, 0xe9)
const EVENT_AUTHORITY = 'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf'
const PROGRAM_AUTHORITY = 'GGztQqQ6pCPaJQnNpXBgELr5cs3WwDakRbh1iEMzjgSJ'
const u16le = (n) => Uint8Array.of(n % 256, Math.floor(n / 256))
const ro = (pubkey) => ({ pubkey, isSigner: false, isWritable: false })
const rw = (pubkey) => ({ pubkey, isSigner: false, isWritable: true })
/** in_amount · quoted_out_amount · slippage_bps · comisiones · un tramo. */
const routeArgs = ({ amountIn, quotedOut, slippageBps = 50 }) => concat(u64le(amountIn), u64le(quotedOut), u16le(slippageBps), u16le(0), u16le(0), Uint8Array.of(1, 0, 0, 0, 0xc3, 0x10, 0x27, 0, 1))
/**
 * La instrucción de Jupiter para `intent`. Por defecto cotiza lo justo para que el mínimo que
 * hace cumplir sea el del intent. `change(keys)` deja tocar las cuentas ya puestas.
 */
const swapIx = (extra = [], { intent, shared = false, amountIn, quotedOut, slippageBps, change } = {}) => {
	const of = intent ?? INTENT
	const a = swapAccounts(of)
	const args = routeArgs({ amountIn: amountIn ?? of.amountIn, quotedOut: quotedOut ?? (of.minOut * 10_000n) / 9_950n + 1n, slippageBps })
	const keys = shared
		? [ro(PROGRAM_AUTHORITY), { pubkey: of.owner, isSigner: true, isWritable: false }, rw(a.source), rw(POOL[0]), rw(POOL[1]), rw(a.destination), ro(a.sourceMint), ro(a.destinationMint), ro(a.sourceProgram), ro(a.destinationProgram), ro(EVENT_AUTHORITY), ro(JUPITER_PROGRAM)]
		: [{ pubkey: of.owner, isSigner: true, isWritable: false }, rw(a.source), rw(a.destination), ro(a.sourceMint), ro(a.destinationMint), ro(a.sourceProgram), ro(a.destinationProgram), ro(JUPITER_PROGRAM), ro(EVENT_AUTHORITY), ro(JUPITER_PROGRAM)]
	keys.push(...POOL.map(rw), ...extra)
	change?.(keys)
	return { programId: JUPITER_PROGRAM, keys, data: shared ? concat(SHARED_ROUTE_V2, Uint8Array.of(0), args) : concat(ROUTE_V2, args) }
}

/** Una cuenta de token como la devuelve el nodo: programa dueño, y dentro mint, dueño, saldo, delegado y autoridad de cierre. */
const tokenAccount = (amount, { owner = OWNER, program = TOKEN_PROGRAM, delegate = null, closeAuthority = null } = {}) => {
	const data = new Uint8Array(165)
	data.set(pubkeyBytes(owner), 32)
	data.set(u64le(amount), 64)
	if (delegate) { data[72] = 1; data.set(pubkeyBytes(delegate), 76); data.set(u64le(amount), 121) }
	if (closeAuthority) { data[129] = 1; data.set(pubkeyBytes(closeAuthority), 133) }
	return { lamports: 1_488_440, owner: program, data: [toBase64(data), 'base64'] }
}
const systemAccount = (lamports) => ({ lamports, owner: SYSTEM_PROGRAM, data: ['', 'base64'] })

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

const compile = (build, tables = [TABLE], intent = INTENT) => compileV0Message(OWNER, assembleInstructions(build, 300_000), BLOCKHASH, tables, userAccounts(build, intent))

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
		const fromUsdc = { ...INTENT, inputMint: USDC, outputMint: USDT }
		const build = buildSolToUsdc({ swap: raw(swapIx([], { intent: fromUsdc })) })
		expect(() => verifySwapInstructions(compile(build, [TABLE], fromUsdc), [TABLE], fromUsdc)).toThrow(/no sale de SOL/)
	})
})

// O-01: la instrucción de Jupiter era opaca y solo se contaba. Lo que dice de sí misma va en posiciones fijas
describe('la instrucción de Jupiter', () => {
	const FROM_USDC = { owner: OWNER, inputMint: USDC, outputMint: null, amountIn: 20_000_000n, minOut: 286_439_184n }
	const check = (options, intent = INTENT) => verifyJupiterInstruction(swapIx([], options), intent)

	test('las dos que devuelve `/build` se leen: de dónde sale, a dónde paga, cuánto y con qué mínimo', () => {
		expect(check({ quotedOut: 10_875_069n })).toEqual({ instruction: 'route_v2', source: wsol, destination: usdcAta, minOut: 10_820_694n })
		expect(check({ shared: true, quotedOut: 10_875_069n })).toEqual({ instruction: 'shared_accounts_route_v2', source: wsol, destination: usdcAta, minOut: 10_820_694n })
		// De token a SOL: sale de la cuenta del token y paga al wSOL del usuario
		expect(check({ intent: FROM_USDC }, FROM_USDC)).toMatchObject({ source: usdcAta, destination: wsol })
	})

	test('otra instrucción del programa (las viejas, las de importe exacto de salida) no se firma', () => {
		const old = swapIx()
		old.data = concat(Uint8Array.of(0xe5, 0x17, 0xcb, 0x97, 0x7a, 0xe3, 0xad, 0x2a), old.data.slice(8))
		expect(() => verifyJupiterInstruction(old, INTENT)).toThrow(/no sabe leer/)
		expect(() => verifyJupiterInstruction({ ...swapIx(), data: ROUTE_V2 }, INTENT)).toThrow(/incompleta/)
		expect(() => verifyJupiterInstruction({ ...swapIx(), keys: swapIx().keys.slice(0, 9) }, INTENT)).toThrow(/incompleta/)
	})

	// El caso del hallazgo: «0,1 SOL → USDC» que en realidad saca de la cuenta de USDT del usuario
	test('sale de la cuenta del token de entrada del usuario, no de otra suya', () => {
		const usdtAta = associatedTokenAddress(OWNER, USDT)
		expect(() => check({ change: (keys) => { keys[1] = rw(usdtAta) } })).toThrow(/no sale de la cuenta del usuario/)
		expect(() => check({ shared: true, change: (keys) => { keys[2] = rw(usdtAta) } })).toThrow(/no sale de la cuenta del usuario/)
		expect(() => check({ change: (keys) => { keys[3] = ro(USDT) } })).toThrow(/otro par/)
	})

	test('paga a la cuenta del token de salida del usuario, no a la de otro', () => {
		const theirs = associatedTokenAddress(ATTACKER, USDC)
		expect(() => check({ change: (keys) => { keys[2] = rw(theirs) } })).toThrow(/no paga a la cuenta del usuario/)
		expect(() => check({ shared: true, change: (keys) => { keys[5] = rw(theirs) } })).toThrow(/no paga a la cuenta del usuario/)
		// `route_v2` admite una cuenta de destino aparte: o no se usa (va el propio programa) o es la del usuario
		expect(() => check({ change: (keys) => { keys[7] = rw(theirs) } })).toThrow(/paga a otra cuenta/)
		expect(check({ change: (keys) => { keys[7] = rw(usdcAta) } }).destination).toBe(usdcAta)
		expect(() => check({ change: (keys) => { keys[4] = ro(USDT) } })).toThrow(/otro par/)
	})

	test('por el importe exacto, y con un mínimo que el programa hace cumplir', () => {
		expect(() => check({ amountIn: 100_000_001n })).toThrow(/otro importe/)
		expect(() => check({ amountIn: 99_999_999n })).toThrow(/otro importe/)
		// Cotizar de menos, o con un deslizamiento enorme, deja el mínimo por debajo del prometido
		expect(() => check({ quotedOut: 10_800_000n })).toThrow(/garantiza menos del mínimo/)
		expect(() => check({ quotedOut: 10_875_069n, slippageBps: 5_000 })).toThrow(/garantiza menos del mínimo/)
		expect(() => check({ quotedOut: 10_875_069n, slippageBps: 10_001 })).toThrow(/deslizamiento imposible/)
		// Redondeado hacia arriba, como `otherAmountThreshold`: 10.875.069 × 0,995 = 10.820.693,66
		expect(check({ quotedOut: 10_875_069n }).minOut).toBe(10_820_694n)
	})

	test('quien autoriza es el usuario, y firmando', () => {
		expect(() => check({ change: (keys) => { keys[0] = { pubkey: ATTACKER, isSigner: true, isWritable: false } } })).toThrow(/no es el usuario/)
		expect(() => check({ change: (keys) => { keys[0] = ro(OWNER) } })).toThrow(/no es el usuario/)
		expect(() => check({ change: (keys) => { keys[5] = ro(TOKEN_2022_PROGRAM) } })).toThrow(/otro programa de token/)
	})

	// Con cuentas compartidas los tramos los firma el programa: el usuario solo hace falta para sacar la entrada
	test('con cuentas compartidas el usuario no aparece en los tramos; en `route_v2` sí puede (son suyos)', () => {
		const inLeg = [{ pubkey: OWNER, isSigner: true, isWritable: false }]
		expect(() => verifyJupiterInstruction(swapIx(inLeg, { shared: true }), INTENT)).toThrow(/algo más que la entrada/)
		expect(verifyJupiterInstruction(swapIx(inLeg), INTENT).instruction).toBe('route_v2')
		// Pero no entre las cuentas fijas
		expect(() => check({ change: (keys) => { keys[8] = { pubkey: OWNER, isSigner: true, isWritable: false } } })).toThrow(/algo más que la entrada/)
	})

	// Builds REALES de `/swap/v2/build` (14 nov 2026) para 9WzD…AWWM, con sus tablas
	describe('con builds reales', () => {
		const TAKER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
		const intentOf = (v) => ({ owner: TAKER, inputMint: v.inputMint, outputMint: v.outputMint, amountIn: BigInt(v.inAmount), minOut: BigInt(v.otherAmountThreshold) })
		const messageOf = (v, build = v.build) => compileV0Message(TAKER, assembleInstructions(build, 300_000), BLOCKHASH, v.tables, userAccounts(build, intentOf(v)))

		test.each([['routeTokenToSol', 'route_v2'], ['sharedSolToToken', 'shared_accounts_route_v2']])('%s pasa entero, y el mínimo que lleva es el que anuncia Jupiter', (name, instruction) => {
			const v = JUPITER_VECTORS[name]
			const result = verifySwapInstructions(messageOf(v), v.tables, intentOf(v))
			expect(result.jupiter).toMatchObject({ instruction, minOut: BigInt(v.otherAmountThreshold) })
			expect(result.closesWsol).toBe(true)
		})

		test('el mismo build con el destino cambiado, o prometiendo más mínimo del que lleva, no pasa', () => {
			const v = JUPITER_VECTORS.sharedSolToToken
			const forged = JSON.parse(JSON.stringify(v.build))
			forged.instructions.swap.accounts[5].pubkey = associatedTokenAddress(ATTACKER, USDT)
			expect(() => verifySwapInstructions(messageOf(v, forged), v.tables, intentOf(v))).toThrow(/no paga a la cuenta del usuario/)
			expect(() => verifySwapInstructions(messageOf(v), v.tables, { ...intentOf(v), minOut: BigInt(v.otherAmountThreshold) + 1n })).toThrow(/garantiza menos del mínimo/)
		})
	})
})

// O-07: el contenido de una tabla lo dice el nodo. Una cuenta del usuario referenciada por índice sería,
// en la cadena, la que la tabla tenga DE VERDAD en ese índice
describe('las cuentas del usuario no van por tabla', () => {
	const LYING_TABLE = { key: TABLE_KEY, addresses: [...POOL, usdcAta, wsol] }

	test('aunque una tabla diga contenerlas, la wallet las compila como claves estáticas', () => {
		const message = compile(buildSolToUsdc(), [LYING_TABLE])
		expect(message.staticAccountKeys).toEqual(expect.arrayContaining([OWNER, usdcAta, wsol]))
		expect(message.addressTableLookups[0].writableIndexes).toEqual([0, 1, 2])
		expect(verifySwapInstructions(message, [LYING_TABLE], INTENT).jupiter.destination).toBe(usdcAta)
	})

	test('y un mensaje que las lleve por índice no se firma', () => {
		const byIndex = compileV0Message(OWNER, assembleInstructions(buildSolToUsdc(), 300_000), BLOCKHASH, [LYING_TABLE])
		expect(byIndex.staticAccountKeys).not.toContain(usdcAta)
		expect(() => verifySwapInstructions(byIndex, [LYING_TABLE], INTENT)).toThrow(/llega por una lookup table/)
	})
})

describe('xStocks (Token-2022)', () => {

	const TSLAX = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB'
	const tslaxAta = associatedTokenAddress(OWNER, TSLAX, TOKEN_2022_PROGRAM)
	const STOCK_INTENT = { owner: OWNER, inputMint: USDC, outputMint: TSLAX, outputProgram: TOKEN_2022_PROGRAM, amountIn: 5_000_000n, minOut: 1_366_906n }
	// USDC → TSLAx con la forma real de /swap-instructions (2026-10-14): solo crea la ATA Token-2022 de salida
	const buildUsdcToTslax = (setup) => ({
		instructions: {
			computeBudget: [raw(setComputeUnitPriceIx(10_000n))],
			setup: setup ?? [raw(createAssociatedTokenAccountIdempotentIx(OWNER, OWNER, TSLAX, TOKEN_2022_PROGRAM))],
			swap: raw(swapIx([], { intent: STOCK_INTENT })),
			cleanup: null,
			other: [],
		},
		lookupTables: [TABLE_KEY],
	})
	const compileStock = (build) => compile(build, [TABLE], STOCK_INTENT)

	test('el swap de un xStock usa el programa Token-2022 y la cuenta asociada de ese programa', () => {
		expect(verifyJupiterInstruction(swapIx([], { intent: STOCK_INTENT }), STOCK_INTENT).destination).toBe(tslaxAta)
		// Con el intent sin marcar Token-2022 la cuenta esperada es otra: falla cerrado
		expect(() => verifyJupiterInstruction(swapIx([], { intent: STOCK_INTENT }), { ...STOCK_INTENT, outputProgram: undefined })).toThrow(/no paga a la cuenta del usuario/)
	})

	test('comprar un xStock: la ATA Token-2022 del propio usuario pasa y cuenta como cuenta 2022', () => {
		const check = verifySwapInstructions(compileStock(buildUsdcToTslax()), [TABLE], STOCK_INTENT)
		expect(check.persistentAccounts).toBe(1)
		expect(check.persistent2022).toBe(1)
	})

	test('una ATA Token-2022 para otro dueño, o que no es la asociada, no pasa', () => {
		const forOther = [raw(createAssociatedTokenAccountIdempotentIx(OWNER, ATTACKER, TSLAX, TOKEN_2022_PROGRAM))]
		expect(() => verifySwapInstructions(compileStock(buildUsdcToTslax(forOther)), [TABLE], STOCK_INTENT)).toThrow(/creada para otro/)
		// ATA del programa clásico declarada con Token-2022 como programa: la dirección no casa
		const mismatched = raw(createAssociatedTokenAccountIdempotentIx(OWNER, OWNER, TSLAX, TOKEN_2022_PROGRAM))
		mismatched.accounts[1] = { ...mismatched.accounts[1], pubkey: associatedTokenAddress(OWNER, TSLAX) }
		expect(() => verifySwapInstructions(compileStock(buildUsdcToTslax([mismatched])), [TABLE], STOCK_INTENT)).toThrow(/no es la asociada/)
	})

	test('una instrucción DIRECTA de Token-2022 fuera de Jupiter no pasa', () => {
		const direct = { programId: TOKEN_2022_PROGRAM, accounts: [{ pubkey: tslaxAta, isSigner: false, isWritable: true }], data: toBase64(Uint8Array.of(17)) }
		expect(() => verifySwapInstructions(compileStock(buildUsdcToTslax([direct])), [TABLE], STOCK_INTENT)).toThrow(/programa no permitido/)
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

	// La tx cierra su wSOL y le devuelve el SOL: vaciárselo por un tramo es gastarle SOL
	test('el wSOL que el usuario ya tenía cuenta como SOL suyo', () => {
		const held = { lamports: 1_000_000_000n, wsol: 400_000_000n, input: 0n, output: 5_000_000n }
		// Honrado: al cerrarse la cuenta, sus 0,4 SOL envueltos vuelven como SOL
		const honest = { lamports: 1_000_000_000n + 400_000_000n - 100_000_000n - 20_000n - 1_488_440n, wsol: 0n, input: 0n, output: 5_000_000n + 10_875_069n }
		expect(checkSimulatedBalances({ intent: INTENT, before: held, after: honest, feeLamports: 20_000n, rentLamports: 1_488_440n })).toBe(10_875_069n)
		// Un tramo se llevó el wSOL: el SOL del usuario solo baja lo previsto, pero el envuelto ya no está
		const drained = { lamports: 1_000_000_000n - 100_000_000n - 20_000n - 1_488_440n, wsol: 0n, input: 0n, output: 5_000_000n + 10_875_069n }
		expect(() => checkSimulatedBalances({ intent: INTENT, before: held, after: drained, feeLamports: 20_000n, rentLamports: 1_488_440n })).toThrow(/más SOL/)
	})

	test('de token a SOL: lo recibido se mide en el SOL del usuario, neto de comisión', () => {
		const intent = { owner: OWNER, inputMint: USDC, outputMint: null, amountIn: 10_000_000n, minOut: 90_000_000n }
		const b = { lamports: 50_000_000n, input: 10_000_000n, output: 0n }
		expect(checkSimulatedBalances({ intent, before: b, after: { lamports: 50_000_000n + 91_000_000n - 20_000n, input: 0n, output: 0n }, feeLamports: 20_000n, rentLamports: 0n })).toBe(91_000_000n)
		expect(() => checkSimulatedBalances({ intent, before: b, after: { lamports: 50_000_000n + 91_000_000n, input: 0n - 1n, output: 0n }, feeLamports: 20_000n, rentLamports: 0n })).toThrow(/más token/)
	})
})

describe('las cuentas de token del usuario, antes y después', () => {
	const usdtAta = associatedTokenAddress(OWNER, USDT)
	const run = (accounts, closesWsol = true, intent = INTENT) => checkUserTokenAccounts({ intent, accounts, closesWsol })

	test('saber cuáles son suyas: programa de token y el campo de dueño', () => {
		expect(isTokenAccountOf(tokenAccount(1n), OWNER)).toBe(true)
		expect(isTokenAccountOf(tokenAccount(1n, { program: TOKEN_2022_PROGRAM }), OWNER)).toBe(true)
		expect(isTokenAccountOf(tokenAccount(1n, { owner: ATTACKER }), OWNER)).toBe(false)
		// Los mismos bytes en una cuenta de otro programa no son una cuenta de token
		expect(isTokenAccountOf(tokenAccount(1n, { program: JUPITER_PROGRAM }), OWNER)).toBe(false)
		expect(isTokenAccountOf(systemAccount(5), OWNER)).toBe(false)
		expect(isTokenAccountOf(null, OWNER)).toBe(false)
	})

	test('las que no se tocan, suben o se crean dentro de la tx pasan', () => {
		expect(() => run([
			{ address: usdtAta, before: tokenAccount(7n), after: tokenAccount(7n) },
			{ address: usdcAta, before: tokenAccount(5n), after: tokenAccount(9n) },
			{ address: associatedTokenAddress(OWNER, POOL[2]), before: null, after: tokenAccount(0n) },
			{ address: associatedTokenAddress(OWNER, POOL[1]), before: null, after: null },
		])).not.toThrow()
	})

	test('su wSOL puede cerrarse solo si la tx lo cierra devolviéndole el SOL', () => {
		expect(() => run([{ address: wsol, before: tokenAccount(3n), after: null }], true)).not.toThrow()
		expect(() => run([{ address: wsol, before: tokenAccount(3n), after: null }], false)).toThrow(/cierra una cuenta de token tuya/)
	})

	test('la de entrada puede bajar (lo acota el otro control); cualquier otra, no', () => {
		const fromUsdc = { owner: OWNER, inputMint: USDC, outputMint: USDT, amountIn: 5n, minOut: 1n }
		expect(() => run([{ address: usdcAta, before: tokenAccount(9n), after: tokenAccount(4n) }], false, fromUsdc)).not.toThrow()
		expect(() => run([{ address: usdtAta, before: tokenAccount(9n), after: tokenAccount(8n) }], false, fromUsdc)).toThrow(/no es el del swap/)
	})

	test('un delegado o una autoridad de cierre que ya estaban no cuentan; uno nuevo o distinto, sí', () => {
		const granted = tokenAccount(7n, { delegate: POOL[0] })
		expect(() => run([{ address: usdtAta, before: granted, after: tokenAccount(7n, { delegate: POOL[0] }) }])).not.toThrow()
		// Quitarlo no es un problema
		expect(() => run([{ address: usdtAta, before: granted, after: tokenAccount(7n) }])).not.toThrow()
		expect(() => run([{ address: usdtAta, before: granted, after: tokenAccount(7n, { delegate: ATTACKER }) }])).toThrow(/permisos para otro/)
		expect(() => run([{ address: usdtAta, before: tokenAccount(7n), after: tokenAccount(7n, { closeAuthority: ATTACKER }) }])).toThrow(/permisos para otro/)
		// También en una que la tx crea
		expect(() => run([{ address: usdtAta, before: null, after: tokenAccount(7n, { delegate: ATTACKER }) }])).toThrow(/permisos para otro/)
	})
})

describe('preparar y firmar contra un nodo simulado', () => {

	const tableData = () => {
		const meta = new Uint8Array(56)
		meta[0] = 1
		return toBase64(Uint8Array.from([...meta, ...POOL.flatMap(a => Array.from(base58.decode(a)))]))
	}
	const usdtAta = associatedTokenAddress(OWNER, USDT)
	/** Lo que hay en la cadena antes, y lo que la simulación dice que queda. `null` = la cuenta no existe. */
	const mockRpc = ({ table = tableData(), received = 10_875_069n, err = null, unitsConsumed = 150_000, before = {}, after = {}, short = false } = {}) => {
		const calls = []
		const stateBefore = { [OWNER]: systemAccount(1_000_000_000), [usdcAta]: tokenAccount(5_000_000n), ...before }
		const stateAfter = { [OWNER]: systemAccount(1_000_000_000 - 100_000_000 - 19_000 - 1_488_440), [usdcAta]: tokenAccount(5_000_000n + received), ...after }
		global.fetch = jest.fn(async (_url, init) => {
			const { method, params, id } = JSON.parse(init.body)
			calls.push({ method, params })
			const reply = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, result }), text: async () => JSON.stringify({ jsonrpc: '2.0', id, result }) })
			if (method === 'getLatestBlockhash') return reply({ value: { blockhash: BLOCKHASH, lastValidBlockHeight: 100 } })
			if (method === 'getMinimumBalanceForRentExemption') return reply(1_488_440)
			if (method === 'getMultipleAccounts') {
				const [keys] = params
				if (keys[0] === TABLE_KEY) return reply({ value: [table ? { data: [table, 'base64'] } : null] })
				return reply({ value: keys.map(key => stateBefore[key] ?? null) })
			}
			if (method === 'simulateTransaction') {
				const accounts = params[1].accounts.addresses.map(key => stateAfter[key] ?? null)
				return reply({ value: { err, logs: ['Program log: x'], unitsConsumed, accounts: short ? accounts.slice(1) : accounts } })
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
		// El usuario, la cuenta de salida y su wSOL (que la tx crea y cierra)
		expect(sim.params[1].accounts.addresses).toEqual([OWNER, usdcAta, wsol])
		// El antes se lee en lotes y con el mismo compromiso que la simulación
		const reads = calls.filter(c => c.method === 'getMultipleAccounts' && c.params[0][0] !== TABLE_KEY)
		expect(reads.every(c => c.params[0].length <= 16 && c.params[1].commitment === 'confirmed')).toBe(true)
		expect(reads.flatMap(c => c.params[0])).toEqual(expect.arrayContaining([OWNER, usdcAta, wsol, ...POOL]))

		const signed = signSolanaSwap(prepared, seed)
		const tx = deserializeTransactionV0(fromBase64(signed.base64))
		expect(ed25519.verify(tx.signatures[0], tx.messageBytes, ed25519.getPublicKey(seed))).toBe(true)
		expect(signed.txid).toBe(encodeBase58(tx.signatures[0]))
	})

	// O-01: la firma del usuario vale para todas sus cuentas de token, y un tramo puede usar cualquiera
	describe('las demás cuentas de token del usuario', () => {
		// La ruta lleva la cuenta de USDT del usuario entre las de un tramo
		const withUsdt = () => buildSolToUsdc({ swap: raw(swapIx([rw(usdtAta)])) })

		test('una suya que la tx puede escribir entra en la simulación; las ajenas no', async () => {
			const calls = mockRpc({ before: { [usdtAta]: tokenAccount(250_000_000n), [POOL[0]]: tokenAccount(9n, { owner: ATTACKER }) }, after: { [usdtAta]: tokenAccount(250_000_000n) } })
			await prepareSolanaSwap(RPC, withUsdt(), INTENT)
			expect(calls.find(c => c.method === 'simulateTransaction').params[1].accounts.addresses).toEqual([OWNER, usdcAta, wsol, usdtAta])
		})

		test('si la simulación la vacía, no se firma: recibir el mínimo en la de salida no lo arregla', async () => {
			mockRpc({ before: { [usdtAta]: tokenAccount(250_000_000n) }, after: { [usdtAta]: tokenAccount(0n) } })
			await expect(prepareSolanaSwap(RPC, withUsdt(), INTENT)).rejects.toThrow(/gasta un token tuyo que no es el del swap/)
		})

		test('ni si la cierra, la cambia de dueño o la deja con un delegado', async () => {
			mockRpc({ before: { [usdtAta]: tokenAccount(250_000_000n) }, after: { [usdtAta]: null } })
			await expect(prepareSolanaSwap(RPC, withUsdt(), INTENT)).rejects.toThrow(/cierra una cuenta de token tuya/)
			mockRpc({ before: { [usdtAta]: tokenAccount(250_000_000n) }, after: { [usdtAta]: tokenAccount(250_000_000n, { owner: ATTACKER }) } })
			await expect(prepareSolanaSwap(RPC, withUsdt(), INTENT)).rejects.toThrow(/cambia de dueño/)
			mockRpc({ before: { [usdtAta]: tokenAccount(250_000_000n) }, after: { [usdtAta]: tokenAccount(250_000_000n, { delegate: ATTACKER }) } })
			await expect(prepareSolanaSwap(RPC, withUsdt(), INTENT)).rejects.toThrow(/permisos para otro/)
		})

		test('la de salida tampoco puede quedar con un delegado, aunque reciba bien', async () => {
			mockRpc({ after: { [usdcAta]: tokenAccount(5_000_000n + 10_875_069n, { delegate: ATTACKER }) } })
			await expect(prepareSolanaSwap(RPC, buildSolToUsdc(), INTENT)).rejects.toThrow(/permisos para otro/)
		})

		test('un nodo que no devuelve todas las cuentas pedidas no sirve para decidir', async () => {
			mockRpc({ short: true })
			await expect(prepareSolanaSwap(RPC, buildSolToUsdc(), INTENT)).rejects.toThrow(/no devolvió las cuentas pedidas/)
		})
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
