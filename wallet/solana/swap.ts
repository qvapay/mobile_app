/**
 * Swap en Solana vía Jupiter (`/swap/v2/build`). Módulo PURO (fetch vía `jsonRpc`, codec
 * propio), tests en node.
 *
 * El backend (qpweb) pide a Jupiter las INSTRUCCIONES de la ruta y nos las pasa. De ahí en
 * adelante no se confía en nada de lo que llegó:
 *
 * 1. Se compila el mensaje v0 aquí, con las lookup tables leídas DE LA CADENA (el backend
 *    solo dice cuáles; su contenido decide a qué cuenta apunta cada índice).
 * 2. Se verifica instrucción a instrucción (`verifySwapInstructions`): solo programas
 *    conocidos; el único firmante es el usuario; el wrap/unwrap de SOL y las cuentas de
 *    token creadas son SIEMPRE del propio usuario. La instrucción de Jupiter es opaca (su
 *    ruta cruza AMMs que no decodificamos), y eso lo cubre el paso 3.
 * 3. Se SIMULA y se miran los saldos resultantes del propio usuario: tiene que recibir al
 *    menos el mínimo garantizado y no gastar más de lo pedido (+ comisión y renta). Una ruta
 *    que mandara los fondos a otro sitio o gastara de más no pasa de aquí, sea cual sea
 *    la instrucción que la cause.
 *
 * Tras simular se ajusta el límite de cómputo a lo consumido (Jupiter no lo da) y se vuelve
 * a verificar el mensaje final: lo que se firma es exactamente lo que se comprobó.
 */
import { ed25519 } from '@noble/curves/ed25519.js'

import { jsonRpc } from '../chains/http'
import type { RegistryRpc } from '../registry/types'
import {
	associatedTokenAddress,
	compileV0Message,
	COMPUTE_BUDGET_PROGRAM,
	decodeAddressLookupTable,
	decompileV0Instructions,
	deserializeTransactionV0,
	encodeBase58,
	fromBase64,
	readU32le,
	readU64le,
	serializeTransactionV0,
	serializeV0Message,
	setComputeUnitLimitIx,
	toBase64,
	ASSOCIATED_TOKEN_PROGRAM,
	SYSTEM_PROGRAM,
	TOKEN_PROGRAM,
} from './codec'
import type { AddressLookupTable, Instruction, SolanaMessageV0 } from './codec'
import { BLOCKHASH_TTL_MS, LAMPORTS_PER_SIGNATURE, MAX_PRIORITY_MICROLAMPORTS, SolanaVerifyError } from './tx'
import type { SignedSolanaTx } from './tx'

/** El programa de rutas de Jupiter (v6). Constante en el CÓDIGO, no en el registry remoto. */
export const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
export const WSOL_MINT = 'So11111111111111111111111111111111111111112'

/** Tope de cómputo de Solana por tx: con él se simula, y luego se ajusta a lo consumido. */
export const MAX_COMPUTE_UNITS = 1_400_000
/** Margen sobre lo consumido en la simulación: el estado de los pools cambia entre simular y aterrizar. */
const COMPUTE_MARGIN_PERCENT = 20
/** Bytes de una cuenta de token SPL clásica: su renta se pregunta al nodo (ha bajado con los años). */
const TOKEN_ACCOUNT_SPACE = 165
/** Lookup tables por tx: Jupiter usa 1-4; más es sospechoso y además no cabe. */
const MAX_LOOKUP_TABLES = 8

const ALLOWED_PROGRAMS = new Set([COMPUTE_BUDGET_PROGRAM, SYSTEM_PROGRAM, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM, JUPITER_PROGRAM])

/** Instrucción tal y como la serializa Jupiter (datos en base64). */
export type RawInstruction = { programId: string, accounts: Array<{ pubkey: string, isSigner: boolean, isWritable: boolean }>, data: string }

/** Lo que manda qpweb (`/wallet/exchange/onchain/build` para Jupiter). */
export type JupiterBuild = {
	instructions: { computeBudget: RawInstruction[], setup: RawInstruction[], swap: RawInstruction, cleanup: RawInstruction | null, other: RawInstruction[] }
	lookupTables: string[]
}

export type SolanaSwapIntent = {
	owner: string
	/** null = SOL nativo. */
	inputMint: string | null
	outputMint: string | null
	/** Unidades mínimas que el usuario aceptó pagar. */
	amountIn: bigint
	/** Unidades mínimas que tiene que recibir COMO POCO (el mínimo garantizado de la cotización). */
	minOut: bigint
}

export type PreparedSolanaSwap = {
	intent: SolanaSwapIntent
	message: SolanaMessageV0
	messageBytes: Uint8Array
	tables: AddressLookupTable[]
	recentBlockhash: string
	lastValidBlockHeight: number
	computeUnitLimit: number
	computeUnitPrice: bigint
	/** Comisión de red (lamports): firma + prioridad sobre el límite final. */
	feeLamports: bigint
	/** Lo que la SIMULACIÓN dice que recibe (unidades del token de salida). */
	simulatedOut: bigint
	expiresAt: number
}

type Deps = { signal?: AbortSignal, now?: () => number }

const rpcCall = <T>(rpc: RegistryRpc, method: string, params: unknown[], signal?: AbortSignal) => jsonRpc<T>(rpc.url, method, params, { signal, headers: rpc.headers })

const toInstruction = (raw: RawInstruction): Instruction => ({
	programId: raw.programId,
	keys: raw.accounts.map(a => ({ pubkey: a.pubkey, isSigner: !!a.isSigner, isWritable: !!a.isWritable })),
	data: fromBase64(raw.data),
})

/**
 * Las instrucciones en el orden de ejecución, con NUESTRO límite de cómputo. El precio
 * viene de Jupiter (es lo que hace aterrizar la tx) y se acota en la verificación.
 */
export const assembleInstructions = (build: JupiterBuild, computeUnitLimit: number): Instruction[] => {
	const { computeBudget, setup, swap, cleanup, other } = build.instructions
	const price = computeBudget.map(toInstruction).filter(ix => ix.data[0] === 3)
	return [
		setComputeUnitLimitIx(computeUnitLimit),
		...price.slice(0, 1),
		...setup.map(toInstruction),
		toInstruction(swap),
		...(cleanup ? [toInstruction(cleanup)] : []),
		...other.map(toInstruction),
	]
}

// ---------------------------------------------------------------------------
// Verificación estática
// ---------------------------------------------------------------------------

export type SwapInstructionCheck = {
	computeUnitLimit: number
	computeUnitPrice: bigint
	/** Cuentas de token que la tx crea y deja ABIERTAS (el wSOL que se cierra no cuenta): su renta la paga el usuario. */
	persistentAccounts: number
}

/**
 * Comprueba lo que HACE el mensaje (con las cuentas ya resueltas contra las tablas de la
 * cadena). Lanza `SolanaVerifyError` ante cualquier cosa que no sea un swap del propio
 * usuario. Exportado para tests.
 */
export const verifySwapInstructions = (message: SolanaMessageV0, tables: AddressLookupTable[], intent: SolanaSwapIntent): SwapInstructionCheck => {
	const { owner } = intent
	if (message.staticAccountKeys[0] !== owner) throw new SolanaVerifyError('el fee payer no es el usuario')
	if (message.numRequiredSignatures !== 1) throw new SolanaVerifyError('la tx pide más firmantes que el usuario')
	if (message.addressTableLookups.length > MAX_LOOKUP_TABLES) throw new SolanaVerifyError('demasiadas lookup tables')

	const wsolAccount = associatedTokenAddress(owner, WSOL_MINT)
	let computeUnitLimit: number | null = null
	let computeUnitPrice: bigint | null = null
	let swaps = 0
	let wrapped = 0n
	const created: string[] = []
	let closesWsol = false

	for (const ix of decompileV0Instructions(message, tables)) {
		const { programId, keys, data } = ix
		if (!ALLOWED_PROGRAMS.has(programId)) throw new SolanaVerifyError(`programa no permitido ${programId}`)
		const key = (i: number) => keys[i]?.pubkey

		if (programId === COMPUTE_BUDGET_PROGRAM) {
			if (data[0] === 2 && data.length === 5 && computeUnitLimit === null) computeUnitLimit = readU32le(data, 1)
			else if (data[0] === 3 && data.length === 9 && computeUnitPrice === null) computeUnitPrice = readU64le(data, 1)
			else throw new SolanaVerifyError('instrucción de compute budget no permitida')
		} else if (programId === ASSOCIATED_TOKEN_PROGRAM) {
			// Crear la cuenta de token de un mint: SOLO la del propio usuario y pagada por él
			if (keys.length !== 6 || data.length !== 1 || (data[0] !== 1 && data[0] !== 0)) throw new SolanaVerifyError('creación de cuenta de token no permitida')
			if (key(0) !== owner || key(2) !== owner) throw new SolanaVerifyError('cuenta de token creada para otro')
			if (key(4) !== SYSTEM_PROGRAM || key(5) !== TOKEN_PROGRAM) throw new SolanaVerifyError('creación de cuenta con programas inesperados')
			if (associatedTokenAddress(owner, key(3)!) !== key(1)) throw new SolanaVerifyError('la cuenta creada no es la asociada del usuario')
			created.push(key(1)!)
		} else if (programId === SYSTEM_PROGRAM) {
			// El único movimiento de SOL fuera de Jupiter: envolverlo en el wSOL del propio usuario
			if (keys.length !== 2 || data.length !== 12 || readU32le(data, 0) !== 2) throw new SolanaVerifyError('instrucción de sistema no permitida')
			if (key(0) !== owner || key(1) !== wsolAccount) throw new SolanaVerifyError('transferencia de SOL fuera de la wallet')
			wrapped += readU64le(data, 4)
		} else if (programId === TOKEN_PROGRAM) {
			// Fuera de Jupiter: sincronizar el wSOL recién envuelto, o cerrarlo devolviendo el SOL
			// AL USUARIO. Nada de transferir, aprobar ni cambiar autoridades
			if (data.length === 1 && data[0] === 17) {
				if (keys.length !== 1 || key(0) !== wsolAccount) throw new SolanaVerifyError('sync de una cuenta ajena')
			} else if (data.length === 1 && data[0] === 9) {
				if (keys.length !== 3 || key(0) !== wsolAccount || key(1) !== owner || key(2) !== owner) throw new SolanaVerifyError('cierre de cuenta hacia otro destino')
				closesWsol = true
			} else {
				throw new SolanaVerifyError('instrucción de token no permitida')
			}
		} else {
			swaps++
		}
	}

	if (swaps !== 1) throw new SolanaVerifyError('la tx no tiene exactamente un swap')
	if (intent.inputMint !== null && wrapped > 0n) throw new SolanaVerifyError('envuelve SOL en un swap que no sale de SOL')
	if (wrapped > intent.amountIn) throw new SolanaVerifyError('envuelve más SOL del pedido')
	if (computeUnitLimit === null || computeUnitLimit > MAX_COMPUTE_UNITS) throw new SolanaVerifyError('límite de cómputo ausente o excesivo')
	if ((computeUnitPrice ?? 0n) > MAX_PRIORITY_MICROLAMPORTS) throw new SolanaVerifyError('prioridad por encima del tope')
	const persistent = created.filter(account => !(account === wsolAccount && closesWsol)).length
	return { computeUnitLimit, computeUnitPrice: computeUnitPrice ?? 0n, persistentAccounts: persistent }
}

// ---------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------

/** Las cuentas cuyo saldo prueba el swap: el usuario (SOL) y sus cuentas de token de entrada y salida. */
export const balanceAccounts = (intent: SolanaSwapIntent): { owner: string, input: string | null, output: string | null } => ({
	owner: intent.owner,
	input: intent.inputMint ? associatedTokenAddress(intent.owner, intent.inputMint) : null,
	output: intent.outputMint ? associatedTokenAddress(intent.owner, intent.outputMint) : null,
})

type AccountState = { lamports: number, data: [string, string] } | null

/** Saldo de una cuenta de token SPL: u64 en el byte 64. Sin cuenta = 0. */
export const tokenAmount = (account: AccountState): bigint => {
	if (!account?.data?.[0]) return 0n
	const data = fromBase64(account.data[0])
	return data.length >= 72 ? readU64le(data, 64) : 0n
}

export type Balances = { lamports: bigint, input: bigint, output: bigint }

/**
 * ¿Lo que cambiaron los saldos es un swap honrado? Exportado para tests.
 *   · recibe ≥ el mínimo garantizado;
 *   · el token de entrada baja como mucho lo pedido;
 *   · el SOL del usuario baja como mucho: lo pedido (si sale de SOL) + comisión + la renta de
 *     las cuentas de token que la tx crea y deja abiertas (`rentLamports`, contada en la
 *     verificación: es SU cuenta, recuperable al cerrarla).
 * Si sale a SOL, lo recibido se mide en el SOL del usuario, neto de comisión y esas rentas.
 */
export const checkSimulatedBalances = ({ intent, before, after, feeLamports, rentLamports }: { intent: SolanaSwapIntent, before: Balances, after: Balances, feeLamports: bigint, rentLamports: bigint }): bigint => {
	const solSpent = before.lamports - after.lamports
	if (intent.outputMint === null) {
		const received = after.lamports - before.lamports + feeLamports + rentLamports
		if (received < intent.minOut) throw new SolanaVerifyError('la simulación recibe menos del mínimo')
		if (intent.inputMint !== null && before.input - after.input > intent.amountIn) throw new SolanaVerifyError('la simulación gasta más token del pedido')
		return received
	}
	const received = after.output - before.output
	if (received < intent.minOut) throw new SolanaVerifyError('la simulación recibe menos del mínimo')
	if (intent.inputMint !== null && before.input - after.input > intent.amountIn) throw new SolanaVerifyError('la simulación gasta más token del pedido')
	const solBudget = (intent.inputMint === null ? intent.amountIn : 0n) + feeLamports + rentLamports
	if (solSpent > solBudget) throw new SolanaVerifyError('la simulación gasta más SOL del previsto')
	return received
}

const readBalances = (intent: SolanaSwapIntent, accounts: AccountState[], order: Array<'owner' | 'input' | 'output'>): Balances => {
	const get = (name: 'owner' | 'input' | 'output') => accounts[order.indexOf(name)] ?? null
	return {
		lamports: BigInt(get('owner')?.lamports ?? 0),
		input: intent.inputMint ? tokenAmount(get('input')) : 0n,
		output: intent.outputMint ? tokenAmount(get('output')) : 0n,
	}
}

type SimulationValue = { err: unknown, logs?: string[] | null, unitsConsumed?: number, accounts?: AccountState[] | null }

// ---------------------------------------------------------------------------
// Construir
// ---------------------------------------------------------------------------

const feeFor = (limit: number, price: bigint): bigint => LAMPORTS_PER_SIGNATURE + (BigInt(limit) * price + 999_999n) / 1_000_000n

/**
 * Compila, verifica, simula y ajusta. Lanza `SolanaVerifyError` si algo no es un swap
 * honrado del propio usuario, o el error de simulación del nodo si la ruta falla.
 */
export const prepareSolanaSwap = async (rpc: RegistryRpc, build: JupiterBuild, intent: SolanaSwapIntent, deps: Deps = {}): Promise<PreparedSolanaSwap> => {
	const now = deps.now ?? Date.now
	if (build.lookupTables.length > MAX_LOOKUP_TABLES) throw new SolanaVerifyError('demasiadas lookup tables')
	const watched = balanceAccounts(intent)
	const order = (['owner', 'input', 'output'] as const).filter(name => watched[name] !== null)
	const addresses = order.map(name => watched[name]!) as string[]

	const [tableInfos, blockhashInfo, beforeInfos, tokenRent] = await Promise.all([
		build.lookupTables.length
			? rpcCall<{ value: Array<{ data: [string, string] } | null> }>(rpc, 'getMultipleAccounts', [build.lookupTables, { encoding: 'base64' }], deps.signal)
			: Promise.resolve({ value: [] }),
		rpcCall<{ value: { blockhash: string, lastValidBlockHeight: number } }>(rpc, 'getLatestBlockhash', [{ commitment: 'confirmed' }], deps.signal),
		rpcCall<{ value: AccountState[] }>(rpc, 'getMultipleAccounts', [addresses, { encoding: 'base64' }], deps.signal),
		rpcCall<number>(rpc, 'getMinimumBalanceForRentExemption', [TOKEN_ACCOUNT_SPACE], deps.signal),
	])

	// El CONTENIDO de cada tabla sale de la cadena. Una tabla que no existe no se adivina
	const tables: AddressLookupTable[] = build.lookupTables.map((key, i) => {
		const info = tableInfos.value[i]
		if (!info?.data?.[0]) throw new SolanaVerifyError(`la lookup table ${key} no existe`)
		return { key, addresses: decodeAddressLookupTable(fromBase64(info.data[0])) }
	})
	const { blockhash, lastValidBlockHeight } = blockhashInfo.value

	// 1ª vuelta: con el tope de cómputo, para simular y medir
	const probe = compileV0Message(intent.owner, assembleInstructions(build, MAX_COMPUTE_UNITS), blockhash, tables)
	const { computeUnitPrice, persistentAccounts } = verifySwapInstructions(probe, tables, intent)
	const rentLamports = BigInt(persistentAccounts) * BigInt(tokenRent)
	const probeTx = serializeTransactionV0({ signatures: [null], message: probe, messageBytes: serializeV0Message(probe) })
	const simulation = await rpcCall<{ value: SimulationValue }>(rpc, 'simulateTransaction', [
		toBase64(probeTx),
		{ encoding: 'base64', sigVerify: false, commitment: 'confirmed', accounts: { encoding: 'base64', addresses } },
	], deps.signal)
	const sim = simulation.value
	if (sim.err) {
		const detail = (sim.logs ?? []).slice(-3).join(' · ')
		throw new Error(`solana: la simulación del swap falló (${JSON.stringify(sim.err)})${detail ? ` ${detail}` : ''}`)
	}
	const consumed = Number(sim.unitsConsumed ?? 0)
	if (!(consumed > 0)) throw new SolanaVerifyError('la simulación no informó del cómputo')
	const computeUnitLimit = Math.min(MAX_COMPUTE_UNITS, Math.ceil(consumed * (100 + COMPUTE_MARGIN_PERCENT) / 100))
	const feeLamports = feeFor(computeUnitLimit, computeUnitPrice)

	const simulatedOut = checkSimulatedBalances({
		intent,
		before: readBalances(intent, beforeInfos.value, order),
		after: readBalances(intent, sim.accounts ?? [], order),
		// La simulación cobró con el límite de la sonda: se compara contra ESA comisión
		feeLamports: feeFor(MAX_COMPUTE_UNITS, computeUnitPrice),
		rentLamports,
	})

	// 2ª vuelta: el mensaje FINAL, que se vuelve a verificar entero
	const message = compileV0Message(intent.owner, assembleInstructions(build, computeUnitLimit), blockhash, tables)
	const check = verifySwapInstructions(message, tables, intent)
	if (check.computeUnitLimit !== computeUnitLimit || check.computeUnitPrice !== computeUnitPrice) throw new SolanaVerifyError('el mensaje final no es el simulado')

	return {
		intent, message, messageBytes: serializeV0Message(message), tables,
		recentBlockhash: blockhash, lastValidBlockHeight,
		computeUnitLimit, computeUnitPrice, feeLamports, simulatedOut,
		expiresAt: now() + BLOCKHASH_TTL_MS,
	}
}

// ---------------------------------------------------------------------------
// Firmar
// ---------------------------------------------------------------------------

/**
 * Firma el mensaje verificado y comprueba el sobre: la firma valida contra la clave del
 * usuario y los bytes firmados son exactamente los preparados.
 */
export const signSolanaSwap = (prepared: PreparedSolanaSwap, privateKey: Uint8Array): SignedSolanaTx => {
	const publicKey = ed25519.getPublicKey(privateKey)
	if (encodeBase58(publicKey) !== prepared.intent.owner) throw new SolanaVerifyError('la clave no es la del usuario')
	const signature = ed25519.sign(prepared.messageBytes, privateKey)
	const bytes = serializeTransactionV0({ signatures: [signature], message: prepared.message, messageBytes: prepared.messageBytes })

	const parsed = deserializeTransactionV0(bytes)
	const sameBytes = parsed.messageBytes.length === prepared.messageBytes.length && parsed.messageBytes.every((b, i) => b === prepared.messageBytes[i])
	if (!sameBytes || !parsed.signatures[0] || !ed25519.verify(parsed.signatures[0], parsed.messageBytes, publicKey)) throw new SolanaVerifyError('la tx firmada no es la verificada')

	const txid = encodeBase58(signature)
	return { base64: toBase64(bytes), signature: txid, txid }
}
