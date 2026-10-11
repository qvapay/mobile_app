/**
 * Formato binario de Solana SIN SDK — módulo PURO (Uint8Array, @noble/@scure; cero
 * react-native, cero Buffer). Por qué propio y no @solana/web3.js: en Hermes el SDK pide
 * polyfills (TextEncoder, URL, WebSocket) y aquí solo hace falta el subconjunto que la
 * wallet firma: mensaje legacy, sus instrucciones y la PDA de una cuenta de token. Tenerlo
 * a la vista permite además verificar byte a byte lo que se firma (regla 6 del plan).
 *
 * Referencia del formato (tx legacy):
 *   tx      = compact-u16(n firmas) · n × firma(64) · mensaje
 *   mensaje = cabecera(3 u8) · compact-u16(n cuentas) · n × pubkey(32) · blockhash(32)
 *             · compact-u16(n instrucciones) · instrucciones
 *   instr.  = u8 índice del programa · compact-u16(n) · n × u8 índices de cuenta
 *             · compact-u16(len) · datos
 * Los vectores de los tests salen de @solana/web3.js 1.98 (generados fuera de la app).
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { base58, base64 } from '@scure/base'

export const SYSTEM_PROGRAM = '11111111111111111111111111111111'
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
export const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111'
export const STAKE_PROGRAM = 'Stake11111111111111111111111111111111111111'
export const VOTE_PROGRAM = 'Vote111111111111111111111111111111111111111'
export const SYSVAR_CLOCK = 'SysvarC1ock11111111111111111111111111111111'
export const SYSVAR_RENT = 'SysvarRent111111111111111111111111111111111'
export const SYSVAR_STAKE_HISTORY = 'SysvarStakeHistory1111111111111111111111111'
/** Cuenta de config del stake: obsoleta en el programa, pero `DelegateStake` aún la exige en su lista. */
export const STAKE_CONFIG = 'StakeConfig11111111111111111111111111111111'
/** `PublicKey.default`: 32 ceros (custodio de un lockup vacío). */
export const DEFAULT_PUBKEY = SYSTEM_PROGRAM

export class SolanaCodecError extends Error {
	constructor(message: string) { super(message); this.name = 'SolanaCodecError' }
}

// ---------------------------------------------------------------------------
// Claves y bytes
// ---------------------------------------------------------------------------

export const pubkeyBytes = (address: string): Uint8Array => {
	let bytes: Uint8Array
	try { bytes = base58.decode(address) } catch { throw new SolanaCodecError(`solana: dirección no base58 ${address}`) }
	if (bytes.length !== 32) throw new SolanaCodecError(`solana: la dirección no mide 32 bytes (${address})`)
	return bytes
}

/** Dirección válida = base58 que decodifica a 32 bytes (on-curve o PDA: ambas pueden recibir). */
export const isValidSolanaAddress = (address: string): boolean => {
	if (typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false
	try { return base58.decode(address).length === 32 } catch { return false }
}

export const encodeBase58 = (bytes: Uint8Array): string => base58.encode(bytes)
export const toBase64 = (bytes: Uint8Array): string => base64.encode(bytes)
export const fromBase64 = (text: string): Uint8Array => base64.decode(text)

export const concat = (...parts: Uint8Array[]): Uint8Array => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
	let offset = 0
	for (const part of parts) { out.set(part, offset); offset += part.length }
	return out
}

export const ASCII = (text: string): Uint8Array => Uint8Array.from(text, ch => ch.charCodeAt(0))

export const u64le = (value: bigint): Uint8Array => {
	if (value < 0n || value > 0xffffffffffffffffn) throw new SolanaCodecError('solana: u64 fuera de rango')
	const out = new Uint8Array(8)
	let v = value
	for (let i = 0; i < 8; i++) { out[i] = Number(v & 0xffn); v >>= 8n }
	return out
}

export const readU64le = (bytes: Uint8Array, offset: number): bigint => {
	let v = 0n
	for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bytes[offset + i])
	return v
}

export const u32le = (value: number): Uint8Array => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
export const readU32le = (bytes: Uint8Array, offset: number): number => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0

export const encodeCompactU16 = (value: number): Uint8Array => {
	if (value < 0 || value > 0xffff) throw new SolanaCodecError('solana: compact-u16 fuera de rango')
	const out: number[] = []
	let v = value
	for (;;) {
		const byte = v & 0x7f
		v >>= 7
		if (v === 0) { out.push(byte); break }
		out.push(byte | 0x80)
	}
	return Uint8Array.from(out)
}

class Reader {
	offset = 0
	constructor(private readonly bytes: Uint8Array) { }
	private need(n: number) { if (this.offset + n > this.bytes.length) throw new SolanaCodecError('solana: tx truncada') }
	u8(): number { this.need(1); return this.bytes[this.offset++] }
	take(n: number): Uint8Array { this.need(n); const out = this.bytes.slice(this.offset, this.offset + n); this.offset += n; return out }
	compactU16(): number {
		let value = 0
		for (let shift = 0; shift < 21; shift += 7) {
			const byte = this.u8()
			value |= (byte & 0x7f) << shift
			if ((byte & 0x80) === 0) return value
		}
		throw new SolanaCodecError('solana: compact-u16 inválido')
	}
	done(): boolean { return this.offset === this.bytes.length }
}

// ---------------------------------------------------------------------------
// PDA / cuenta de token asociada
// ---------------------------------------------------------------------------

const isOnCurve = (bytes: Uint8Array): boolean => {
	try { ed25519.Point.fromBytes(bytes); return true } catch { return false }
}

/** `PublicKey.findProgramAddressSync`: primer bump (255→0) cuyo hash cae FUERA de la curva. */
export const findProgramAddress = (seeds: Uint8Array[], programId: string): { address: string, bump: number } => {
	const program = pubkeyBytes(programId)
	const marker = ASCII('ProgramDerivedAddress')
	for (let bump = 255; bump >= 0; bump--) {
		const hash = sha256(concat(...seeds, Uint8Array.of(bump), program, marker))
		if (!isOnCurve(hash)) return { address: base58.encode(hash), bump }
	}
	throw new SolanaCodecError('solana: sin bump válido para la PDA')
}

/**
 * `PublicKey.createWithSeed`: sha256(base · seed · programa). NO es una PDA (no se
 * comprueba la curva): es una dirección derivada que solo `base` puede crear, así que
 * la stake account nace con la MISMA firma del usuario, sin un segundo firmante.
 */
export const createWithSeed = (base: string, seed: string, programId: string): string => {
	const seedBytes = ASCII(seed)
	if (seedBytes.length > 32 || /[^\x20-\x7e]/.test(seed)) throw new SolanaCodecError('solana: semilla inválida (máx 32 bytes ASCII)')
	return base58.encode(sha256(concat(pubkeyBytes(base), seedBytes, pubkeyBytes(programId))))
}

/** Cuenta de token asociada (ATA) de `owner` para `mint` en el programa de tokens clásico. */
export const associatedTokenAddress = (owner: string, mint: string): string =>
	findProgramAddress([pubkeyBytes(owner), pubkeyBytes(TOKEN_PROGRAM), pubkeyBytes(mint)], ASSOCIATED_TOKEN_PROGRAM).address

// ---------------------------------------------------------------------------
// Instrucciones que la wallet construye
// ---------------------------------------------------------------------------

export type AccountMeta = { pubkey: string, isSigner: boolean, isWritable: boolean }
export type Instruction = { programId: string, keys: AccountMeta[], data: Uint8Array }

export const systemTransferIx = (from: string, to: string, lamports: bigint): Instruction => ({
	programId: SYSTEM_PROGRAM,
	keys: [{ pubkey: from, isSigner: true, isWritable: true }, { pubkey: to, isSigner: false, isWritable: true }],
	data: concat(u32le(2), u64le(lamports)),
})

export const setComputeUnitLimitIx = (units: number): Instruction => ({ programId: COMPUTE_BUDGET_PROGRAM, keys: [], data: concat(Uint8Array.of(2), u32le(units)) })
export const setComputeUnitPriceIx = (microLamports: bigint): Instruction => ({ programId: COMPUTE_BUDGET_PROGRAM, keys: [], data: concat(Uint8Array.of(3), u64le(microLamports)) })

/** Crea la ATA de `owner` si no existe (idempotente: no falla si ya está). La paga `payer`. */
export const createAssociatedTokenAccountIdempotentIx = (payer: string, owner: string, mint: string): Instruction => ({
	programId: ASSOCIATED_TOKEN_PROGRAM,
	keys: [
		{ pubkey: payer, isSigner: true, isWritable: true },
		{ pubkey: associatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
		{ pubkey: owner, isSigner: false, isWritable: false },
		{ pubkey: mint, isSigner: false, isWritable: false },
		{ pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
	],
	data: Uint8Array.of(1),
})

/** SPL `TransferChecked` (tag 12): cantidad y decimales viajan en la instrucción; el programa los contrasta con el mint. */
export const transferCheckedIx = ({ source, mint, destination, owner, amount, decimals }: { source: string, mint: string, destination: string, owner: string, amount: bigint, decimals: number }): Instruction => ({
	programId: TOKEN_PROGRAM,
	keys: [
		{ pubkey: source, isSigner: false, isWritable: true },
		{ pubkey: mint, isSigner: false, isWritable: false },
		{ pubkey: destination, isSigner: false, isWritable: true },
		{ pubkey: owner, isSigner: true, isWritable: false },
	],
	data: concat(Uint8Array.of(12), u64le(amount), Uint8Array.of(decimals)),
})

// ---------------------------------------------------------------------------
// Stake program (staking nativo). Layouts contrastados con web3.js 1.98 en los tests.
// ---------------------------------------------------------------------------

/**
 * System `CreateAccountWithSeed` (tag 3). La semilla viaja como string bincode (u64 de
 * longitud + bytes). Con `base === from` la lista lleva solo 2 cuentas: la firma del
 * pagador ya es la de la base.
 */
export const createAccountWithSeedIx = ({ from, newAccount, base, seed, lamports, space, owner }: {
	from: string, newAccount: string, base: string, seed: string, lamports: bigint, space: number, owner: string
}): Instruction => {
	const seedBytes = ASCII(seed)
	const keys: AccountMeta[] = [{ pubkey: from, isSigner: true, isWritable: true }, { pubkey: newAccount, isSigner: false, isWritable: true }]
	if (base !== from) keys.push({ pubkey: base, isSigner: true, isWritable: false })
	return {
		programId: SYSTEM_PROGRAM,
		keys,
		data: concat(u32le(3), pubkeyBytes(base), u64le(BigInt(seedBytes.length)), seedBytes, u64le(lamports), u64le(BigInt(space)), pubkeyBytes(owner)),
	}
}

/** Stake `Initialize` (0): autoridades staker/withdrawer y lockup VACÍO (sin custodio ni fecha). */
export const stakeInitializeIx = (stake: string, staker: string, withdrawer: string): Instruction => ({
	programId: STAKE_PROGRAM,
	keys: [{ pubkey: stake, isSigner: false, isWritable: true }, { pubkey: SYSVAR_RENT, isSigner: false, isWritable: false }],
	data: concat(u32le(0), pubkeyBytes(staker), pubkeyBytes(withdrawer), u64le(0n), u64le(0n), pubkeyBytes(DEFAULT_PUBKEY)),
})

/** Stake `DelegateStake` (2): delega la cuenta en una vote account. Firma el staker. */
export const stakeDelegateIx = (stake: string, vote: string, staker: string): Instruction => ({
	programId: STAKE_PROGRAM,
	keys: [
		{ pubkey: stake, isSigner: false, isWritable: true },
		{ pubkey: vote, isSigner: false, isWritable: false },
		{ pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
		{ pubkey: SYSVAR_STAKE_HISTORY, isSigner: false, isWritable: false },
		{ pubkey: STAKE_CONFIG, isSigner: false, isWritable: false },
		{ pubkey: staker, isSigner: true, isWritable: false },
	],
	data: u32le(2),
})

/** Stake `Deactivate` (5): empieza a salir; deja de rendir al final de la epoch. */
export const stakeDeactivateIx = (stake: string, staker: string): Instruction => ({
	programId: STAKE_PROGRAM,
	keys: [
		{ pubkey: stake, isSigner: false, isWritable: true },
		{ pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
		{ pubkey: staker, isSigner: true, isWritable: false },
	],
	data: u32le(5),
})

/** Stake `Withdraw` (4): saca `lamports` de la cuenta a `to`. Todo el saldo = la cuenta se cierra. */
export const stakeWithdrawIx = (stake: string, to: string, withdrawer: string, lamports: bigint): Instruction => ({
	programId: STAKE_PROGRAM,
	keys: [
		{ pubkey: stake, isSigner: false, isWritable: true },
		{ pubkey: to, isSigner: false, isWritable: true },
		{ pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
		{ pubkey: SYSVAR_STAKE_HISTORY, isSigner: false, isWritable: false },
		{ pubkey: withdrawer, isSigner: true, isWritable: false },
	],
	data: concat(u32le(4), u64le(lamports)),
})

// ---------------------------------------------------------------------------
// Mensaje legacy
// ---------------------------------------------------------------------------

export type CompiledInstruction = { programIdIndex: number, accounts: number[], data: Uint8Array }

export type SolanaMessage = {
	numRequiredSignatures: number
	numReadonlySigned: number
	numReadonlyUnsigned: number
	accountKeys: string[]
	recentBlockhash: string
	instructions: CompiledInstruction[]
}

/**
 * Compila instrucciones a mensaje: fee payer primero; luego firmantes escribibles,
 * firmantes de solo lectura, escribibles y de solo lectura (los programas entran como
 * cuentas de solo lectura). Dentro de cada grupo, orden estable por dirección — cualquier
 * orden válido produce la misma semántica; no hace falta calcar el `localeCompare` del SDK.
 */
export const compileMessage = (feePayer: string, instructions: Instruction[], recentBlockhash: string): SolanaMessage => {
	const metas = new Map<string, { isSigner: boolean, isWritable: boolean }>()
	const touch = (pubkey: string, isSigner: boolean, isWritable: boolean) => {
		pubkeyBytes(pubkey)
		const prev = metas.get(pubkey)
		metas.set(pubkey, { isSigner: (prev?.isSigner ?? false) || isSigner, isWritable: (prev?.isWritable ?? false) || isWritable })
	}
	touch(feePayer, true, true)
	for (const ix of instructions) {
		for (const key of ix.keys) touch(key.pubkey, key.isSigner, key.isWritable)
		touch(ix.programId, false, false)
	}
	const rank = (m: { isSigner: boolean, isWritable: boolean }) => (m.isSigner ? (m.isWritable ? 0 : 1) : (m.isWritable ? 2 : 3))
	const ordered = [...metas.entries()]
		.filter(([key]) => key !== feePayer)
		.sort(([ka, a], [kb, b]) => rank(a) - rank(b) || (ka < kb ? -1 : ka > kb ? 1 : 0))
	const all: Array<[string, { isSigner: boolean, isWritable: boolean }]> = [[feePayer, metas.get(feePayer)!], ...ordered]
	const accountKeys = all.map(([key]) => key)
	const index = new Map(accountKeys.map((key, i) => [key, i]))
	pubkeyBytes(recentBlockhash)
	return {
		numRequiredSignatures: all.filter(([, m]) => m.isSigner).length,
		numReadonlySigned: all.filter(([, m]) => m.isSigner && !m.isWritable).length,
		numReadonlyUnsigned: all.filter(([, m]) => !m.isSigner && !m.isWritable).length,
		accountKeys,
		recentBlockhash,
		instructions: instructions.map(ix => ({ programIdIndex: index.get(ix.programId)!, accounts: ix.keys.map(k => index.get(k.pubkey)!), data: ix.data })),
	}
}

export const serializeMessage = (message: SolanaMessage): Uint8Array => concat(
	Uint8Array.of(message.numRequiredSignatures, message.numReadonlySigned, message.numReadonlyUnsigned),
	encodeCompactU16(message.accountKeys.length),
	...message.accountKeys.map(pubkeyBytes),
	pubkeyBytes(message.recentBlockhash),
	encodeCompactU16(message.instructions.length),
	...message.instructions.flatMap(ix => [
		Uint8Array.of(ix.programIdIndex),
		encodeCompactU16(ix.accounts.length),
		Uint8Array.from(ix.accounts),
		encodeCompactU16(ix.data.length),
		ix.data,
	]),
)

const readMessage = (reader: Reader): SolanaMessage => {
	const first = reader.u8()
	// Bit alto = mensaje versionado (v0 con lookup tables): la wallet no los construye ni los acepta
	if (first & 0x80) throw new SolanaCodecError('solana: mensaje versionado no soportado')
	const numRequiredSignatures = first
	const numReadonlySigned = reader.u8()
	const numReadonlyUnsigned = reader.u8()
	const accountKeys = Array.from({ length: reader.compactU16() }, () => base58.encode(reader.take(32)))
	const recentBlockhash = base58.encode(reader.take(32))
	const instructions = Array.from({ length: reader.compactU16() }, () => {
		const programIdIndex = reader.u8()
		const accounts = Array.from(reader.take(reader.compactU16()))
		const data = reader.take(reader.compactU16())
		if (programIdIndex >= accountKeys.length || accounts.some(i => i >= accountKeys.length)) throw new SolanaCodecError('solana: índice de cuenta fuera de rango')
		return { programIdIndex, accounts, data }
	})
	return { numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned, accountKeys, recentBlockhash, instructions }
}

export const deserializeMessage = (bytes: Uint8Array): SolanaMessage => {
	const reader = new Reader(bytes)
	const message = readMessage(reader)
	if (!reader.done()) throw new SolanaCodecError('solana: bytes sobrantes tras el mensaje')
	return message
}

// ---------------------------------------------------------------------------
// Transacción
// ---------------------------------------------------------------------------

export type SolanaTransaction = {
	/** Una por firmante requerido, en orden de `accountKeys`; null = hueco sin firmar (64 ceros). */
	signatures: Array<Uint8Array | null>
	message: SolanaMessage
	messageBytes: Uint8Array
}

const EMPTY_SIGNATURE = new Uint8Array(64)

export const serializeTransaction = (tx: SolanaTransaction): Uint8Array => concat(
	encodeCompactU16(tx.signatures.length),
	...tx.signatures.map(sig => sig ?? EMPTY_SIGNATURE),
	tx.messageBytes,
)

export const deserializeTransaction = (bytes: Uint8Array): SolanaTransaction => {
	const reader = new Reader(bytes)
	const count = reader.compactU16()
	const signatures = Array.from({ length: count }, () => {
		const sig = reader.take(64)
		return sig.every(b => b === 0) ? null : sig
	})
	const start = reader.offset
	const message = readMessage(reader)
	if (!reader.done()) throw new SolanaCodecError('solana: bytes sobrantes tras la tx')
	if (count !== message.numRequiredSignatures) throw new SolanaCodecError('solana: número de firmas distinto de la cabecera')
	return { signatures, message, messageBytes: bytes.slice(start) }
}

/** Metadatos de cada cuenta del mensaje según la cabecera. */
export const accountMetaAt = (message: SolanaMessage, index: number): { isSigner: boolean, isWritable: boolean } => {
	const n = message.accountKeys.length
	const isSigner = index < message.numRequiredSignatures
	const isWritable = isSigner
		? index < message.numRequiredSignatures - message.numReadonlySigned
		: index < n - message.numReadonlyUnsigned
	return { isSigner, isWritable }
}

/** El id de una tx de Solana es la PRIMERA firma (la del fee payer) en base58. */
export const transactionId = (tx: SolanaTransaction): string | null => (tx.signatures[0] ? base58.encode(tx.signatures[0]) : null)

// ---------------------------------------------------------------------------
// Mensaje v0 (versionado, con address lookup tables)
//
// Lo exige el swap de Jupiter: una ruta toca 30+ cuentas y el mensaje legacy no cabe en los
// 1232 bytes de un paquete. Las lookup tables (ALT) son cuentas on-chain con listas de
// direcciones; el mensaje referencia una dirección por (tabla, índice) en 1 byte en vez de 32.
//
//   mensaje v0 = 0x80 · cabecera(3) · compact(n) · n × pubkey · blockhash
//                · compact(n ix) · instrucciones · compact(n lookups)
//                · lookups: pubkey de la tabla · compact(n) · índices escribibles
//                                              · compact(n) · índices de solo lectura
//
// Las cuentas del mensaje son, por este orden: las estáticas, las escribibles cargadas de
// todas las tablas (en el orden de los lookups) y luego las de solo lectura cargadas.
// Firmantes y programas invocados van SIEMPRE estáticos.
//
// La compilación calca la de @solana/web3.js 1.98 (orden de inserción, payer primero) para
// que los vectores dorados coincidan BYTE A BYTE, no solo en significado.
// ---------------------------------------------------------------------------

export type AddressLookupTable = { key: string, addresses: string[] }

export type MessageAddressTableLookup = { accountKey: string, writableIndexes: number[], readonlyIndexes: number[] }

export type SolanaMessageV0 = {
	version: 0
	numRequiredSignatures: number
	numReadonlySigned: number
	numReadonlyUnsigned: number
	staticAccountKeys: string[]
	recentBlockhash: string
	instructions: CompiledInstruction[]
	addressTableLookups: MessageAddressTableLookup[]
}

/** Prefijo del mensaje versionado: bit alto + versión 0. */
const V0_PREFIX = 0x80

/** Cabecera de una ALT on-chain: tipo, desactivación, último slot extendido, índice, autoridad opcional y relleno. */
export const LOOKUP_TABLE_META_SIZE = 56

/** Datos de una cuenta ALT → sus direcciones. Lanza si la cuenta no tiene esa forma. */
export const decodeAddressLookupTable = (data: Uint8Array): string[] => {
	if (data.length < LOOKUP_TABLE_META_SIZE || (data.length - LOOKUP_TABLE_META_SIZE) % 32 !== 0) throw new SolanaCodecError('solana: lookup table con tamaño inválido')
	if (readU32le(data, 0) !== 1) throw new SolanaCodecError('solana: la cuenta no es una lookup table')
	const out: string[] = []
	for (let offset = LOOKUP_TABLE_META_SIZE; offset < data.length; offset += 32) out.push(base58.encode(data.slice(offset, offset + 32)))
	return out
}

type KeyMeta = { isSigner: boolean, isWritable: boolean, isInvoked: boolean }

/**
 * Compila a mensaje v0 (= `MessageV0.compile` de web3.js). Una cuenta va a una tabla solo si
 * no firma, no es un programa invocado y la tabla la contiene; el resto, estática.
 */
export const compileV0Message = (feePayer: string, instructions: Instruction[], recentBlockhash: string, tables: AddressLookupTable[] = []): SolanaMessageV0 => {
	const metas = new Map<string, KeyMeta>()
	const touch = (pubkey: string): KeyMeta => {
		pubkeyBytes(pubkey)
		let meta = metas.get(pubkey)
		if (!meta) { meta = { isSigner: false, isWritable: false, isInvoked: false }; metas.set(pubkey, meta) }
		return meta
	}
	const payer = touch(feePayer)
	payer.isSigner = true
	payer.isWritable = true
	for (const ix of instructions) {
		touch(ix.programId).isInvoked = true
		for (const key of ix.keys) {
			const meta = touch(key.pubkey)
			meta.isSigner ||= key.isSigner
			meta.isWritable ||= key.isWritable
		}
	}

	const lookups: MessageAddressTableLookup[] = []
	const loadedWritable: string[] = []
	const loadedReadonly: string[] = []
	const drain = (table: AddressLookupTable, filter: (m: KeyMeta) => boolean): [number[], string[]] => {
		const indexes: number[] = []
		const drained: string[] = []
		for (const [address, meta] of [...metas.entries()]) {
			if (!filter(meta)) continue
			const index = table.addresses.indexOf(address)
			if (index < 0) continue
			if (index > 255) throw new SolanaCodecError('solana: índice de lookup table > 255')
			indexes.push(index)
			drained.push(address)
			metas.delete(address)
		}
		return [indexes, drained]
	}
	for (const table of tables) {
		const [writableIndexes, writable] = drain(table, m => !m.isSigner && !m.isInvoked && m.isWritable)
		const [readonlyIndexes, readonly] = drain(table, m => !m.isSigner && !m.isInvoked && !m.isWritable)
		if (writableIndexes.length === 0 && readonlyIndexes.length === 0) continue
		lookups.push({ accountKey: table.key, writableIndexes, readonlyIndexes })
		loadedWritable.push(...writable)
		loadedReadonly.push(...readonly)
	}

	const entries = [...metas.entries()]
	const group = (signer: boolean, writable: boolean) => entries.filter(([, m]) => m.isSigner === signer && m.isWritable === writable).map(([key]) => key)
	const writableSigners = group(true, true)
	const readonlySigners = group(true, false)
	const writableNonSigners = group(false, true)
	const readonlyNonSigners = group(false, false)
	if (writableSigners[0] !== feePayer) throw new SolanaCodecError('solana: el fee payer debe ser el primer firmante')
	const staticAccountKeys = [...writableSigners, ...readonlySigners, ...writableNonSigners, ...readonlyNonSigners]

	const all = [...staticAccountKeys, ...loadedWritable, ...loadedReadonly]
	const index = new Map(all.map((key, i) => [key, i]))
	pubkeyBytes(recentBlockhash)
	return {
		version: 0,
		numRequiredSignatures: writableSigners.length + readonlySigners.length,
		numReadonlySigned: readonlySigners.length,
		numReadonlyUnsigned: readonlyNonSigners.length,
		staticAccountKeys,
		recentBlockhash,
		instructions: instructions.map(ix => ({ programIdIndex: index.get(ix.programId)!, accounts: ix.keys.map(k => index.get(k.pubkey)!), data: ix.data })),
		addressTableLookups: lookups,
	}
}

export const serializeV0Message = (message: SolanaMessageV0): Uint8Array => concat(
	Uint8Array.of(V0_PREFIX, message.numRequiredSignatures, message.numReadonlySigned, message.numReadonlyUnsigned),
	encodeCompactU16(message.staticAccountKeys.length),
	...message.staticAccountKeys.map(pubkeyBytes),
	pubkeyBytes(message.recentBlockhash),
	encodeCompactU16(message.instructions.length),
	...message.instructions.flatMap(ix => [
		Uint8Array.of(ix.programIdIndex),
		encodeCompactU16(ix.accounts.length),
		Uint8Array.from(ix.accounts),
		encodeCompactU16(ix.data.length),
		ix.data,
	]),
	encodeCompactU16(message.addressTableLookups.length),
	...message.addressTableLookups.flatMap(l => [
		pubkeyBytes(l.accountKey),
		encodeCompactU16(l.writableIndexes.length),
		Uint8Array.from(l.writableIndexes),
		encodeCompactU16(l.readonlyIndexes.length),
		Uint8Array.from(l.readonlyIndexes),
	]),
)

const readV0Message = (reader: Reader): SolanaMessageV0 => {
	const prefix = reader.u8()
	if (prefix !== V0_PREFIX) throw new SolanaCodecError(prefix & 0x80 ? `solana: versión de mensaje ${prefix & 0x7f} no soportada` : 'solana: se esperaba un mensaje v0')
	const numRequiredSignatures = reader.u8()
	const numReadonlySigned = reader.u8()
	const numReadonlyUnsigned = reader.u8()
	const staticAccountKeys = Array.from({ length: reader.compactU16() }, () => base58.encode(reader.take(32)))
	const recentBlockhash = base58.encode(reader.take(32))
	const instructions = Array.from({ length: reader.compactU16() }, () => {
		const programIdIndex = reader.u8()
		const accounts = Array.from(reader.take(reader.compactU16()))
		const data = reader.take(reader.compactU16())
		return { programIdIndex, accounts, data }
	})
	const addressTableLookups = Array.from({ length: reader.compactU16() }, () => ({
		accountKey: base58.encode(reader.take(32)),
		writableIndexes: Array.from(reader.take(reader.compactU16())),
		readonlyIndexes: Array.from(reader.take(reader.compactU16())),
	}))
	const total = staticAccountKeys.length + addressTableLookups.reduce((n, l) => n + l.writableIndexes.length + l.readonlyIndexes.length, 0)
	if (total > 256) throw new SolanaCodecError('solana: demasiadas cuentas')
	// Un programa invocado no puede venir de una tabla: los índices de programa son estáticos
	if (instructions.some(ix => ix.programIdIndex >= staticAccountKeys.length || ix.accounts.some(i => i >= total))) throw new SolanaCodecError('solana: índice de cuenta fuera de rango')
	if (numRequiredSignatures > staticAccountKeys.length) throw new SolanaCodecError('solana: cabecera incoherente')
	return { version: 0, numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned, staticAccountKeys, recentBlockhash, instructions, addressTableLookups }
}

export const deserializeV0Message = (bytes: Uint8Array): SolanaMessageV0 => {
	const reader = new Reader(bytes)
	const message = readV0Message(reader)
	if (!reader.done()) throw new SolanaCodecError('solana: bytes sobrantes tras el mensaje')
	return message
}

export type ResolvedAccount = { pubkey: string, isSigner: boolean, isWritable: boolean }

/**
 * Todas las cuentas del mensaje con sus permisos, cargando las de las tablas con el
 * contenido que se PASA (el que la wallet leyó de la cadena). Una tabla que falte o un
 * índice que no exista lanzan: nunca se adivina a qué cuenta apunta un índice.
 */
export const resolveV0Accounts = (message: SolanaMessageV0, tables: AddressLookupTable[]): ResolvedAccount[] => {
	const byKey = new Map(tables.map(t => [t.key, t.addresses]))
	const load = (kind: 'writableIndexes' | 'readonlyIndexes') => message.addressTableLookups.flatMap(l => {
		const addresses = byKey.get(l.accountKey)
		if (!addresses) throw new SolanaCodecError(`solana: falta la lookup table ${l.accountKey}`)
		return l[kind].map(i => {
			if (i >= addresses.length) throw new SolanaCodecError('solana: índice fuera de la lookup table')
			return addresses[i]
		})
	})
	const n = message.staticAccountKeys.length
	const statics = message.staticAccountKeys.map((pubkey, i) => {
		const isSigner = i < message.numRequiredSignatures
		const isWritable = isSigner ? i < message.numRequiredSignatures - message.numReadonlySigned : i < n - message.numReadonlyUnsigned
		return { pubkey, isSigner, isWritable }
	})
	return [
		...statics,
		...load('writableIndexes').map(pubkey => ({ pubkey, isSigner: false, isWritable: true })),
		...load('readonlyIndexes').map(pubkey => ({ pubkey, isSigner: false, isWritable: false })),
	]
}

/** Instrucciones del mensaje con sus cuentas ya resueltas: lo que de verdad hará la tx. */
export const decompileV0Instructions = (message: SolanaMessageV0, tables: AddressLookupTable[]): Instruction[] => {
	const accounts = resolveV0Accounts(message, tables)
	return message.instructions.map(ix => ({
		programId: accounts[ix.programIdIndex].pubkey,
		keys: ix.accounts.map(i => ({ ...accounts[i] })),
		data: ix.data,
	}))
}

export type SolanaTransactionV0 = { signatures: Array<Uint8Array | null>, message: SolanaMessageV0, messageBytes: Uint8Array }

export const serializeTransactionV0 = (tx: SolanaTransactionV0): Uint8Array => concat(
	encodeCompactU16(tx.signatures.length),
	...tx.signatures.map(sig => sig ?? EMPTY_SIGNATURE),
	tx.messageBytes,
)

export const deserializeTransactionV0 = (bytes: Uint8Array): SolanaTransactionV0 => {
	const reader = new Reader(bytes)
	const count = reader.compactU16()
	const signatures = Array.from({ length: count }, () => {
		const sig = reader.take(64)
		return sig.every(b => b === 0) ? null : sig
	})
	const start = reader.offset
	const message = readV0Message(reader)
	if (!reader.done()) throw new SolanaCodecError('solana: bytes sobrantes tras la tx')
	if (count !== message.numRequiredSignatures) throw new SolanaCodecError('solana: número de firmas distinto de la cabecera')
	return { signatures, message, messageBytes: bytes.slice(start) }
}
