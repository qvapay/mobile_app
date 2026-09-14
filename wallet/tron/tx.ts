/**
 * Enviar en TRON (TRX y tokens TRC-20). Módulo PURO: fetch global + deps
 * inyectadas, tests en node con fetch simulado.
 *
 * Flujo (regla dura 6 del plan: la app verifica lo que va a firmar):
 *   1. `prepareTronSend`: el nodo construye la tx (`createtransaction` para
 *      TRX, `triggersmartcontract` para TRC-20) y estima energía/ancho de
 *      banda. NO se confía en el JSON que devuelve: se decodifica
 *      `raw_data_hex` con nuestro lector protobuf, se comprueba que destino,
 *      cantidad, contrato y owner son EXACTAMENTE los pedidos y se recalcula
 *      `txID = sha256(raw_data)`.
 *   2. `signTronTransaction`: firma el txID con secp256k1 (r‖s‖27+recovery,
 *      convención java-tron/tronweb, verificada contra una firma real).
 *   3. `broadcastTronTransaction`: `/wallet/broadcasthex` con la envoltura
 *      Transaction{raw_data, signature} codificada aquí — bytes idénticos a
 *      los firmados, sin depender de que el nodo re-serialice un JSON.
 *
 * Los nodos `api: 'jsonrpc'` (capa eth_*) no construyen ni difunden
 * transacciones TRON: `TRON_TX_RPC` los descarta en el router.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'

import { ChainHttpError, postJson } from '../chains/http'
import { tronToHex20 } from '../chains/tron'
import type { RegistryRpc } from '../registry/types'
import {
	allBytesOf,
	bytesOf,
	bytesToHex,
	concatBytes,
	decodeFields,
	encodeBytesField,
	hexToBytes,
	varintOf,
} from './protobuf'

/** Filtro para `router.call`: solo nodos HTTP de java-tron/TronGrid. */
export const TRON_TX_RPC = (rpc: RegistryRpc): boolean => rpc.api !== 'jsonrpc'

/** 1 TRX = 1e6 sun. */
export const SUN_PER_TRX = 1_000_000n

/** Tope duro del fee_limit: nunca se autoriza quemar más TRX que esto en una tx. */
export const MAX_FEE_LIMIT_SUN = 100n * SUN_PER_TRX

/** Bytes de firma que se añaden al raw al difundir (r‖s‖v + envoltura protobuf). */
const SIGNATURE_OVERHEAD_BYTES = 69n

/** Defaults de parámetros de cadena por si `getchainparameters` no responde (sun). */
const DEFAULT_ENERGY_FEE_SUN = 420n
const DEFAULT_BANDWIDTH_FEE_SUN = 1000n
const DEFAULT_CREATE_ACCOUNT_FEE_SUN = 1_000_000n

const CONTRACT_TYPE_TRANSFER = 1n
const CONTRACT_TYPE_TRIGGER_SMART = 31n
const TRANSFER_SELECTOR = 'a9059cbb'

// ---------------------------------------------------------------------------
// Direcciones y cantidades
// ---------------------------------------------------------------------------

export const isValidTronAddress = (address: string): boolean => {
	try { tronToHex20(address); return true } catch { return false }
}

/** `transfer(address,uint256)` codificado como lo espera `triggersmartcontract` (sin selector). */
export const encodeTrc20TransferParams = (to: string, amount: bigint): string =>
	tronToHex20(to).padStart(64, '0') + amount.toString(16).padStart(64, '0')

// ---------------------------------------------------------------------------
// Decodificación de Transaction.raw
// ---------------------------------------------------------------------------

export type DecodedTronRaw = {
	refBlockBytes: string
	refBlockHash: string
	expiration: bigint
	timestamp: bigint
	feeLimit: bigint
	contracts: Array<
		| { type: 'TransferContract', owner: string, to: string, amount: bigint }
		| { type: 'TriggerSmartContract', owner: string, contract: string, callValue: bigint, data: string }
		| { type: 'Unknown', typeCode: bigint }
	>
}

/** Bytes 0x41+20 → hex20 (lo que compara `tronToHex20`). */
const addressBytesToHex20 = (bytes: Uint8Array): string => {
	if (bytes.length !== 21 || bytes[0] !== 0x41) throw new Error('tron: dirección en raw_data inválida')
	return bytesToHex(bytes.slice(1))
}

/**
 * Decodifica `raw_data_hex` (protocol.Transaction.raw). Campos:
 * 1 ref_block_bytes · 4 ref_block_hash · 8 expiration · 11 contract (rep.) ·
 * 14 timestamp · 18 fee_limit. Contract: 1 type · 2 parameter (Any: 1
 * type_url · 2 value). TransferContract: 1 owner · 2 to · 3 amount.
 * TriggerSmartContract: 1 owner · 2 contract · 3 call_value · 4 data.
 */
export const decodeTronRaw = (rawHex: string): DecodedTronRaw => {
	const fields = decodeFields(hexToBytes(rawHex))
	const contracts = allBytesOf(fields, 11).map(contractBytes => {
		const contract = decodeFields(contractBytes)
		const typeCode = varintOf(contract, 1)
		const any = decodeFields(bytesOf(contract, 2))
		const value = decodeFields(bytesOf(any, 2))
		if (typeCode === CONTRACT_TYPE_TRANSFER) {
			return { type: 'TransferContract' as const, owner: addressBytesToHex20(bytesOf(value, 1)), to: addressBytesToHex20(bytesOf(value, 2)), amount: varintOf(value, 3) }
		}
		if (typeCode === CONTRACT_TYPE_TRIGGER_SMART) {
			return { type: 'TriggerSmartContract' as const, owner: addressBytesToHex20(bytesOf(value, 1)), contract: addressBytesToHex20(bytesOf(value, 2)), callValue: varintOf(value, 3), data: bytesToHex(bytesOf(value, 4)) }
		}
		return { type: 'Unknown' as const, typeCode }
	})
	return {
		refBlockBytes: bytesToHex(bytesOf(fields, 1)),
		refBlockHash: bytesToHex(bytesOf(fields, 4)),
		expiration: varintOf(fields, 8),
		timestamp: varintOf(fields, 14),
		feeLimit: varintOf(fields, 18),
		contracts,
	}
}

export const tronTxId = (rawHex: string): string => bytesToHex(sha256(hexToBytes(rawHex)))

// ---------------------------------------------------------------------------
// Intención y verificación
// ---------------------------------------------------------------------------

export type TronSendIntent = {
	from: string
	to: string
	/** Unidades mínimas (sun o unidades del token). */
	amount: bigint
	/** null = TRX nativo; si no, contrato TRC-20 (base58). */
	contract: string | null
}

export class TronVerifyError extends Error {
	constructor(message: string) { super(message); this.name = 'TronVerifyError' }
}

/**
 * La tx que devolvió el nodo debe corresponder EXACTAMENTE a la intención:
 * un solo contrato, del tipo esperado, con owner/destino/cantidad/contrato
 * idénticos, txID = sha256(raw) y fee_limit dentro del tope. Cualquier
 * desviación lanza: un nodo malicioso o roto no puede colar otra tx.
 */
export const verifyTronTransaction = (tx: { txID: string, raw_data_hex: string }, intent: TronSendIntent, feeLimitSun: bigint): DecodedTronRaw => {
	if (tronTxId(tx.raw_data_hex) !== tx.txID.toLowerCase()) throw new TronVerifyError('txID no coincide con sha256(raw_data)')
	const raw = decodeTronRaw(tx.raw_data_hex)
	if (raw.contracts.length !== 1) throw new TronVerifyError(`la tx trae ${raw.contracts.length} contratos, se esperaba 1`)
	const contract = raw.contracts[0]
	const from = tronToHex20(intent.from)
	const to = tronToHex20(intent.to)

	if (intent.contract === null) {
		if (contract.type !== 'TransferContract') throw new TronVerifyError(`tipo ${contract.type}, se esperaba TransferContract`)
		if (contract.owner !== from) throw new TronVerifyError('owner distinto')
		if (contract.to !== to) throw new TronVerifyError('destino distinto')
		if (contract.amount !== intent.amount) throw new TronVerifyError('cantidad distinta')
		return raw
	}

	if (contract.type !== 'TriggerSmartContract') throw new TronVerifyError(`tipo ${contract.type}, se esperaba TriggerSmartContract`)
	if (contract.owner !== from) throw new TronVerifyError('owner distinto')
	if (contract.contract !== tronToHex20(intent.contract)) throw new TronVerifyError('contrato distinto')
	if (contract.callValue !== 0n) throw new TronVerifyError('call_value debe ser 0')
	if (contract.data !== TRANSFER_SELECTOR + encodeTrc20TransferParams(intent.to, intent.amount)) throw new TronVerifyError('calldata distinta (destino o cantidad)')
	if (raw.feeLimit > feeLimitSun) throw new TronVerifyError('fee_limit por encima del autorizado')
	return raw
}

// ---------------------------------------------------------------------------
// Construcción (vía nodo) + estimación de fee
// ---------------------------------------------------------------------------

export type TronNodeTx = { txID: string, raw_data_hex: string, raw_data?: unknown, visible?: boolean }

type ChainParams = { energyFeeSun: bigint, bandwidthFeeSun: bigint, createAccountFeeSun: bigint }

type Resources = { freeBandwidth: bigint, stakedBandwidth: bigint, energy: bigint }

export type TronFeeEstimate = {
	/** Energía que consumirá (0 en TRX nativo). */
	energyNeeded: bigint
	/** Ancho de banda (bytes) de la tx firmada. */
	bandwidthNeeded: bigint
	/** TRX (sun) que se quemarán con los recursos actuales de la cuenta. */
	burnSun: bigint
	/** fee_limit autorizado en la tx (solo TRC-20; 0 en TRX). */
	feeLimitSun: bigint
	/** El destino no existe aún: TRX cobra 1 TRX por activarlo. */
	activatesAccount: boolean
}

export type PreparedTronSend = {
	intent: TronSendIntent
	tx: TronNodeTx
	raw: DecodedTronRaw
	fee: TronFeeEstimate
}

type Deps = { signal?: AbortSignal, headers?: Record<string, string> }

const base = (rpc: RegistryRpc) => rpc.url.replace(/\/+$/, '')
const post = <T>(rpc: RegistryRpc, path: string, body: unknown, deps: Deps) =>
	postJson<T>(`${base(rpc)}${path}`, body, { signal: deps.signal, headers: { ...rpc.headers, ...deps.headers } })

const nodeError = (message: string): ChainHttpError => new ChainHttpError(message, { retryable: false })

/**
 * Los nodos devuelven errores de negocio como `{ Error }` o `{ result: { message } }`,
 * este último en hex del texto ASCII. Sin TextDecoder (no está garantizado en Hermes).
 */
const decodeNodeMessage = (value: unknown): string => {
	if (typeof value !== 'string') return ''
	if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return value
	try { return String.fromCharCode(...hexToBytes(value)).replace(/[^\x20-\x7e]/g, '') } catch { return value }
}

export const getTronChainParams = async (rpc: RegistryRpc, deps: Deps = {}): Promise<ChainParams> => {
	const defaults: ChainParams = { energyFeeSun: DEFAULT_ENERGY_FEE_SUN, bandwidthFeeSun: DEFAULT_BANDWIDTH_FEE_SUN, createAccountFeeSun: DEFAULT_CREATE_ACCOUNT_FEE_SUN }
	try {
		const res = await post<{ chainParameter?: Array<{ key: string, value?: number }> }>(rpc, '/wallet/getchainparameters', {}, deps)
		const find = (key: string) => res.chainParameter?.find(p => p.key === key)?.value
		const energy = find('getEnergyFee')
		const bandwidth = find('getTransactionFee')
		const create = find('getCreateNewAccountFeeInSystemContract')
		return {
			energyFeeSun: typeof energy === 'number' && energy > 0 ? BigInt(energy) : defaults.energyFeeSun,
			bandwidthFeeSun: typeof bandwidth === 'number' && bandwidth > 0 ? BigInt(bandwidth) : defaults.bandwidthFeeSun,
			createAccountFeeSun: typeof create === 'number' && create > 0 ? BigInt(create) : defaults.createAccountFeeSun,
		}
	} catch {
		return defaults
	}
}

/** Recursos disponibles de la cuenta: `{}` si nunca se activó (todo a 0). */
export const getTronResources = async (rpc: RegistryRpc, address: string, deps: Deps = {}): Promise<Resources> => {
	const r = await post<{ freeNetLimit?: number, freeNetUsed?: number, NetLimit?: number, NetUsed?: number, EnergyLimit?: number, EnergyUsed?: number }>(
		rpc, '/wallet/getaccountresource', { address, visible: true }, deps,
	)
	const avail = (limit?: number, used?: number) => { const v = BigInt(limit ?? 0) - BigInt(used ?? 0); return v > 0n ? v : 0n }
	return { freeBandwidth: avail(r.freeNetLimit, r.freeNetUsed), stakedBandwidth: avail(r.NetLimit, r.NetUsed), energy: avail(r.EnergyLimit, r.EnergyUsed) }
}

/** ¿Existe la cuenta destino? (un TRX a una cuenta nueva paga la activación). */
export const tronAccountExists = async (rpc: RegistryRpc, address: string, deps: Deps = {}): Promise<boolean> => {
	const account = await post<{ address?: string }>(rpc, '/wallet/getaccount', { address, visible: true }, deps)
	return !!account?.address
}

/** Costo en TRX (sun) de una tx con los recursos actuales. PURO. */
export const computeTronBurn = (
	{ energyNeeded, bandwidthNeeded, activatesAccount }: Pick<TronFeeEstimate, 'energyNeeded' | 'bandwidthNeeded' | 'activatesAccount'>,
	resources: Resources,
	params: ChainParams,
): bigint => {
	const energyShort = energyNeeded > resources.energy ? energyNeeded - resources.energy : 0n
	// El ancho de banda no se paga a trozos: si no cubre entero, se quema entero
	const bandwidthCovered = resources.freeBandwidth >= bandwidthNeeded || resources.stakedBandwidth >= bandwidthNeeded
	return energyShort * params.energyFeeSun
		+ (bandwidthCovered ? 0n : bandwidthNeeded * params.bandwidthFeeSun)
		+ (activatesAccount ? params.createAccountFeeSun : 0n)
}

/**
 * fee_limit de una TRC-20: la energía estimada con un 30% de margen (la
 * estimación de `triggerconstantcontract` es exacta salvo cambios de estado
 * entre estimar y ejecutar), acotado al tope duro. PURO.
 */
export const computeFeeLimit = (energyNeeded: bigint, params: ChainParams): bigint => {
	const withMargin = (energyNeeded * 13n / 10n) * params.energyFeeSun
	const floor = 5n * SUN_PER_TRX
	const value = withMargin > floor ? withMargin : floor
	return value > MAX_FEE_LIMIT_SUN ? MAX_FEE_LIMIT_SUN : value
}

/**
 * Construye la tx en el nodo, la VERIFICA y estima la fee. No firma nada.
 * Lanza `TronVerifyError` si el nodo devolvió algo distinto a lo pedido y
 * `ChainHttpError` (no reintentable) con el mensaje del nodo si rechazó la
 * construcción (saldo insuficiente, contrato inválido…).
 */
export const prepareTronSend = async (rpc: RegistryRpc, intent: TronSendIntent, deps: Deps = {}): Promise<PreparedTronSend> => {
	if (!isValidTronAddress(intent.to)) throw nodeError('tron: destino inválido')
	if (intent.amount <= 0n) throw nodeError('tron: cantidad inválida')

	const [params, resources] = await Promise.all([getTronChainParams(rpc, deps), getTronResources(rpc, intent.from, deps)])

	if (intent.contract === null) {
		const [tx, exists] = await Promise.all([
			post<TronNodeTx & { Error?: string }>(rpc, '/wallet/createtransaction', { owner_address: intent.from, to_address: intent.to, amount: Number(intent.amount), visible: true }, deps),
			tronAccountExists(rpc, intent.to, deps),
		])
		if (!tx?.raw_data_hex) throw nodeError(decodeNodeMessage(tx?.Error) || 'tron: el nodo no construyó la transacción')
		const raw = verifyTronTransaction(tx, intent, 0n)
		const bandwidthNeeded = BigInt(tx.raw_data_hex.length / 2) + SIGNATURE_OVERHEAD_BYTES
		const partial = { energyNeeded: 0n, bandwidthNeeded, activatesAccount: !exists }
		return { intent, tx, raw, fee: { ...partial, burnSun: computeTronBurn(partial, resources, params), feeLimitSun: 0n } }
	}

	const parameter = encodeTrc20TransferParams(intent.to, intent.amount)
	const estimate = await post<{ result?: { result?: boolean, message?: string }, energy_used?: number }>(rpc, '/wallet/triggerconstantcontract', {
		owner_address: intent.from, contract_address: intent.contract, function_selector: 'transfer(address,uint256)', parameter, visible: true,
	}, deps)
	if (estimate?.result?.result === false || typeof estimate?.energy_used !== 'number') {
		throw nodeError(decodeNodeMessage(estimate?.result?.message) || 'tron: no se pudo estimar la energía')
	}
	const energyNeeded = BigInt(estimate.energy_used)
	const feeLimitSun = computeFeeLimit(energyNeeded, params)

	const built = await post<{ result?: { result?: boolean, message?: string }, transaction?: TronNodeTx }>(rpc, '/wallet/triggersmartcontract', {
		owner_address: intent.from, contract_address: intent.contract, function_selector: 'transfer(address,uint256)', parameter, fee_limit: Number(feeLimitSun), call_value: 0, visible: true,
	}, deps)
	const tx = built?.transaction
	if (built?.result?.result === false || !tx?.raw_data_hex) throw nodeError(decodeNodeMessage(built?.result?.message) || 'tron: el nodo no construyó la transacción')
	const raw = verifyTronTransaction(tx, intent, feeLimitSun)
	const bandwidthNeeded = BigInt(tx.raw_data_hex.length / 2) + SIGNATURE_OVERHEAD_BYTES
	const partial = { energyNeeded, bandwidthNeeded, activatesAccount: false }
	return { intent, tx, raw, fee: { ...partial, burnSun: computeTronBurn(partial, resources, params), feeLimitSun } }
}

// ---------------------------------------------------------------------------
// Firma y broadcast
// ---------------------------------------------------------------------------

/**
 * Firma el txID (sha256 del raw, sin volver a hashear) con la clave privada
 * TRON. Devuelve r‖s‖(27+recovery) en hex, la convención de java-tron.
 * No retiene la clave: el caller la descarta al volver.
 */
export const signTronTransaction = (rawHex: string, privateKey: Uint8Array): string => {
	const txId = hexToBytes(tronTxId(rawHex))
	const recovered = secp256k1.sign(txId, privateKey, { prehash: false, format: 'recovered' })
	const signature = new Uint8Array(65)
	signature.set(recovered.slice(1), 0)
	signature[64] = 27 + recovered[0]
	return bytesToHex(signature)
}

/** Transaction { 1: raw_data, 2: signature } listo para `/wallet/broadcasthex`. */
export const encodeSignedTronTransaction = (rawHex: string, signatureHex: string): string =>
	bytesToHex(concatBytes(encodeBytesField(1, hexToBytes(rawHex)), encodeBytesField(2, hexToBytes(signatureHex))))

export type TronBroadcastResult = { txid: string, duplicate: boolean }

/**
 * Difunde la tx firmada. `DUP_TRANSACTION_ERROR` cuenta como éxito: la tx ya
 * está en la red (reintento tras un timeout), no hay que asustar al usuario.
 * Otros rechazos (`SIGERROR`, `CONTRACT_VALIDATE_ERROR`, `BANDWITH_ERROR`…)
 * lanzan con el mensaje del nodo, NO reintentables: serían iguales en
 * cualquier nodo y reintentar no arregla nada.
 */
export const broadcastTronTransaction = async (rpc: RegistryRpc, rawHex: string, signatureHex: string, deps: Deps = {}): Promise<TronBroadcastResult> => {
	const res = await post<{ result?: boolean, code?: string, message?: string, txid?: string }>(rpc, '/wallet/broadcasthex', { transaction: encodeSignedTronTransaction(rawHex, signatureHex) }, deps)
	const txid = tronTxId(rawHex)
	if (res?.result === true) return { txid: res.txid ?? txid, duplicate: false }
	if (res?.code === 'DUP_TRANSACTION_ERROR') return { txid, duplicate: true }
	// Solo un nodo saturado justifica probar otro: es la MISMA tx (mismo txID),
	// así que rotar nunca duplica; expirada o inválida lo estará en todos
	const retryable = res?.code === 'SERVER_BUSY'
	throw new ChainHttpError(`tron: broadcast rechazado (${res?.code ?? 'sin código'}): ${decodeNodeMessage(res?.message)}`, { retryable })
}
