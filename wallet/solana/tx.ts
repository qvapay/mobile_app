/**
 * Enviar en Solana: SOL nativo y tokens SPL (USDT/USDC). Módulo PURO (fetch global vía
 * `jsonRpc`, codec propio), tests en node.
 *
 * Flujo (mismo contrato que TRON/EVM/BTC/Stacks): la app construye el mensaje, lo firma
 * con la clave SLIP-0010 y, antes de difundir, lo RE-DECODIFICA y exige que diga
 * exactamente lo pedido (regla 6). Particularidades de Solana:
 * - No hay nonce: la tx lleva un `recentBlockhash` que caduca en ~60–90 s. Una tx caducada
 *   nunca puede aterrizar, así que reconstruir y volver a firmar es seguro (`expiresAt`).
 * - Enviar un token a una wallet sin cuenta de ese token exige crear su cuenta asociada
 *   (ATA): la paga el fee payer (~0.002 SOL de renta, recuperable solo por el destinatario).
 * - `feePayer` distinto del remitente = tx patrocinada: el usuario firma solo su hueco y la
 *   co-firma QvaPay en el backend; la app nunca la difunde.
 */
import { ed25519 } from '@noble/curves/ed25519.js'

import { ChainHttpError, jsonRpc } from '../chains/http'
import type { RegistryRpc } from '../registry/types'
import {
	associatedTokenAddress,
	compileMessage,
	COMPUTE_BUDGET_PROGRAM,
	createAssociatedTokenAccountIdempotentIx,
	deserializeTransaction,
	encodeBase58,
	isValidSolanaAddress,
	pubkeyBytes,
	readU32le,
	readU64le,
	serializeMessage,
	serializeTransaction,
	setComputeUnitLimitIx,
	setComputeUnitPriceIx,
	systemTransferIx,
	toBase64,
	fromBase64,
	transferCheckedIx,
	ASSOCIATED_TOKEN_PROGRAM,
	SYSTEM_PROGRAM,
	TOKEN_PROGRAM,
} from './codec'
import type { Instruction, SolanaMessage } from './codec'

/** Tarifa base por firma (lamports). */
export const LAMPORTS_PER_SIGNATURE = 5000n
/** Tope de precio de prioridad (micro-lamports por unidad de cómputo): por encima, la lectura está rota. */
export const MAX_PRIORITY_MICROLAMPORTS = 200_000n
/** Límites de cómputo generosos pero acotados: pasarse falla la tx y cobra la tarifa. */
const COMPUTE_UNITS = { native: 2_000, token: 40_000, tokenWithCreate: 80_000 }
/** Espacio de una cuenta de token SPL clásica (renta de la ATA del destinatario). */
const TOKEN_ACCOUNT_SPACE = 165
/** Vigencia práctica del blockhash (la real es ~150 bloques ≈ 60–90 s): se reconstruye antes. */
export const BLOCKHASH_TTL_MS = 60_000

export class SolanaVerifyError extends Error {
	constructor(message: string) { super(message); this.name = 'SolanaVerifyError' }
}

/** Blockhash caducado: el nodo ya no aceptará esta firma; hay que reconstruir y firmar otra vez. */
export class SolanaExpiredError extends Error {
	constructor(message = 'solana: la transacción caducó (blockhash)') { super(message); this.name = 'SolanaExpiredError' }
}

export type SolanaSendIntent = {
	from: string
	to: string
	/** Lamports (SOL) o unidades mínimas del token. */
	amount: bigint
	/** null = SOL nativo; si no, mint SPL. */
	mint: string | null
	decimals: number
}

export type PreparedSolanaSend = {
	intent: SolanaSendIntent
	/** Quien paga tarifa y renta: el propio remitente, o QvaPay si es patrocinada. */
	feePayer: string
	sponsored: boolean
	message: SolanaMessage
	messageBytes: Uint8Array
	recentBlockhash: string
	lastValidBlockHeight: number
	/** Tarifa de red en lamports (firmas + prioridad). */
	feeLamports: bigint
	/** Renta de la cuenta de token del destinatario si hay que crearla (0 si ya existe). */
	rentLamports: bigint
	createsTokenAccount: boolean
	computeUnitPrice: bigint
	computeUnitLimit: number
	expiresAt: number
}

export type SignedSolanaTx = {
	base64: string
	/** Firma del remitente (base58). En una tx no patrocinada es además su id. */
	signature: string
	/** Id de la tx (firma del fee payer); null si falta la firma del patrocinador. */
	txid: string | null
}

type Deps = { signal?: AbortSignal, feePayer?: string | null, now?: () => number }

const rpcCall = <T>(rpc: RegistryRpc, method: string, params: unknown[], signal?: AbortSignal) => jsonRpc<T>(rpc.url, method, params, { signal, headers: rpc.headers })

type AccountInfo = { value: { owner: string, lamports: number } | null }

/**
 * Mínimo exento de renta de una cuenta de sistema (0 bytes de datos), ~890.880 lamports.
 *
 * Importa en los dos extremos de un envío de SOL: una cuenta NUEVA debe recibir al menos
 * esto, y la del remitente no puede quedarse por debajo con saldo distinto de cero. El
 * runtime rechaza la transacción con `InsufficientFundsForRent`, y como pasa en la
 * simulación el usuario solo ve "Transaction simulation failed".
 */
export const getSolanaRentExemptMinimum = async (rpc: RegistryRpc, { signal }: { signal?: AbortSignal } = {}): Promise<bigint> =>
	BigInt(await rpcCall<number>(rpc, 'getMinimumBalanceForRentExemption', [0], signal))

/** Mediana de las tarifas de prioridad recientes (las no nulas), con tope. PURO. */
export const priorityFeeFrom = (fees: Array<{ prioritizationFee?: number }> | undefined): bigint => {
	const values = (fees ?? []).map(f => f.prioritizationFee ?? 0).filter(v => v > 0).sort((a, b) => a - b)
	if (values.length === 0) return 0n
	const median = BigInt(Math.ceil(values[Math.floor(values.length / 2)]))
	return median > MAX_PRIORITY_MICROLAMPORTS ? MAX_PRIORITY_MICROLAMPORTS : median
}

/** Coste en lamports del precio de prioridad sobre el límite de cómputo (redondeo hacia arriba). */
const priorityLamports = (price: bigint, limit: number): bigint => (price * BigInt(limit) + 999_999n) / 1_000_000n

export const prepareSolanaSend = async (rpc: RegistryRpc, intent: SolanaSendIntent, deps: Deps = {}): Promise<PreparedSolanaSend> => {
	const { signal } = deps
	const now = deps.now ?? Date.now
	if (!isValidSolanaAddress(intent.from)) throw new ChainHttpError('solana: remitente inválido', { retryable: false })
	if (!isValidSolanaAddress(intent.to)) throw new ChainHttpError('solana: destino inválido', { retryable: false })
	if (intent.to === intent.from) throw new ChainHttpError('solana: el destino es tu propia dirección', { retryable: false })
	if (intent.amount <= 0n) throw new ChainHttpError('solana: cantidad inválida', { retryable: false })
	const feePayer = deps.feePayer ?? intent.from
	if (!isValidSolanaAddress(feePayer)) throw new ChainHttpError('solana: fee payer inválido', { retryable: false })

	const destAta = intent.mint ? associatedTokenAddress(intent.to, intent.mint) : null
	const [latest, fees, toInfo, destAtaInfo] = await Promise.all([
		rpcCall<{ value: { blockhash: string, lastValidBlockHeight: number } }>(rpc, 'getLatestBlockhash', [{ commitment: 'confirmed' }], signal),
		rpcCall<Array<{ prioritizationFee?: number }>>(rpc, 'getRecentPrioritizationFees', [], signal).catch(() => []),
		rpcCall<AccountInfo>(rpc, 'getAccountInfo', [intent.to, { encoding: 'base64', commitment: 'confirmed' }], signal),
		destAta ? rpcCall<AccountInfo>(rpc, 'getAccountInfo', [destAta, { encoding: 'base64', commitment: 'confirmed' }], signal) : Promise.resolve(null),
	])

	// Pegar la cuenta de token (y no la wallet) como destino crearía una ATA de una ATA: fondos perdidos
	if (toInfo?.value?.owner === TOKEN_PROGRAM) throw new ChainHttpError('solana: el destino es una cuenta de token; usa la dirección de la wallet', { retryable: false })

	const instructions: Instruction[] = []
	let rentLamports = 0n
	let rentMinimum = 0n
	let senderBalance = 0n
	let createsTokenAccount = false
	let computeUnitLimit: number

	if (intent.mint === null) {
		rentMinimum = await getSolanaRentExemptMinimum(rpc, { signal })
		if (!toInfo?.value) {
			// Una cuenta nueva debe quedar exenta de renta o el nodo rechaza la tx
			if (intent.amount < rentMinimum) throw new ChainHttpError(`solana: a una dirección nueva hay que enviar al menos ${rentMinimum} lamports`, { retryable: false })
		}
		senderBalance = BigInt((await rpcCall<{ value: number }>(rpc, 'getBalance', [intent.from, { commitment: 'confirmed' }], signal)).value)
		computeUnitLimit = COMPUTE_UNITS.native
		instructions.push(systemTransferIx(intent.from, intent.to, intent.amount))
	} else {
		createsTokenAccount = !destAtaInfo?.value
		if (createsTokenAccount) {
			rentLamports = BigInt(await rpcCall<number>(rpc, 'getMinimumBalanceForRentExemption', [TOKEN_ACCOUNT_SPACE], signal))
			instructions.push(createAssociatedTokenAccountIdempotentIx(feePayer, intent.to, intent.mint))
		}
		computeUnitLimit = createsTokenAccount ? COMPUTE_UNITS.tokenWithCreate : COMPUTE_UNITS.token
		instructions.push(transferCheckedIx({
			source: associatedTokenAddress(intent.from, intent.mint),
			mint: intent.mint,
			destination: destAta!,
			owner: intent.from,
			amount: intent.amount,
			decimals: intent.decimals,
		}))
	}

	const computeUnitPrice = priorityFeeFrom(fees)
	if (computeUnitPrice > 0n) instructions.unshift(setComputeUnitLimitIx(computeUnitLimit), setComputeUnitPriceIx(computeUnitPrice))

	const message = compileMessage(feePayer, instructions, latest.value.blockhash)
	const feeLamports = LAMPORTS_PER_SIGNATURE * BigInt(message.numRequiredSignatures) + (computeUnitPrice > 0n ? priorityLamports(computeUnitPrice, computeUnitLimit) : 0n)

	// La regla de renta de Solana: una cuenta que HOY está exenta no puede quedar por
	// debajo del mínimo con saldo distinto de cero. Vaciarla del todo sí vale (se
	// cierra), y una que ya estaba por debajo puede seguir operando — solo se prohíbe
	// cruzar el umbral hacia abajo. Un "enviar todo" que deja 15.000 lamports cae justo
	// ahí, y el rechazo llega en la simulación como un "Transaction simulation failed"
	// que no explica nada.
	if (intent.mint === null && senderBalance >= rentMinimum) {
		const left = senderBalance - intent.amount - feeLamports
		if (left > 0n && left < rentMinimum) {
			throw new ChainHttpError(`solana: te quedarían ${left} lamports y una cuenta necesita ${rentMinimum} para seguir existiendo; envía un poco menos`, { retryable: false })
		}
	}

	return {
		intent,
		feePayer,
		sponsored: feePayer !== intent.from,
		message,
		messageBytes: serializeMessage(message),
		recentBlockhash: latest.value.blockhash,
		lastValidBlockHeight: latest.value.lastValidBlockHeight,
		feeLamports,
		rentLamports,
		createsTokenAccount,
		computeUnitPrice,
		computeUnitLimit,
		expiresAt: now() + BLOCKHASH_TTL_MS,
	}
}

// ---------------------------------------------------------------------------
// Firma y verificación
// ---------------------------------------------------------------------------

/** Pública ed25519 (base58) de una clave privada de 32 bytes. */
export const solanaAddressFromPrivateKey = (privateKey: Uint8Array): string => encodeBase58(ed25519.getPublicKey(privateKey))

/** Firma el hueco del remitente. Verifica re-decodificando antes de devolver. */
export const signSolanaTransaction = (prepared: PreparedSolanaSend, privateKey: Uint8Array): SignedSolanaTx => {
	if (solanaAddressFromPrivateKey(privateKey) !== prepared.intent.from) throw new SolanaVerifyError('la clave no corresponde al remitente')
	const signerIndex = prepared.message.accountKeys.indexOf(prepared.intent.from)
	if (signerIndex < 0 || signerIndex >= prepared.message.numRequiredSignatures) throw new SolanaVerifyError('el remitente no es firmante del mensaje')
	const signatures: Array<Uint8Array | null> = Array.from({ length: prepared.message.numRequiredSignatures }, () => null)
	const signature = ed25519.sign(prepared.messageBytes, privateKey)
	signatures[signerIndex] = signature
	const bytes = serializeTransaction({ signatures, message: prepared.message, messageBytes: prepared.messageBytes })
	const signed: SignedSolanaTx = { base64: toBase64(bytes), signature: encodeBase58(signature), txid: signerIndex === 0 ? encodeBase58(signature) : null }
	verifySignedSolanaTransaction(signed, prepared)
	return signed
}

/** Lo que mueve una tx de la wallet, decodificado de sus instrucciones. PURO. */
export type DecodedSolanaTransfer = {
	feePayer: string
	kind: 'native' | 'token'
	from: string
	to: string
	amount: bigint
	mint: string | null
	decimals: number | null
	createsTokenAccountFor: string | null
	computeUnitLimit: number | null
	computeUnitPrice: bigint | null
}

/**
 * Decodifica una tx con la forma exacta que construye la wallet y rechaza cualquier otra:
 * solo ComputeBudget (límite/precio), como mucho una creación de ATA pagada por el fee payer
 * y exactamente UNA transferencia (System transfer o SPL TransferChecked).
 */
export const decodeSolanaTransfer = (message: SolanaMessage): DecodedSolanaTransfer => {
	const key = (i: number) => message.accountKeys[i]
	let transfer: Pick<DecodedSolanaTransfer, 'kind' | 'from' | 'to' | 'amount' | 'mint' | 'decimals'> | null = null
	let createsTokenAccountFor: string | null = null
	let createAta: string | null = null
	let computeUnitLimit: number | null = null
	let computeUnitPrice: bigint | null = null

	for (const ix of message.instructions) {
		const program = key(ix.programIdIndex)
		const data = ix.data
		if (program === COMPUTE_BUDGET_PROGRAM) {
			if (data[0] === 2 && data.length === 5 && computeUnitLimit === null) computeUnitLimit = readU32le(data, 1)
			else if (data[0] === 3 && data.length === 9 && computeUnitPrice === null) computeUnitPrice = readU64le(data, 1)
			else throw new SolanaVerifyError('instrucción de compute budget no permitida')
		} else if (program === ASSOCIATED_TOKEN_PROGRAM) {
			if (createsTokenAccountFor !== null || ix.accounts.length !== 6 || data.length !== 1 || (data[0] !== 1 && data[0] !== 0)) throw new SolanaVerifyError('creación de cuenta de token no permitida')
			if (key(ix.accounts[0]) !== key(0)) throw new SolanaVerifyError('la cuenta de token la debe pagar el fee payer')
			if (key(ix.accounts[4]) !== SYSTEM_PROGRAM || key(ix.accounts[5]) !== TOKEN_PROGRAM) throw new SolanaVerifyError('creación de cuenta con programas inesperados')
			createAta = key(ix.accounts[1])
			createsTokenAccountFor = key(ix.accounts[2])
			if (associatedTokenAddress(createsTokenAccountFor, key(ix.accounts[3])) !== createAta) throw new SolanaVerifyError('la cuenta creada no es la asociada del destino')
		} else if (program === SYSTEM_PROGRAM) {
			if (transfer || ix.accounts.length !== 2 || data.length !== 12 || readU32le(data, 0) !== 2) throw new SolanaVerifyError('instrucción de sistema no permitida')
			transfer = { kind: 'native', from: key(ix.accounts[0]), to: key(ix.accounts[1]), amount: readU64le(data, 4), mint: null, decimals: null }
		} else if (program === TOKEN_PROGRAM) {
			if (transfer || ix.accounts.length !== 4 || data.length !== 10 || data[0] !== 12) throw new SolanaVerifyError('instrucción de token no permitida')
			const [source, mint, destination, owner] = ix.accounts.map(key)
			if (associatedTokenAddress(owner, mint) !== source) throw new SolanaVerifyError('la cuenta origen no es la asociada del remitente')
			transfer = { kind: 'token', from: owner, to: destination, amount: readU64le(data, 1), mint, decimals: data[9] }
		} else {
			throw new SolanaVerifyError(`programa no permitido ${program}`)
		}
	}
	if (!transfer) throw new SolanaVerifyError('la transacción no transfiere nada')
	if (createAta !== null && (transfer.kind !== 'token' || createAta !== transfer.to)) throw new SolanaVerifyError('la cuenta creada no es la del destino de la transferencia')
	// En un token, `to` es la ATA destino: se devuelve el dueño si se creó la cuenta en la misma tx
	return { feePayer: key(0), ...transfer, createsTokenAccountFor, computeUnitLimit, computeUnitPrice }
}

export const verifySignedSolanaTransaction = ({ base64 }: SignedSolanaTx, prepared: PreparedSolanaSend): void => {
	const tx = deserializeTransaction(fromBase64(base64))
	// Lo firmado debe ser EXACTAMENTE el mensaje preparado
	if (tx.messageBytes.length !== prepared.messageBytes.length || tx.messageBytes.some((b, i) => b !== prepared.messageBytes[i])) throw new SolanaVerifyError('el mensaje firmado no es el preparado')
	if (tx.message.accountKeys[0] !== prepared.feePayer) throw new SolanaVerifyError('fee payer distinto')
	if (!prepared.sponsored && prepared.feePayer !== prepared.intent.from) throw new SolanaVerifyError('fee payer ajeno en una tx no patrocinada')
	if (tx.message.recentBlockhash !== prepared.recentBlockhash) throw new SolanaVerifyError('blockhash distinto')

	const signerIndex = tx.message.accountKeys.indexOf(prepared.intent.from)
	const signature = tx.signatures[signerIndex]
	if (!signature || !ed25519.verify(signature, tx.messageBytes, pubkeyBytes(prepared.intent.from))) throw new SolanaVerifyError('firma del remitente inválida')
	tx.signatures.forEach((sig, i) => { if (i !== signerIndex && sig !== null) throw new SolanaVerifyError('firma inesperada de otra cuenta') })

	const decoded = decodeSolanaTransfer(tx.message)
	const { intent } = prepared
	if (decoded.feePayer !== prepared.feePayer) throw new SolanaVerifyError('fee payer distinto')
	if (decoded.amount !== intent.amount) throw new SolanaVerifyError('cantidad distinta')
	if (decoded.from !== intent.from) throw new SolanaVerifyError('remitente distinto')
	if (intent.mint === null) {
		if (decoded.kind !== 'native' || decoded.to !== intent.to) throw new SolanaVerifyError('destino distinto')
	} else {
		if (decoded.kind !== 'token' || decoded.mint !== intent.mint || decoded.decimals !== intent.decimals) throw new SolanaVerifyError('token distinto')
		if (decoded.to !== associatedTokenAddress(intent.to, intent.mint)) throw new SolanaVerifyError('destino distinto')
		if ((decoded.createsTokenAccountFor !== null) !== prepared.createsTokenAccount) throw new SolanaVerifyError('creación de cuenta inesperada')
		if (decoded.createsTokenAccountFor !== null && decoded.createsTokenAccountFor !== intent.to) throw new SolanaVerifyError('cuenta creada para otro destino')
	}
	if (prepared.computeUnitPrice > MAX_PRIORITY_MICROLAMPORTS) throw new SolanaVerifyError('prioridad por encima del tope')
	if ((decoded.computeUnitPrice ?? 0n) !== prepared.computeUnitPrice) throw new SolanaVerifyError('prioridad distinta')
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

export type SolanaBroadcastResult = { txid: string, duplicate: boolean }

/**
 * `sendTransaction` con los bytes firmados (preflight contra `confirmed`: un error de
 * simulación vuelve aquí en vez de quemar la tarifa). "already been processed" = la misma
 * tx ya entró (reintento tras timeout): éxito. Blockhash caducado ⇒ `SolanaExpiredError`.
 */
export const broadcastSolanaTransaction = async (rpc: RegistryRpc, signed: SignedSolanaTx, { signal }: { signal?: AbortSignal } = {}): Promise<SolanaBroadcastResult> => {
	if (!signed.txid) throw new SolanaVerifyError('falta la firma del fee payer: una tx patrocinada no se difunde desde la app')
	try {
		const txid = await rpcCall<string>(rpc, 'sendTransaction', [signed.base64, { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 3 }], signal)
		return { txid: txid || signed.txid, duplicate: false }
	} catch (err) {
		const message = (err as Error)?.message ?? ''
		if (/already been processed|AlreadyProcessed/i.test(message)) return { txid: signed.txid, duplicate: true }
		if (/Blockhash not found|BlockhashNotFound|block height exceeded/i.test(message)) throw new SolanaExpiredError()
		throw err
	}
}
