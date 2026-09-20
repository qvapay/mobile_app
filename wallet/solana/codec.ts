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

const concat = (...parts: Uint8Array[]): Uint8Array => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
	let offset = 0
	for (const part of parts) { out.set(part, offset); offset += part.length }
	return out
}

const ASCII = (text: string): Uint8Array => Uint8Array.from(text, ch => ch.charCodeAt(0))

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
