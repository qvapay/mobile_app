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
 *      `txID = sha256(raw_data)`. Decodificar es ESTRICTO (`decodeTronRaw`): los
 *      bytes que se firman tienen que ser la codificación canónica de lo que se
 *      verificó, sin un campo repetido ni uno de más, o un nodo podría enseñar
 *      una cosa a la app y hacer que la red ejecute otra.
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
import type { TxLookup } from '../chains/txLookup'
import {
	allBytesOf,
	bytesOf,
	bytesToHex,
	concatBytes,
	decodeExact,
	encodeBytesField,
	encodeVarintField,
	equalBytes,
	hexToBytes,
	varintOf,
} from './protobuf'
import type { ProtoField, ProtoShape } from './protobuf'

/** Filtro para `router.call`: solo nodos HTTP de java-tron/TronGrid. */
export const TRON_TX_RPC = (rpc: RegistryRpc): boolean => rpc.api !== 'jsonrpc'

/** 1 TRX = 1e6 sun. */
export const SUN_PER_TRX = 1_000_000n

/**
 * Cuánto se da por buena una tx de TRON desde que el nodo la entrega, en el reloj del TELÉFONO.
 *
 * El nodo le pone `expiration` = su bloque de cabeza + 60 s (medido en mainnet: quedan 57-59 s
 * al recibirla), pero eso es hora de la CADENA: compararla con `Date.now()` hacía que un teléfono
 * adelantado más de un minuto viera caducada toda tx nada más construirla, y después del PIN no
 * pasaba nada. Por eso se cuenta el tiempo transcurrido desde aquí. Se queda en 45 s para que
 * firmar (PBKDF2, segundos en gama baja) y difundir quepan dentro de la vigencia real.
 */
export const TRON_TX_VALIDITY_MS = 45_000

/** Tope duro del fee_limit: nunca se autoriza quemar más TRX que esto en una tx. */
export const MAX_FEE_LIMIT_SUN = 100n * SUN_PER_TRX

/** Bytes de firma que se añaden al raw al difundir (r‖s‖v + envoltura protobuf). */
export const SIGNATURE_OVERHEAD_BYTES = 69n

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

/** Recurso de Stake 2.0 (enum protocol.ResourceCode). */
export type TronStakeResource = 'BANDWIDTH' | 'ENERGY' | 'TRON_POWER'

export type DecodedTronContract =
	| { type: 'TransferContract', owner: string, to: string, amount: bigint }
	| { type: 'TriggerSmartContract', owner: string, contract: string, callValue: bigint, data: string }
	| { type: 'FreezeBalanceV2Contract', owner: string, amount: bigint, resource: TronStakeResource }
	| { type: 'UnfreezeBalanceV2Contract', owner: string, amount: bigint, resource: TronStakeResource }
	| { type: 'WithdrawExpireUnfreezeContract', owner: string }
	| { type: 'CancelAllUnfreezeV2Contract', owner: string }
	| { type: 'VoteWitnessContract', owner: string, votes: Array<{ address: string, count: bigint }>, support: boolean }
	| { type: 'WithdrawBalanceContract', owner: string }

type TronContractType = DecodedTronContract['type']

export type DecodedTronRaw = {
	refBlockBytes: string
	refBlockHash: string
	expiration: bigint
	timestamp: bigint
	feeLimit: bigint
	contracts: DecodedTronContract[]
}

/** Códigos de contrato de Stake 2.0 y votos (protocol.Transaction.Contract.ContractType). */
export const TRON_STAKE_CONTRACT_TYPES = {
	VoteWitnessContract: 4n,
	WithdrawBalanceContract: 13n,
	FreezeBalanceV2Contract: 54n,
	UnfreezeBalanceV2Contract: 55n,
	WithdrawExpireUnfreezeContract: 56n,
	CancelAllUnfreezeV2Contract: 59n,
} as const

/** Los ÚNICOS contratos que esta wallet sabe leer, y por tanto los únicos que firma. */
const CONTRACT_CODES: Record<TronContractType, bigint> = {
	TransferContract: CONTRACT_TYPE_TRANSFER,
	TriggerSmartContract: CONTRACT_TYPE_TRIGGER_SMART,
	...TRON_STAKE_CONTRACT_TYPES,
}

const CONTRACT_BY_CODE = new Map<bigint, TronContractType>((Object.entries(CONTRACT_CODES) as Array<[TronContractType, bigint]>).map(([name, code]) => [code, name]))

const typeUrlOf = (type: TronContractType): string => `type.googleapis.com/protocol.${type}`

const RESOURCES: TronStakeResource[] = ['BANDWIDTH', 'ENERGY', 'TRON_POWER']

const resourceFrom = (code: bigint): TronStakeResource => {
	const resource = RESOURCES[Number(code)]
	if (!resource) throw new TronVerifyError(`recurso desconocido ${code}`)
	return resource
}

const ascii = (bytes: Uint8Array): string => String.fromCharCode(...bytes)
const asciiBytes = (text: string): Uint8Array => Uint8Array.from(text, ch => ch.charCodeAt(0))

/** Bytes 0x41+20 → hex20 (lo que compara `tronToHex20`). */
const addressBytesToHex20 = (bytes: Uint8Array): string => {
	if (bytes.length !== 21 || bytes[0] !== 0x41) throw new Error('tron: dirección en raw_data inválida')
	return bytesToHex(bytes.slice(1))
}

const hex20ToAddressBytes = (hex20: string): Uint8Array => hexToBytes(`41${hex20}`)

// --- Forma exacta de cada mensaje (los .proto de java-tron) ---------------------------
//
// Lo que NO está aquí no se firma. Fuera a propósito, porque esta wallet nunca los pide y
// un nodo que los añada está construyendo OTRA transacción: `Transaction.raw.data` (memo,
// campo 10), `Contract.Permission_id` (5), y `call_token_value`/`token_id` (5 y 6) de
// `TriggerSmartContract`, que moverían un TRC-10 del usuario junto a la llamada.

const VARINT = { wire: 0 } as const
const BYTES = { wire: 2 } as const
const REPEATED = { wire: 2, repeated: true } as const

/** Transaction.raw: 1 ref_block_bytes · 4 ref_block_hash · 8 expiration · 11 contract (rep.) · 14 timestamp · 18 fee_limit. */
const RAW_SHAPE: ProtoShape = { 1: BYTES, 4: BYTES, 8: VARINT, 11: REPEATED, 14: VARINT, 18: VARINT }
/** Transaction.Contract: 1 type · 2 parameter (google.protobuf.Any). */
const CONTRACT_SHAPE: ProtoShape = { 1: VARINT, 2: BYTES }
/** Any: 1 type_url · 2 value. */
const ANY_SHAPE: ProtoShape = { 1: BYTES, 2: BYTES }
/** VoteWitnessContract.Vote: 1 vote_address · 2 vote_count. */
const VOTE_SHAPE: ProtoShape = { 1: BYTES, 2: VARINT }
const OWNER_ONLY: ProtoShape = { 1: BYTES }

/** owner_address = 1 en todos (core/contract/{balance,smart,witness}_contract.proto). */
const VALUE_SHAPES: Record<TronContractType, ProtoShape> = {
	/** 2 to_address · 3 amount */
	TransferContract: { 1: BYTES, 2: BYTES, 3: VARINT },
	/** 2 contract_address · 3 call_value · 4 data */
	TriggerSmartContract: { 1: BYTES, 2: BYTES, 3: VARINT, 4: BYTES },
	/** 2 frozen_balance · 3 resource (0 BANDWIDTH se omite) */
	FreezeBalanceV2Contract: { 1: BYTES, 2: VARINT, 3: VARINT },
	/** 2 unfreeze_balance · 3 resource */
	UnfreezeBalanceV2Contract: { 1: BYTES, 2: VARINT, 3: VARINT },
	WithdrawExpireUnfreezeContract: OWNER_ONLY,
	CancelAllUnfreezeV2Contract: OWNER_ONLY,
	/** 2 votes (rep.) · 3 support */
	VoteWitnessContract: { 1: BYTES, 2: REPEATED, 3: VARINT },
	WithdrawBalanceContract: OWNER_ONLY,
}

/** Todos estos enteros son int64 que nunca van en negativo: con el bit 63 puesto, java-tron leería un número negativo. */
const INT64_LIMIT = 2n ** 63n

const int64Of = (fields: ProtoField[], field: number): bigint => {
	const value = varintOf(fields, field)
	if (value >= INT64_LIMIT) throw new TronVerifyError(`el campo ${field} no cabe en un entero positivo de 64 bits`)
	return value
}

const decodeContractValue = (type: TronContractType, bytes: Uint8Array): DecodedTronContract => {
	const value = decodeExact(bytes, VALUE_SHAPES[type], type)
	const owner = addressBytesToHex20(bytesOf(value, 1))
	switch (type) {
		case 'TransferContract':
			return { type, owner, to: addressBytesToHex20(bytesOf(value, 2)), amount: int64Of(value, 3) }
		case 'TriggerSmartContract':
			return { type, owner, contract: addressBytesToHex20(bytesOf(value, 2)), callValue: int64Of(value, 3), data: bytesToHex(bytesOf(value, 4)) }
		case 'FreezeBalanceV2Contract':
		case 'UnfreezeBalanceV2Contract':
			return { type, owner, amount: int64Of(value, 2), resource: resourceFrom(int64Of(value, 3)) }
		case 'VoteWitnessContract':
			return {
				type,
				owner,
				votes: allBytesOf(value, 2).map(voteBytes => {
					const vote = decodeExact(voteBytes, VOTE_SHAPE, 'Vote')
					return { address: addressBytesToHex20(bytesOf(vote, 1)), count: int64Of(vote, 2) }
				}),
				support: int64Of(value, 3) !== 0n,
			}
		default:
			return { type, owner }
	}
}

const decodeRawFields = (bytes: Uint8Array): DecodedTronRaw => {
	const fields = decodeExact(bytes, RAW_SHAPE, 'Transaction.raw')
	const contracts = allBytesOf(fields, 11).map(contractBytes => {
		const contract = decodeExact(contractBytes, CONTRACT_SHAPE, 'Contract')
		const code = int64Of(contract, 1)
		const type = CONTRACT_BY_CODE.get(code)
		if (!type) throw new TronVerifyError(`tipo de contrato ${code} no admitido`)
		const any = decodeExact(bytesOf(contract, 2), ANY_SHAPE, 'Any')
		// El Any debe declarar el MISMO tipo que el código: un nodo no puede disfrazar un contrato de otro
		if (ascii(bytesOf(any, 1)) !== typeUrlOf(type)) throw new TronVerifyError(`type_url no corresponde a ${type}`)
		return decodeContractValue(type, bytesOf(any, 2))
	})
	return {
		refBlockBytes: bytesToHex(bytesOf(fields, 1)),
		refBlockHash: bytesToHex(bytesOf(fields, 4)),
		expiration: int64Of(fields, 8),
		timestamp: int64Of(fields, 14),
		feeLimit: int64Of(fields, 18),
		contracts,
	}
}

// --- Codificación canónica (la inversa exacta de lo anterior) --------------------------

/** proto3 no escribe un escalar con su valor por defecto: ni bytes vacíos ni un 0. */
const bytesField = (field: number, value: Uint8Array): Uint8Array[] => (value.length > 0 ? [encodeBytesField(field, value)] : [])
const varintField = (field: number, value: bigint): Uint8Array[] => (value !== 0n ? [encodeVarintField(field, value)] : [])

const encodeContractValue = (contract: DecodedTronContract): Uint8Array => {
	const owner = bytesField(1, hex20ToAddressBytes(contract.owner))
	switch (contract.type) {
		case 'TransferContract':
			return concatBytes(...owner, ...bytesField(2, hex20ToAddressBytes(contract.to)), ...varintField(3, contract.amount))
		case 'TriggerSmartContract':
			return concatBytes(...owner, ...bytesField(2, hex20ToAddressBytes(contract.contract)), ...varintField(3, contract.callValue), ...bytesField(4, hexToBytes(contract.data)))
		case 'FreezeBalanceV2Contract':
		case 'UnfreezeBalanceV2Contract':
			return concatBytes(...owner, ...varintField(2, contract.amount), ...varintField(3, BigInt(RESOURCES.indexOf(contract.resource))))
		case 'VoteWitnessContract':
			return concatBytes(
				...owner,
				// Un mensaje anidado se escribe siempre, aunque quede vacío
				...contract.votes.map(vote => encodeBytesField(2, concatBytes(...bytesField(1, hex20ToAddressBytes(vote.address)), ...varintField(2, vote.count)))),
				...varintField(3, contract.support ? 1n : 0n),
			)
		default:
			return concatBytes(...owner)
	}
}

/**
 * Los bytes que java-tron (protobuf-java) escribiría para ese contenido: campos en orden,
 * sin valores por defecto y con varints mínimos. Es la referencia contra la que se compara
 * lo que se va a firmar.
 */
export const encodeDecodedTronRaw = (raw: DecodedTronRaw): Uint8Array =>
	concatBytes(
		...bytesField(1, hexToBytes(raw.refBlockBytes)),
		...bytesField(4, hexToBytes(raw.refBlockHash)),
		...varintField(8, raw.expiration),
		...raw.contracts.map(contract => encodeBytesField(11, concatBytes(
			...varintField(1, CONTRACT_CODES[contract.type]),
			encodeBytesField(2, concatBytes(...bytesField(1, asciiBytes(typeUrlOf(contract.type))), ...bytesField(2, encodeContractValue(contract)))),
		))),
		...varintField(14, raw.timestamp),
		...varintField(18, raw.feeLimit),
	)

/**
 * Decodifica `raw_data_hex` (protocol.Transaction.raw) y garantiza que NO admite una
 * segunda lectura: lo que devuelve es lo único que la red puede ejecutar con esos bytes.
 *
 * El contrato viaja como bytes opacos (`Any.value`), así que el hash que firma el usuario
 * los cubre tal cual, traigan lo que traigan; y protobuf estándar, ante un campo singular
 * repetido, ejecuta el ÚLTIMO. Un lector que se quedara con el primero verificaría
 * «1 TRX a Bob» sobre una tx que paga todo el saldo al atacante. Dos barreras:
 *
 * 1. Forma exacta en cada nivel (`decodeExact`): ni campos repetidos, ni desconocidos, ni
 *    con otro wire type, ni un tipo de contrato que no sea de los que la wallet usa.
 * 2. Los bytes tienen que ser, exactamente, la codificación canónica de lo decodificado
 *    (`encodeDecodedTronRaw`). Corta lo que la primera no nombra: campos fuera de orden,
 *    varints con relleno, valores por defecto escritos a mano.
 *
 * Todo fallo es un `TronVerifyError`: una tx que no se puede leer así no se firma.
 */
export const decodeTronRaw = (rawHex: string): DecodedTronRaw => {
	let bytes: Uint8Array
	let raw: DecodedTronRaw
	try {
		bytes = hexToBytes(rawHex)
		raw = decodeRawFields(bytes)
	} catch (err) {
		if (err instanceof TronVerifyError) throw err
		throw new TronVerifyError(`raw_data ilegible: ${(err as Error)?.message ?? err}`)
	}
	if (!equalBytes(encodeDecodedTronRaw(raw), bytes)) throw new TronVerifyError('raw_data no es la codificación canónica de su contenido')
	return raw
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
 *
 * Que estos campos sean TODO lo que dice la tx lo garantiza `decodeTronRaw`
 * (forma exacta + codificación canónica): aquí solo se compara con lo pedido.
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
		// `createtransaction` no pone fee_limit: una transferencia de TRX no ejecuta contrato
		if (raw.feeLimit !== 0n) throw new TronVerifyError('una transferencia de TRX no lleva fee_limit')
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

/** Precios que la red cobra por recurso, leídos de `getchainparameters` (sun). */
export type TronChainParams = { energyFeeSun: bigint, bandwidthFeeSun: bigint, createAccountFeeSun: bigint }

/**
 * Recursos de una cuenta TRON. `energy`/`*Bandwidth` son lo DISPONIBLE
 * (límite − usado); los `*Limit` son el total, y existen solo para pintar
 * medidores: la aritmética de coste nunca los mira.
 */
export type TronResources = {
	energy: bigint
	energyLimit: bigint
	/** Cuota diaria gratuita (600 bytes por defecto en TRON). */
	freeBandwidth: bigint
	freeBandwidthLimit: bigint
	/** Ancho de banda obtenido congelando TRX o recibido por delegación. */
	stakedBandwidth: bigint
	stakedBandwidthLimit: bigint
}

/** Desglose del TRX quemado, por concepto. */
export type TronBurnBreakdown = {
	/** Energía que falta comprar/alquilar (0 si la cuenta la tiene toda). */
	energyShort: bigint
	/** Sun quemados por esa energía faltante. */
	energyBurnSun: bigint
	/** Alguna de las dos bolsas cubre el ancho de banda entero. */
	bandwidthCovered: boolean
	/** Sun quemados por ancho de banda (todo o nada). */
	bandwidthBurnSun: bigint
	/** Sun del alta de la cuenta destino (solo TRX a cuenta nueva). */
	activationSun: bigint
	/** Suma de los tres conceptos. */
	total: bigint
}

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
	/** Recursos de la cuenta remitente en el momento de construir la tx. */
	resources: TronResources
	/** Precios de la red con los que se calculó el quemado. */
	params: TronChainParams
	/** Hasta cuándo se puede firmar, en el reloj del teléfono (`TRON_TX_VALIDITY_MS`). */
	expiresAt: number
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
export const decodeNodeMessage = (value: unknown): string => {
	if (typeof value !== 'string') return ''
	if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return value
	try { return String.fromCharCode(...hexToBytes(value)).replace(/[^\x20-\x7e]/g, '') } catch { return value }
}

export const getTronChainParams = async (rpc: RegistryRpc, deps: Deps = {}): Promise<TronChainParams> => {
	const defaults: TronChainParams = { energyFeeSun: DEFAULT_ENERGY_FEE_SUN, bandwidthFeeSun: DEFAULT_BANDWIDTH_FEE_SUN, createAccountFeeSun: DEFAULT_CREATE_ACCOUNT_FEE_SUN }
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

/**
 * Recursos de la cuenta: `{}` si nunca se activó (todo a 0). Devuelve
 * disponible Y límite de cada recurso — el disponible es lo que decide el
 * coste, el límite es lo que pinta los medidores de la pantalla de energía.
 */
export const getTronResources = async (rpc: RegistryRpc, address: string, deps: Deps = {}): Promise<TronResources> => {
	const r = await post<{ freeNetLimit?: number, freeNetUsed?: number, NetLimit?: number, NetUsed?: number, EnergyLimit?: number, EnergyUsed?: number }>(
		rpc, '/wallet/getaccountresource', { address, visible: true }, deps,
	)
	const total = (limit?: number) => BigInt(limit ?? 0)
	const avail = (limit?: number, used?: number) => { const v = BigInt(limit ?? 0) - BigInt(used ?? 0); return v > 0n ? v : 0n }
	return {
		energy: avail(r.EnergyLimit, r.EnergyUsed),
		energyLimit: total(r.EnergyLimit),
		freeBandwidth: avail(r.freeNetLimit, r.freeNetUsed),
		freeBandwidthLimit: total(r.freeNetLimit),
		stakedBandwidth: avail(r.NetLimit, r.NetUsed),
		stakedBandwidthLimit: total(r.NetLimit),
	}
}

/** ¿Existe la cuenta destino? (un TRX a una cuenta nueva paga la activación). */
export const tronAccountExists = async (rpc: RegistryRpc, address: string, deps: Deps = {}): Promise<boolean> => {
	const account = await post<{ address?: string }>(rpc, '/wallet/getaccount', { address, visible: true }, deps)
	return !!account?.address
}

/**
 * De qué está hecho el TRX que se va a quemar. PURA.
 *
 * Existe desglosado y no como un total porque **alquilar energía no paga el
 * ancho de banda**: una cuenta con energía delegada pero sin banda libre
 * sigue quemando TRX y sigue sin poder enviar si no tiene ninguno. Un solo
 * `bigint` agregado no deja distinguir ese caso, y ofrecer ahí un alquiler es
 * cobrarle al usuario por algo que no le desbloquea nada.
 *
 * Dos matices de la red que la aritmética respeta:
 * - El ancho de banda NO se paga a trozos: o lo cubre una de las dos bolsas
 *   (gratuita o congelada) entera, o se quema entero. Las bolsas tampoco
 *   suman entre sí.
 * - La energía SÍ es proporcional: solo se quema lo que falta.
 */
export const computeTronBurnBreakdown = (
	{ energyNeeded, bandwidthNeeded, activatesAccount }: Pick<TronFeeEstimate, 'energyNeeded' | 'bandwidthNeeded' | 'activatesAccount'>,
	resources: TronResources,
	params: TronChainParams,
): TronBurnBreakdown => {
	const energyShort = energyNeeded > resources.energy ? energyNeeded - resources.energy : 0n
	const bandwidthCovered = resources.freeBandwidth >= bandwidthNeeded || resources.stakedBandwidth >= bandwidthNeeded
	const energyBurnSun = energyShort * params.energyFeeSun
	const bandwidthBurnSun = bandwidthCovered ? 0n : bandwidthNeeded * params.bandwidthFeeSun
	const activationSun = activatesAccount ? params.createAccountFeeSun : 0n
	return {
		energyShort,
		energyBurnSun,
		bandwidthCovered,
		bandwidthBurnSun,
		activationSun,
		total: energyBurnSun + bandwidthBurnSun + activationSun,
	}
}

/** Costo en TRX (sun) de una tx con los recursos actuales. PURO. */
export const computeTronBurn = (
	partial: Pick<TronFeeEstimate, 'energyNeeded' | 'bandwidthNeeded' | 'activatesAccount'>,
	resources: TronResources,
	params: TronChainParams,
): bigint => computeTronBurnBreakdown(partial, resources, params).total

/**
 * fee_limit de una TRC-20: la energía estimada con un 30% de margen (la
 * estimación de `triggerconstantcontract` es exacta salvo cambios de estado
 * entre estimar y ejecutar), acotado al tope duro. PURO.
 */
export const computeFeeLimit = (energyNeeded: bigint, params: TronChainParams): bigint => {
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
		const expiresAt = Date.now() + TRON_TX_VALIDITY_MS
		const raw = verifyTronTransaction(tx, intent, 0n)
		const bandwidthNeeded = BigInt(tx.raw_data_hex.length / 2) + SIGNATURE_OVERHEAD_BYTES
		const partial = { energyNeeded: 0n, bandwidthNeeded, activatesAccount: !exists }
		return { intent, tx, raw, resources, params, expiresAt, fee: { ...partial, burnSun: computeTronBurn(partial, resources, params), feeLimitSun: 0n } }
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
	const expiresAt = Date.now() + TRON_TX_VALIDITY_MS
	const raw = verifyTronTransaction(tx, intent, feeLimitSun)
	const bandwidthNeeded = BigInt(tx.raw_data_hex.length / 2) + SIGNATURE_OVERHEAD_BYTES
	const partial = { energyNeeded, bandwidthNeeded, activatesAccount: false }
	return { intent, tx, raw, resources, params, expiresAt, fee: { ...partial, burnSun: computeTronBurn(partial, resources, params), feeLimitSun } }
}

// ---------------------------------------------------------------------------
// Firma y broadcast
// ---------------------------------------------------------------------------

/**
 * Firma el txID (sha256 del raw, sin volver a hashear) con la clave privada
 * TRON. Devuelve r‖s‖(27+recovery) en hex, la convención de java-tron.
 * No retiene la clave: el caller la descarta al volver.
 *
 * Última barrera, común a enviar, swap y staking: solo se firma un raw que
 * `decodeTronRaw` lee sin ambigüedad. Cada flujo compara ANTES ese contenido con
 * lo que el usuario confirmó; esto impide que uno nuevo (o un descuido) firme
 * bytes que la wallet no sabe leer del todo.
 */
export const signTronTransaction = (rawHex: string, privateKey: Uint8Array): string => {
	decodeTronRaw(rawHex)
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

/**
 * Cuánto tiene que haber pasado la punta de la `expiration` de una tx para dar por buena su
 * ausencia. java-tron no puede probar en UNA respuesta que una tx no está (`getblock` sin
 * detalle no trae ids), y detrás de un balanceador (TronGrid) la punta y la búsqueda pueden
 * contestarlas nodos distintos: para que un nodo rezagado diga "no está" de una tx que sí
 * entró, tendría que ir más de este margen por detrás. Mitigación, no prueba.
 */
export const TRON_LOOKUP_MARGIN_MS = 3 * 60_000

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * ¿Qué fue de una tx firmada cuya difusión no dio respuesta clara? La punta se lee ANTES que
 * la tx: si ya pasó su `expiration` (con `TRON_LOOKUP_MARGIN_MS`) y la tx no está en ningún
 * bloque hasta ella, ya no entrará nunca (java-tron rechaza toda tx con expiration ≤
 * headBlockTime). Entrada pero fallida (sin energía, revert) cuenta como `dropped`: no movió
 * fondos y su firma ya no vale.
 *
 * Solo `{}` EXACTO es "no está" (`GetTransactionByIdServlet`). java-tron contesta 200 con
 * `{ Error }` cuando algo falla (`Util.processError`): eso, o cualquier otra forma, es `unknown`.
 */
export const lookupTronTransaction = async (rpc: RegistryRpc, rawHex: string, deps: Deps = {}): Promise<TxLookup> => {
	const txid = tronTxId(rawHex)
	const head = await post<unknown>(rpc, '/wallet/getnowblock', {}, deps)
	const found = await post<unknown>(rpc, '/wallet/gettransactionbyid', { value: txid }, deps)
	if (!isPlainObject(found) || 'Error' in found) return { status: 'unknown' }
	if (typeof found.txID === 'string') {
		if (found.txID.toLowerCase() !== txid) return { status: 'unknown' }
		const ret = Array.isArray(found.ret) && isPlainObject(found.ret[0]) ? found.ret[0].contractRet : undefined
		return ret === undefined || ret === 'SUCCESS' ? { status: 'landed', txid } : { status: 'dropped' }
	}
	if (Object.keys(found).length !== 0) return { status: 'unknown' }
	const headTime = isPlainObject(head) && !('Error' in head) && isPlainObject(head.block_header) && isPlainObject(head.block_header.raw_data)
		? head.block_header.raw_data.timestamp
		: undefined
	if (typeof headTime !== 'number' || !Number.isFinite(headTime)) return { status: 'unknown' }
	return BigInt(headTime) >= decodeTronRaw(rawHex).expiration + BigInt(TRON_LOOKUP_MARGIN_MS) ? { status: 'dropped' } : { status: 'unknown' }
}
