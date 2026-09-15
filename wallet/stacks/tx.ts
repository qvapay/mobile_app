/**
 * Enviar en Stacks: STX nativo y tokens SIP-010 (QUSD, el token de QvaPay).
 * Módulo PURO (fetch global + @stacks/transactions), tests en node.
 *
 * La app construye la tx entera con @stacks/transactions (nonce de Hiro,
 * fee estimada por Hiro, post-condición `deny` que impide que salga más de
 * lo pedido), la firma con la clave derivada y, antes de difundir, la
 * RE-PARSEA para comprobar destino, cantidad, contrato/función y
 * post-condición (regla 6 del plan). Broadcast `POST /v2/transactions`.
 *
 * El identificador del token (`SP….QUSD::QUSD`) viene del registry: el
 * contrato cambia de versión sin tocar la app.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import {
	addressToString,
	cvToValue,
	deserializeTransaction,
	makeUnsignedContractCall,
	makeUnsignedSTXTokenTransfer,
	noneCV,
	Pc,
	PayloadType,
	principalCV,
	serializePayload,
	TransactionSigner,
	uintCV,
	validateStacksAddress,
} from '@stacks/transactions'
import type { StacksTransactionWire } from '@stacks/transactions'

import { ChainHttpError, getJson, postJson } from '../chains/http'
import type { RegistryRpc } from '../registry/types'

export type FeeTier = 'fast' | 'normal' | 'slow'

/** Tope duro de fee (5 STX): por encima, la estimación está rota. */
export const MAX_FEE_USTX = 5_000_000n
/** Suelo (0.001 STX): por debajo los nodos no relayan. */
const MIN_FEE_USTX = 1_000n
/** Si Hiro no estima: 0.003 STX, lo habitual en una transferencia. */
const DEFAULT_FEE_USTX = 3_000n

// ---------------------------------------------------------------------------
// Direcciones e identificadores
// ---------------------------------------------------------------------------

/** Dirección estándar de mainnet (SP…; SM… es multisig, también válida como destino). */
export const isValidStacksAddress = (address: string): boolean =>
	/^S[PM][0-9A-HJKMNP-TV-Z]{28,41}$/.test(address) && validateStacksAddress(address)

/** `SP….contrato::asset` → { address, name, asset }. */
export const parseAssetIdentifier = (identifier: string): { address: string, name: string, asset: string } => {
	const match = /^(S[PM][0-9A-HJKMNP-TV-Z]{28,41})\.([a-zA-Z][a-zA-Z0-9-]*)::([a-zA-Z][a-zA-Z0-9-]*)$/.exec(identifier)
	if (!match) throw new ChainHttpError(`stacks: identificador de token inválido ${identifier}`, { retryable: false })
	return { address: match[1], name: match[2], asset: match[3] }
}

const toHex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

// ---------------------------------------------------------------------------
// Intención, construcción y fee
// ---------------------------------------------------------------------------

export type StacksSendIntent = {
	from: string
	to: string
	/** micro-STX o unidades mínimas del token. */
	amount: bigint
	/** null = STX; si no, identificador SIP-010. */
	contract: string | null
}

export type PreparedStacksSend = {
	intent: StacksSendIntent
	/** Tx sin firmar con nonce y fee del nivel elegido. */
	tx: StacksTransactionWire
	nonce: bigint
	fee: bigint
	tier: FeeTier
	/** Fee por nivel (micro-STX) según las tres estimaciones de Hiro. */
	feeByTier: Record<FeeTier, bigint>
	/** Clave pública comprimida (hex) que firmará: la verificación exige que el firmante sea `from`. */
	publicKey: string
}

export class StacksVerifyError extends Error {
	constructor(message: string) { super(message); this.name = 'StacksVerifyError' }
}

type Deps = { signal?: AbortSignal, tier?: FeeTier }
const base = (rpc: RegistryRpc) => rpc.url.replace(/\/+$/, '')

export const getStacksNonce = async (rpc: RegistryRpc, address: string, deps: Deps = {}): Promise<bigint> => {
	const res = await getJson<{ possible_next_nonce?: number }>(`${base(rpc)}/extended/v1/address/${address}/nonces`, { signal: deps.signal, headers: rpc.headers })
	if (typeof res?.possible_next_nonce !== 'number') throw new ChainHttpError('stacks: nonce no disponible', { retryable: true })
	return BigInt(res.possible_next_nonce)
}

/** Fee por nivel: Hiro devuelve tres estimaciones (baja/media/alta). PURO. */
export const feeTiersFromEstimations = (estimations: Array<{ fee?: number }> | undefined): Record<FeeTier, bigint> => {
	const clamp = (value: bigint) => (value < MIN_FEE_USTX ? MIN_FEE_USTX : value > MAX_FEE_USTX ? MAX_FEE_USTX : value)
	const at = (i: number) => {
		const fee = estimations?.[i]?.fee
		return typeof fee === 'number' && fee > 0 ? BigInt(Math.ceil(fee)) : null
	}
	const normal = clamp(at(1) ?? at(0) ?? DEFAULT_FEE_USTX)
	const slow = clamp(at(0) ?? normal)
	const fast = clamp(at(2) ?? normal * 2n)
	return { slow: slow > normal ? normal : slow, normal, fast: fast < normal ? normal : fast }
}

/**
 * `POST /v2/fees/transaction` con el payload serializado. Si Hiro no puede
 * estimar (contrato nuevo, cuenta sin historial) responde 400: se usa el
 * default en vez de bloquear el envío.
 */
export const estimateStacksFee = async (rpc: RegistryRpc, tx: StacksTransactionWire, deps: Deps = {}): Promise<Record<FeeTier, bigint>> => {
	const payloadHex = serializePayload(tx.payload)
	const estimatedLen = tx.serialize().length / 2
	try {
		const res = await postJson<{ estimations?: Array<{ fee?: number }> }>(`${base(rpc)}/v2/fees/transaction`, { transaction_payload: payloadHex, estimated_len: estimatedLen }, { signal: deps.signal, headers: rpc.headers })
		return feeTiersFromEstimations(res?.estimations)
	} catch (err) {
		const status = (err as ChainHttpError)?.status
		if (status === 400) return feeTiersFromEstimations(undefined)
		throw err
	}
}

const buildUnsigned = async (intent: StacksSendIntent, publicKey: string, nonce: bigint, fee: bigint): Promise<StacksTransactionWire> => {
	if (intent.contract === null) {
		return makeUnsignedSTXTokenTransfer({ recipient: intent.to, amount: intent.amount, fee, nonce, publicKey, network: 'mainnet' })
	}
	const { address, name, asset } = parseAssetIdentifier(intent.contract)
	return makeUnsignedContractCall({
		contractAddress: address,
		contractName: name,
		functionName: 'transfer',
		functionArgs: [uintCV(intent.amount), principalCV(intent.from), principalCV(intent.to), noneCV()],
		// deny + post-condición exacta: la tx falla si el contrato intentara mover otra cantidad
		postConditionMode: 'deny',
		postConditions: [Pc.principal(intent.from).willSendEq(intent.amount).ft(`${address}.${name}`, asset)],
		fee,
		nonce,
		publicKey,
		network: 'mainnet',
	})
}

/**
 * Construye la tx sin firmar con nonce y fee reales. `publicKey` es la
 * comprimida de la clave que firmará (se deriva de la seed en el mismo
 * momento de firmar; aquí solo hace falta para el formato de la tx).
 */
export const prepareStacksSend = async (rpc: RegistryRpc, intent: StacksSendIntent, publicKey: string, deps: Deps = {}): Promise<PreparedStacksSend> => {
	if (!isValidStacksAddress(intent.to)) throw new ChainHttpError('stacks: destino inválido', { retryable: false })
	if (intent.amount <= 0n) throw new ChainHttpError('stacks: cantidad inválida', { retryable: false })
	const tier = deps.tier ?? 'normal'
	const nonce = await getStacksNonce(rpc, intent.from, deps)
	const draft = await buildUnsigned(intent, publicKey, nonce, DEFAULT_FEE_USTX)
	const feeByTier = await estimateStacksFee(rpc, draft, deps)
	const fee = feeByTier[tier]
	const tx = await buildUnsigned(intent, publicKey, nonce, fee)
	return { intent, tx, nonce, fee, tier, feeByTier, publicKey }
}

// ---------------------------------------------------------------------------
// Firma, verificación y broadcast
// ---------------------------------------------------------------------------

export type SignedStacksTx = { hex: string, txid: string }

/** Clave pública comprimida (hex) de una clave privada de 32 bytes. */
export const stacksPublicKey = (privateKey: Uint8Array): string => toHex(secp256k1.getPublicKey(privateKey, true))

/** Firma con la clave privada (32 bytes). Verifica re-parseando antes de devolver. */
export const signStacksTransaction = (prepared: PreparedStacksSend, privateKey: Uint8Array): SignedStacksTx => {
	if (stacksPublicKey(privateKey) !== prepared.publicKey) throw new StacksVerifyError('la clave no corresponde a la tx preparada')
	// El sufijo 01 marca clave comprimida (convención de Stacks)
	new TransactionSigner(prepared.tx).signOrigin(`${toHex(privateKey)}01`)
	const signed = { hex: prepared.tx.serialize(), txid: prepared.tx.txid() }
	verifySignedStacksTransaction(signed, prepared)
	return signed
}

export const verifySignedStacksTransaction = ({ hex }: SignedStacksTx, { intent, nonce, fee }: PreparedStacksSend): void => {
	const tx = deserializeTransaction(hex)
	const spending = tx.auth.spendingCondition as { nonce: bigint, fee: bigint }
	if (spending.nonce !== nonce) throw new StacksVerifyError('nonce distinto')
	if (spending.fee !== fee) throw new StacksVerifyError('fee distinta')
	if (fee > MAX_FEE_USTX) throw new StacksVerifyError('fee por encima del tope')

	const payload = tx.payload
	if (intent.contract === null) {
		if (payload.payloadType !== PayloadType.TokenTransfer) throw new StacksVerifyError('tipo distinto de transferencia STX')
		const p = payload as { recipient: unknown, amount: bigint }
		if (cvToValue(p.recipient as Parameters<typeof cvToValue>[0]) !== intent.to) throw new StacksVerifyError('destino distinto')
		if (p.amount !== intent.amount) throw new StacksVerifyError('cantidad distinta')
		return
	}

	const { address, name, asset } = parseAssetIdentifier(intent.contract)
	if (payload.payloadType !== PayloadType.ContractCall) throw new StacksVerifyError('tipo distinto de llamada a contrato')
	const call = payload as { contractAddress: Parameters<typeof addressToString>[0], contractName: { content: string }, functionName: { content: string }, functionArgs: Parameters<typeof cvToValue>[0][] }
	if (addressToString(call.contractAddress) !== address || call.contractName.content !== name) throw new StacksVerifyError('contrato distinto')
	if (call.functionName.content !== 'transfer') throw new StacksVerifyError('función distinta')
	const [amount, sender, recipient, memo] = call.functionArgs.map(arg => cvToValue(arg))
	if (amount !== intent.amount) throw new StacksVerifyError('cantidad distinta')
	if (sender !== intent.from) throw new StacksVerifyError('remitente distinto')
	if (recipient !== intent.to) throw new StacksVerifyError('destino distinto')
	if (memo !== null && memo !== undefined) throw new StacksVerifyError('memo inesperado')

	// Post-condición: exactamente UNA, del remitente, igual a la cantidad, sobre ese asset, en modo deny
	const pcs = (tx.postConditions as { values: Array<{ conditionType: number, conditionCode: number, amount: bigint, principal: { address: Parameters<typeof addressToString>[0] }, asset?: { address: Parameters<typeof addressToString>[0], contractName: { content: string }, assetName: { content: string } } }> }).values
	if (tx.postConditionMode !== 2) throw new StacksVerifyError('post-condición no está en modo deny')
	if (pcs.length !== 1) throw new StacksVerifyError(`${pcs.length} post-condiciones, se esperaba 1`)
	const pc = pcs[0]
	if (pc.conditionType !== 1 || pc.conditionCode !== 1 || pc.amount !== intent.amount) throw new StacksVerifyError('post-condición distinta')
	if (addressToString(pc.principal.address) !== intent.from) throw new StacksVerifyError('post-condición de otro remitente')
	if (!pc.asset || addressToString(pc.asset.address) !== address || pc.asset.contractName.content !== name || pc.asset.assetName.content !== asset) throw new StacksVerifyError('post-condición sobre otro asset')
}

export type StacksBroadcastResult = { txid: string, duplicate: boolean }

/**
 * `POST /v2/transactions` con los bytes firmados. Hiro responde el txid (JSON
 * string) o `{ error, reason, reason_data }`. Una tx ya en el mempool
 * (reintento tras timeout) cuenta como éxito; nonce ya usado, fee baja o
 * post-condición fallida son errores de negocio (no rotan).
 */
export const broadcastStacksTransaction = async (rpc: RegistryRpc, signed: SignedStacksTx, deps: Deps = {}): Promise<StacksBroadcastResult> => {
	const bytes = Uint8Array.from(signed.hex.match(/../g)!.map(b => parseInt(b, 16)))
	const res = await fetch(`${base(rpc)}/v2/transactions`, { method: 'POST', body: bytes, signal: deps.signal, headers: { 'Content-Type': 'application/octet-stream', ...rpc.headers } })
	const text = (await res.text()).trim()
	if (res.ok) {
		const txid = text.replace(/^"|"$/g, '').replace(/^0x/, '')
		return { txid: /^[0-9a-f]{64}$/i.test(txid) ? txid.toLowerCase() : signed.txid, duplicate: false }
	}
	let reason = text
	try { const parsed = JSON.parse(text) as { reason?: string, error?: string }; reason = parsed.reason ?? parsed.error ?? text } catch { /* texto plano */ }
	if (/AlreadyInMempool|ContractAlreadyExists|already/i.test(reason)) return { txid: signed.txid, duplicate: true }
	throw new ChainHttpError(`stacks: broadcast rechazado (${res.status}): ${reason.slice(0, 200)}`, { status: res.status, retryable: res.status >= 500 })
}
