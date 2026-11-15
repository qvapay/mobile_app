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
 *    token creadas son SIEMPRE del propio usuario. La instrucción de Jupiter se DECODIFICA
 *    por su discriminador (`verifyJupiterInstruction`): sale de la cuenta del usuario del
 *    token de entrada, paga a la del de salida, por el importe exacto y con un mínimo que el
 *    programa hace cumplir. Sus tramos (los AMM que cruza) siguen siendo opacos: paso 3.
 * 3. Se SIMULA y se miran TODAS las cuentas de token del usuario que la tx puede escribir,
 *    no solo las del par: la firma del usuario vale para cualquiera de ellas, y un tramo
 *    podía sacar de otra (su USDT en un swap de SOL a USDC) y devolver el mínimo en la de
 *    salida. Ninguna puede bajar, cerrarse, cambiar de dueño ni quedar con permisos para
 *    otro; la de entrada baja como mucho lo pedido y la de salida sube al menos el mínimo.
 *
 * Las tablas y la simulación salen del mismo nodo, así que las cuentas del usuario van
 * SIEMPRE como claves estáticas del mensaje (`userAccounts`): si fueran por índice, en la
 * cadena serían las que la tabla tenga de verdad en ese índice, no las que dijo el nodo.
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
	pubkeyBytes,
	readU32le,
	readU64le,
	resolveV0Accounts,
	serializeTransactionV0,
	serializeV0Message,
	setComputeUnitLimitIx,
	toBase64,
	ASSOCIATED_TOKEN_PROGRAM,
	SYSTEM_PROGRAM,
	TOKEN_PROGRAM,
	TOKEN_2022_PROGRAM,
	isTokenProgram,
} from './codec'
import type { AddressLookupTable, Instruction, SolanaMessageV0, TokenProgramId } from './codec'
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
/** Cuenta Token-2022 de un xStock (base + tipo + ImmutableOwner + PausableAccount + TransferHookAccount). */
const TOKEN_2022_ACCOUNT_SPACE = 179
/** Lookup tables por tx: Jupiter usa 1-4; más es sospechoso y además no cabe. */
const MAX_LOOKUP_TABLES = 8

// Token-2022 entra SOLO para crear la cuenta del usuario de un xStock (vía programa de ATA) y
// como cuenta que Jupiter toca dentro de su swap; una instrucción DIRECTA de Token-2022 en la tx
// sigue sin estar permitida (ver el bucle: solo wSOL, que es del programa clásico)
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
	/**
	 * Programa de cada mint (ausente = clásico). Decide qué ATA se vigila en la simulación: si
	 * no fuera el real, el saldo vigilado no cambiaría y el swap se rechazaría (falla cerrado).
	 */
	inputProgram?: TokenProgramId
	outputProgram?: TokenProgramId
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
	/** Slot en que se leyó el blockhash (ver `lookupSolanaTransaction`). null = el nodo no lo dijo. */
	blockhashSlot: number | null
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
// La instrucción de Jupiter
// ---------------------------------------------------------------------------

/** Lo que el swap mueve por los dos lados: SOL viaja como wSOL en la cuenta asociada del usuario. */
export const swapAccounts = (intent: SolanaSwapIntent) => {
	const sourceMint = intent.inputMint ?? WSOL_MINT
	const destinationMint = intent.outputMint ?? WSOL_MINT
	const sourceProgram: TokenProgramId = intent.inputMint ? intent.inputProgram ?? TOKEN_PROGRAM : TOKEN_PROGRAM
	const destinationProgram: TokenProgramId = intent.outputMint ? intent.outputProgram ?? TOKEN_PROGRAM : TOKEN_PROGRAM
	return {
		sourceMint, destinationMint, sourceProgram, destinationProgram,
		source: associatedTokenAddress(intent.owner, sourceMint, sourceProgram),
		destination: associatedTokenAddress(intent.owner, destinationMint, destinationProgram),
	}
}

/**
 * Las cuentas del usuario que la tx toca: él, las dos del swap, su wSOL y las de token que
 * se crean. Van siempre estáticas en el mensaje, nunca por índice de una tabla.
 */
export const userAccounts = (build: JupiterBuild, intent: SolanaSwapIntent): Set<string> => {
	const { source, destination } = swapAccounts(intent)
	const accounts = new Set([intent.owner, source, destination, associatedTokenAddress(intent.owner, WSOL_MINT)])
	for (const raw of [...build.instructions.setup, ...build.instructions.other]) {
		if (raw.programId === ASSOCIATED_TOKEN_PROGRAM && raw.accounts[1]) accounts.add(raw.accounts[1].pubkey)
	}
	return accounts
}

type JupiterLayout = {
	name: string
	/** Posición de cada cuenta fija y cuántas son; el resto son las de los tramos. */
	authority: number, source: number, destination: number, sourceMint: number, destinationMint: number, sourceProgram: number, destinationProgram: number
	/** Cuenta opcional a la que pagar en vez de a `destination` (ausente = el propio programa). */
	optionalDestination: number | null
	fixed: number
	/** Byte en el que empiezan `in_amount` · `quoted_out_amount` · `slippage_bps` · comisiones · tramos. */
	args: number
	/** Los tramos los firma una cuenta del programa, no el usuario. */
	sharedAccounts: boolean
}

/**
 * Las dos instrucciones que devuelve `/swap/v2/build`, por su discriminador de Anchor (los
 * 8 primeros bytes de sha256("global:<nombre>")). Formas sacadas de builds REALES (14 nov
 * 2026). Otra instrucción (las viejas `route`/`shared_accounts_route`, las de importe exacto
 * de salida) no se firma: añadirla = capturar un build real y fijar aquí su forma.
 */
const JUPITER_LAYOUTS: Record<string, JupiterLayout> = {
	bb64facc31c4af14: { name: 'route_v2', authority: 0, source: 1, destination: 2, sourceMint: 3, destinationMint: 4, sourceProgram: 5, destinationProgram: 6, optionalDestination: 7, fixed: 10, args: 8, sharedAccounts: false },
	d19853937cfed8e9: { name: 'shared_accounts_route_v2', authority: 1, source: 2, destination: 5, sourceMint: 6, destinationMint: 7, sourceProgram: 8, destinationProgram: 9, optionalDestination: null, fixed: 12, args: 9, sharedAccounts: true },
}
/** in_amount (8) + quoted_out_amount (8) + slippage_bps (2) + platform_fee_bps (2) + positive_slippage_bps (2) + nº de tramos (4). */
const JUPITER_ARGS_SIZE = 26

export type JupiterSwapCheck = {
	instruction: string
	source: string
	destination: string
	/** El mínimo que el PROGRAMA hace cumplir: `quoted_out_amount` menos el deslizamiento. */
	minOut: bigint
}

/**
 * Lo que la instrucción de Jupiter dice de sí misma, en posiciones fijas. Exportado para
 * tests. No cubre los tramos (cada AMM tiene su forma): eso lo prueba la simulación.
 */
export const verifyJupiterInstruction = (ix: Instruction, intent: SolanaSwapIntent): JupiterSwapCheck => {
	const { keys, data } = ix
	const layout = JUPITER_LAYOUTS[Array.from(data.slice(0, 8), b => b.toString(16).padStart(2, '0')).join('')]
	if (!layout) throw new SolanaVerifyError('instrucción de Jupiter que la wallet no sabe leer')
	if (keys.length < layout.fixed || data.length < layout.args + JUPITER_ARGS_SIZE) throw new SolanaVerifyError('instrucción de Jupiter incompleta')
	const at = (i: number) => keys[i].pubkey
	const expected = swapAccounts(intent)

	if (at(layout.authority) !== intent.owner || !keys[layout.authority].isSigner) throw new SolanaVerifyError('quien autoriza el swap no es el usuario')
	if (at(layout.source) !== expected.source) throw new SolanaVerifyError('el swap no sale de la cuenta del usuario')
	if (at(layout.destination) !== expected.destination) throw new SolanaVerifyError('el swap no paga a la cuenta del usuario')
	if (layout.optionalDestination !== null && at(layout.optionalDestination) !== JUPITER_PROGRAM && at(layout.optionalDestination) !== expected.destination) throw new SolanaVerifyError('el swap paga a otra cuenta')
	if (at(layout.sourceMint) !== expected.sourceMint || at(layout.destinationMint) !== expected.destinationMint) throw new SolanaVerifyError('el swap es de otro par')
	if (at(layout.sourceProgram) !== expected.sourceProgram || at(layout.destinationProgram) !== expected.destinationProgram) throw new SolanaVerifyError('el swap usa otro programa de token')
	// La firma del usuario solo hace falta para sacar la entrada. Con cuentas compartidas los
	// tramos los firma el programa: si el usuario aparece en ellos, autoriza algo más
	keys.forEach((key, i) => {
		if (key.pubkey === intent.owner && i !== layout.authority && (layout.sharedAccounts || i < layout.fixed)) throw new SolanaVerifyError('el usuario autoriza algo más que la entrada')
	})

	const inAmount = readU64le(data, layout.args)
	const quotedOut = readU64le(data, layout.args + 8)
	const slippageBps = data[layout.args + 16] + data[layout.args + 17] * 256
	if (inAmount !== intent.amountIn) throw new SolanaVerifyError('el swap es por otro importe')
	if (slippageBps > 10_000) throw new SolanaVerifyError('deslizamiento imposible')
	// Redondeado hacia arriba, como lo anuncia la API (`otherAmountThreshold`)
	const minOut = (quotedOut * BigInt(10_000 - slippageBps) + 9_999n) / 10_000n
	if (minOut < intent.minOut) throw new SolanaVerifyError('el swap garantiza menos del mínimo')
	return { instruction: layout.name, source: expected.source, destination: expected.destination, minOut }
}

// ---------------------------------------------------------------------------
// Verificación estática
// ---------------------------------------------------------------------------

export type SwapInstructionCheck = {
	computeUnitLimit: number
	computeUnitPrice: bigint
	/** Cuentas de token que la tx crea y deja ABIERTAS (el wSOL que se cierra no cuenta): su renta la paga el usuario. */
	persistentAccounts: number
	/** De esas, cuántas son Token-2022 (más grandes: otra renta). */
	persistent2022: number
	/** Todas las cuentas de token que la tx crea (siempre del usuario). */
	created: string[]
	/** ¿La tx cierra el wSOL del usuario devolviéndole el SOL? */
	closesWsol: boolean
	jupiter: JupiterSwapCheck
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
	let jupiter: JupiterSwapCheck | null = null
	let swaps = 0
	let wrapped = 0n
	const created: Array<{ account: string, program: TokenProgramId }> = []
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
			const tokenProgram = key(5)!
			if (key(4) !== SYSTEM_PROGRAM || !isTokenProgram(tokenProgram)) throw new SolanaVerifyError('creación de cuenta con programas inesperados')
			if (associatedTokenAddress(owner, key(3)!, tokenProgram) !== key(1)) throw new SolanaVerifyError('la cuenta creada no es la asociada del usuario')
			created.push({ account: key(1)!, program: tokenProgram })
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
			jupiter = verifyJupiterInstruction(ix, intent)
		}
	}

	if (swaps !== 1 || !jupiter) throw new SolanaVerifyError('la tx no tiene exactamente un swap')
	// Las cuentas del usuario, por clave y no por índice de una tabla (ver la cabecera)
	const statics = new Set(message.staticAccountKeys)
	for (const account of [jupiter.source, jupiter.destination, ...created.map(c => c.account)]) {
		if (!statics.has(account)) throw new SolanaVerifyError('una cuenta del usuario llega por una lookup table')
	}
	if (intent.inputMint !== null && wrapped > 0n) throw new SolanaVerifyError('envuelve SOL en un swap que no sale de SOL')
	if (wrapped > intent.amountIn) throw new SolanaVerifyError('envuelve más SOL del pedido')
	if (computeUnitLimit === null || computeUnitLimit > MAX_COMPUTE_UNITS) throw new SolanaVerifyError('límite de cómputo ausente o excesivo')
	if ((computeUnitPrice ?? 0n) > MAX_PRIORITY_MICROLAMPORTS) throw new SolanaVerifyError('prioridad por encima del tope')
	const persistent = created.filter(({ account }) => !(account === wsolAccount && closesWsol))
	return {
		computeUnitLimit,
		computeUnitPrice: computeUnitPrice ?? 0n,
		persistentAccounts: persistent.length,
		persistent2022: persistent.filter(({ program }) => program === TOKEN_2022_PROGRAM).length,
		created: created.map(c => c.account),
		closesWsol,
		jupiter,
	}
}

// ---------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------

/** Las cuentas cuyo saldo prueba el swap: el usuario (SOL) y sus cuentas de token de entrada y salida. */
export const balanceAccounts = (intent: SolanaSwapIntent): { owner: string, input: string | null, output: string | null } => ({
	owner: intent.owner,
	input: intent.inputMint ? associatedTokenAddress(intent.owner, intent.inputMint, intent.inputProgram ?? TOKEN_PROGRAM) : null,
	output: intent.outputMint ? associatedTokenAddress(intent.owner, intent.outputMint, intent.outputProgram ?? TOKEN_PROGRAM) : null,
})

type AccountState = { lamports: number, data: [string, string], owner?: string } | null

/** Bytes de una cuenta de token: dueño (32), saldo (64), delegado (72-108), importe delegado (121-129) y autoridad de cierre (129-165). */
const TOKEN_ACCOUNT_SIZE = 165
const tokenData = (account: AccountState): Uint8Array | null => {
	if (!account?.data?.[0]) return null
	const data = fromBase64(account.data[0])
	return data.length >= TOKEN_ACCOUNT_SIZE ? data : null
}
const tokenOwner = (data: Uint8Array): string => encodeBase58(data.slice(32, 64))
/** ¿Alguien más puede mover o cerrar esta cuenta? (delegado o autoridad de cierre puestos) */
const tokenGrants = (data: Uint8Array): string => (readU32le(data, 72) === 0 && readU32le(data, 129) === 0
	? ''
	: Array.from([...data.slice(72, 108), ...data.slice(121, 165)], b => b.toString(16).padStart(2, '0')).join(''))

/** ¿Es una cuenta de token (clásica o Token-2022) cuyo dueño es `owner`? Exportado para tests. */
export const isTokenAccountOf = (account: AccountState, owner: string): boolean => {
	if (!account?.owner || !isTokenProgram(account.owner)) return false
	const data = tokenData(account)
	return !!data && tokenOwner(data) === owner
}

/** Saldo de una cuenta de token SPL: u64 en el byte 64 (igual en Token-2022: las extensiones van detrás). Sin cuenta = 0. */
export const tokenAmount = (account: AccountState): bigint => {
	if (!account?.data?.[0]) return 0n
	const data = fromBase64(account.data[0])
	return data.length >= 72 ? readU64le(data, 64) : 0n
}

/** `wsol`: lo que hay en la cuenta de wSOL del usuario. Cuenta como SOL suyo (cerrarla se lo devuelve). */
export type Balances = { lamports: bigint, input: bigint, output: bigint, wsol?: bigint }

/**
 * ¿Lo que cambiaron los saldos es un swap honrado? Exportado para tests.
 *   · recibe ≥ el mínimo garantizado;
 *   · el token de entrada baja como mucho lo pedido;
 *   · el SOL del usuario baja como mucho: lo pedido (si sale de SOL) + comisión + la renta de
 *     las cuentas de token que la tx crea y deja abiertas (`rentLamports`, contada en la
 *     verificación: es SU cuenta, recuperable al cerrarla).
 * Si sale a SOL, lo recibido se mide en el SOL del usuario, neto de comisión y esas rentas.
 * El SOL del usuario es el suyo MÁS el que tenga envuelto en su cuenta de wSOL: la tx la
 * cierra y se lo devuelve, así que vaciársela por un tramo es gastarle SOL.
 */
export const checkSimulatedBalances = ({ intent, before, after, feeLamports, rentLamports }: { intent: SolanaSwapIntent, before: Balances, after: Balances, feeLamports: bigint, rentLamports: bigint }): bigint => {
	const solBefore = before.lamports + (before.wsol ?? 0n)
	const solAfter = after.lamports + (after.wsol ?? 0n)
	const solSpent = solBefore - solAfter
	if (intent.outputMint === null) {
		const received = solAfter - solBefore + feeLamports + rentLamports
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

const readBalances = (intent: SolanaSwapIntent, state: Map<string, AccountState>): Balances => {
	const watched = balanceAccounts(intent)
	const get = (address: string | null) => (address ? state.get(address) ?? null : null)
	return {
		lamports: BigInt(get(intent.owner)?.lamports ?? 0),
		input: tokenAmount(get(watched.input)),
		output: tokenAmount(get(watched.output)),
		wsol: tokenAmount(get(associatedTokenAddress(intent.owner, WSOL_MINT))),
	}
}

/**
 * Las cuentas de token del usuario que la tx puede escribir, antes y después. Exportado para
 * tests. La firma del usuario vale para todas, y un tramo de la ruta puede usar cualquiera:
 *   · ninguna se cierra (salvo su wSOL, cuando la tx lo cierra devolviéndole el SOL);
 *   · ninguna cambia de dueño ni queda con un delegado o una autoridad de cierre que no tenía;
 *   · ninguna baja, salvo la de entrada (que `checkSimulatedBalances` acota) y su wSOL (que
 *     cuenta como SOL suyo, también allí).
 */
export const checkUserTokenAccounts = ({ intent, accounts, closesWsol }: {
	intent: SolanaSwapIntent
	accounts: Array<{ address: string, before: AccountState, after: AccountState }>
	closesWsol: boolean
}): void => {
	const wsolAccount = associatedTokenAddress(intent.owner, WSOL_MINT)
	const input = balanceAccounts(intent).input
	for (const { address, before, after } of accounts) {
		const pre = tokenData(before)
		const post = tokenData(after)
		if (!post) {
			if (!pre || (address === wsolAccount && closesWsol)) continue
			throw new SolanaVerifyError('la simulación cierra una cuenta de token tuya')
		}
		if (tokenOwner(post) !== intent.owner) throw new SolanaVerifyError('una cuenta de token tuya cambia de dueño')
		if (tokenGrants(post) !== '' && tokenGrants(post) !== (pre ? tokenGrants(pre) : '')) throw new SolanaVerifyError('una cuenta de token tuya queda con permisos para otro')
		if (pre && address !== input && address !== wsolAccount && readU64le(post, 64) < readU64le(pre, 64)) throw new SolanaVerifyError('la simulación gasta un token tuyo que no es el del swap')
	}
}

/** Lectura de cuentas por lotes: el proxy de QvaPay admite 16 direcciones por llamada. */
const ACCOUNTS_BATCH = 16
const readAccounts = async (rpc: RegistryRpc, addresses: string[], signal?: AbortSignal): Promise<Map<string, AccountState>> => {
	const batches: string[][] = []
	for (let i = 0; i < addresses.length; i += ACCOUNTS_BATCH) batches.push(addresses.slice(i, i + ACCOUNTS_BATCH))
	// `confirmed`, como la simulación: el antes y el después se comparan sobre el mismo estado
	const results = await Promise.all(batches.map(batch => rpcCall<{ value: AccountState[] }>(rpc, 'getMultipleAccounts', [batch, { encoding: 'base64', commitment: 'confirmed' }], signal)))
	const state = new Map<string, AccountState>()
	batches.forEach((batch, i) => batch.forEach((address, j) => state.set(address, results[i].value?.[j] ?? null)))
	return state
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
	pubkeyBytes(intent.owner)

	const [tableInfos, blockhashInfo, tokenRent, token2022Rent] = await Promise.all([
		build.lookupTables.length
			// `confirmed`, como la simulación: una tabla recién ampliada leída en `finalized` sale sin
			// sus últimas direcciones, y esas cuentas irían estáticas hasta no caber en la tx
			? rpcCall<{ value: Array<{ data: [string, string] } | null> }>(rpc, 'getMultipleAccounts', [build.lookupTables, { encoding: 'base64', commitment: 'confirmed' }], deps.signal)
			: Promise.resolve({ value: [] }),
		rpcCall<{ context?: { slot?: number }, value: { blockhash: string, lastValidBlockHeight: number } }>(rpc, 'getLatestBlockhash', [{ commitment: 'confirmed' }], deps.signal),
		rpcCall<number>(rpc, 'getMinimumBalanceForRentExemption', [TOKEN_ACCOUNT_SPACE], deps.signal),
		// Siempre, no solo cuando el intent marca Token-2022: Jupiter puede crear una cuenta
		// Token-2022 que el intent no anunció, y contarla con la renta clásica (menor) dejaría
		// corto el tope de SOL de la simulación
		rpcCall<number>(rpc, 'getMinimumBalanceForRentExemption', [TOKEN_2022_ACCOUNT_SPACE], deps.signal),
	])

	// El CONTENIDO de cada tabla sale de la cadena. Una tabla que no existe no se adivina
	const tables: AddressLookupTable[] = build.lookupTables.map((key, i) => {
		const info = tableInfos.value[i]
		if (!info?.data?.[0]) throw new SolanaVerifyError(`la lookup table ${key} no existe`)
		return { key, addresses: decodeAddressLookupTable(fromBase64(info.data[0])) }
	})
	const { blockhash, lastValidBlockHeight } = blockhashInfo.value
	const blockhashSlot = typeof blockhashInfo.context?.slot === 'number' ? blockhashInfo.context.slot : null

	// 1ª vuelta: con el tope de cómputo, para simular y medir
	const staticOnly = userAccounts(build, intent)
	const probe = compileV0Message(intent.owner, assembleInstructions(build, MAX_COMPUTE_UNITS), blockhash, tables, staticOnly)
	const { computeUnitPrice, persistentAccounts, persistent2022, created, closesWsol } = verifySwapInstructions(probe, tables, intent)
	// Un xStock sin cuenta previa obliga a crear una Token-2022, más grande: otra renta
	const rentLamports = BigInt(persistentAccounts - persistent2022) * BigInt(tokenRent) + BigInt(persistent2022) * BigInt(token2022Rent)

	// Qué vigilar: las cuentas del par, el wSOL, las que la tx crea y, de todo lo que la tx
	// puede ESCRIBIR, lo que ya es una cuenta de token del usuario (un tramo podría sacar de ahí)
	const pair = balanceAccounts(intent)
	const known = [...new Set([pair.input, pair.output, associatedTokenAddress(intent.owner, WSOL_MINT), ...created].filter((a): a is string => a !== null))]
	const writable = resolveV0Accounts(probe, tables).filter(a => a.isWritable && a.pubkey !== intent.owner).map(a => a.pubkey)
	const before = await readAccounts(rpc, [...new Set([intent.owner, ...known, ...writable])], deps.signal)
	const watched = [...new Set([...known, ...writable.filter(address => isTokenAccountOf(before.get(address) ?? null, intent.owner))])]
	const addresses = [intent.owner, ...watched]

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

	if ((sim.accounts ?? []).length !== addresses.length) throw new SolanaVerifyError('la simulación no devolvió las cuentas pedidas')
	const after = new Map<string, AccountState>(addresses.map((address, i) => [address, sim.accounts?.[i] ?? null]))
	const simulatedOut = checkSimulatedBalances({
		intent,
		before: readBalances(intent, before),
		after: readBalances(intent, after),
		// La simulación cobró con el límite de la sonda: se compara contra ESA comisión
		feeLamports: feeFor(MAX_COMPUTE_UNITS, computeUnitPrice),
		rentLamports,
	})
	checkUserTokenAccounts({ intent, closesWsol, accounts: watched.map(address => ({ address, before: before.get(address) ?? null, after: after.get(address) ?? null })) })

	// 2ª vuelta: el mensaje FINAL, que se vuelve a verificar entero
	const message = compileV0Message(intent.owner, assembleInstructions(build, computeUnitLimit), blockhash, tables, staticOnly)
	const check = verifySwapInstructions(message, tables, intent)
	if (check.computeUnitLimit !== computeUnitLimit || check.computeUnitPrice !== computeUnitPrice) throw new SolanaVerifyError('el mensaje final no es el simulado')

	return {
		intent, message, messageBytes: serializeV0Message(message), tables,
		recentBlockhash: blockhash, lastValidBlockHeight, blockhashSlot,
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
