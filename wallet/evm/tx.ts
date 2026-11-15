/**
 * Enviar en cadenas EVM (Ethereum, BNB Chain, Base, Polygon): nativo y
 * tokens ERC-20. Módulo PURO (fetch global + viem), tests en node.
 *
 * A diferencia de TRON, aquí la tx la construye la APP entera (nonce, gas,
 * fee): el nodo solo aporta datos (`eth_getTransactionCount`,
 * `eth_estimateGas`, bloque/fee) y difunde bytes ya firmados. Aun así se
 * cumple la regla 6 del plan por doble vía: lo que se muestra sale de la tx
 * construida (no del formulario) y, tras firmar, se PARSEA la tx serializada
 * y se comprueba que to/value/data/chainId son los de la intención y que el
 * firmante recuperado es nuestra dirección.
 *
 * Fees: EIP-1559 si el último bloque trae `baseFeePerGas` (las 4 redes hoy),
 * legacy (`gasPrice`) si no. `maxFeePerGas = 2·base + priority` absorbe
 * subidas entre construir y minar; lo que se cobra es `base + priority`.
 */
import { keccak256, parseTransaction, recoverTransactionAddress } from 'viem'
import { signTransaction } from 'viem/accounts'
import type { TransactionSerializable, TransactionSerialized } from 'viem'

import { ChainHttpError, hexToBigInt, jsonRpc } from '../chains/http'
import type { TxLookup } from '../chains/txLookup'
import type { RegistryChain, RegistryRpc } from '../registry/types'

const TRANSFER_SELECTOR = '0xa9059cbb'

/** Gas de una transferencia de nativo a una cuenta externa (el mínimo de cualquier tx). */
export const NATIVE_TRANSFER_GAS = 21_000n

/**
 * Margen sobre la estimación cuando el destino EJECUTA código al recibir nativo: un
 * contrato, una smart wallet (Safe, cuentas 4337) o una cuenta con delegación EIP-7702.
 */
const NATIVE_CODE_GAS_MARGIN_PERCENT = 25n

/** Tope duro del gas de un envío de nativo: por encima, el destino hace algo más que recibir. */
export const MAX_NATIVE_GAS = 150_000n

const GWEI = 1_000_000_000n

/**
 * Tope de cordura del precio del gas por red, en wei por unidad de gas (E-02).
 *
 * El precio lo da el nodo, y la tx autoriza `gas × precio`: un nodo propio, uno del
 * registro o uno con un fallo que conteste ×1000 hacía firmar una comisión que podía
 * comerse el nativo. Los topes son holgados respecto a los picos reales de cada red (lo
 * normal va de 0,05 gwei en BNB Chain o Base a unos pocos en Ethereum) y dejan lo máximo
 * que puede costar un envío de token en el orden de unos pocos dólares, salvo en
 * Ethereum, donde un pico de verdad ya cuesta eso.
 */
export const MAX_GAS_PRICE_WEI: Readonly<Record<number, bigint>> = {
	1: 500n * GWEI, // Ethereum
	56: 50n * GWEI, // BNB Chain
	137: 5_000n * GWEI, // Polygon
	8453: 100n * GWEI, // Base
}

/** Para una red EVM sin tope propio. */
export const DEFAULT_MAX_GAS_PRICE_WEI = 1_000n * GWEI

/**
 * Lanza si el precio que la tx autorizaría por unidad de gas pasa del tope de su red.
 * `retryable`: el router prueba con otro nodo, que es lo que arregla un nodo que miente o
 * falla; si todos dicen lo mismo es un pico real y no se firma hasta que baje.
 */
export const assertSaneGasPrice = (chainId: number, pricePerGas: bigint): void => {
	const cap = MAX_GAS_PRICE_WEI[chainId] ?? DEFAULT_MAX_GAS_PRICE_WEI
	if (pricePerGas > cap) throw new ChainHttpError(`evm: precio de gas fuera de rango (${pricePerGas} wei por gas, tope ${cap})`, { retryable: true })
}

const OUT_OF_RANGE = /precio de gas fuera de rango/

/**
 * ¿No se preparó la tx porque el precio del gas pasa del tope? Vale para el error suelto y
 * para el del router cuando ningún nodo dio un precio razonable (`AllRpcsFailedError.errors`):
 * ahí lo que hay que decir no es «sin nodos», sino que la comisión está disparada.
 */
export const isGasPriceOutOfRange = (err: unknown): boolean => {
	const inner = (err as { errors?: unknown } | null)?.errors
	const list = Array.isArray(inner) && inner.length > 0 ? inner : [err]
	return list.some(item => item instanceof Error && OUT_OF_RANGE.test(item.message))
}

/** Margen sobre `eth_estimateGas` en tokens: los saldos que cruzan de 0 y los tokens con hooks (USDT) cuestan más al ejecutar que al estimar. */
const TOKEN_GAS_MARGIN_PERCENT = 25n

/** Tope duro del gas de una transferencia ERC-20: por encima, algo raro pasa con el contrato. */
const MAX_TOKEN_GAS = 300_000n

/**
 * Prioridad de RESPALDO (1 gwei): solo cuando el nodo devuelve 0 o no tiene
 * `eth_maxPriorityFeePerGas` (sin prioridad la tx se queda sin minar). Nunca es un suelo
 * sobre una sugerencia real: en Base la red pide ~0,001 gwei y 1 gwei era pagar ×1000.
 */
const MIN_PRIORITY_FEE_WEI = 1_000_000_000n

/**
 * Tope de gas de una tx PATROCINADA (gasPrice 0). Lo paga otro, así que va más ceñido que
 * `MAX_TOKEN_GAS`: un transfer de USDT en BSC gasta ~35-52k. Es el mismo tope que aplica
 * TronDealer (`BSC_SPONSOR_MAX_GAS`); por encima, la rechazaría sin gastar nada.
 */
export const MAX_SPONSORED_GAS = 120_000n

// ---------------------------------------------------------------------------
// Direcciones y calldata
// ---------------------------------------------------------------------------

/**
 * Dirección EVM válida: 0x + 40 hex; si viene en mayúsculas/minúsculas
 * mezcladas, el checksum EIP-55 debe cuadrar (una letra cambiada = inválida).
 * Toda en minúsculas o toda en mayúsculas no lleva checksum y se acepta.
 */
export const isValidEvmAddress = (address: string): boolean => {
	if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false
	const body = address.slice(2)
	const mixed = body !== body.toLowerCase() && body !== body.toUpperCase()
	return !mixed || checksumAddress(address) === address
}

/** EIP-55 con keccak de viem. */
export const checksumAddress = (address: string): string => {
	const lower = address.toLowerCase().replace(/^0x/, '')
	const hash = keccak256(new TextEncoderLite().encode(lower)).slice(2)
	let out = '0x'
	for (let i = 0; i < lower.length; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i]
	return out
}

/** `transfer(address,uint256)` completo (selector + args). */
export const encodeErc20Transfer = (to: string, amount: bigint): `0x${string}` =>
	`${TRANSFER_SELECTOR}${to.toLowerCase().replace(/^0x/, '').padStart(64, '0')}${amount.toString(16).padStart(64, '0')}` as `0x${string}`

// ASCII → bytes sin TextEncoder (no garantizado en Hermes)
class TextEncoderLite { encode(text: string): Uint8Array { return Uint8Array.from(text, ch => ch.charCodeAt(0)) } }

// ---------------------------------------------------------------------------
// Intención, construcción y fee
// ---------------------------------------------------------------------------

export type EvmSendIntent = {
	chainId: number
	from: string
	to: string
	/** Unidades mínimas (wei o unidades del token). */
	amount: bigint
	/** null = nativo; si no, contrato ERC-20. */
	contract: string | null
}

export type FeeTier = 'fast' | 'normal' | 'slow'

/**
 * Prioridad por nivel sobre la sugerida por el nodo: Económico la mitad, Rápido el doble.
 * En legacy (gasPrice) se escala el precio. Económico no baja de 1 gwei, y en las redes
 * donde lo sugerido ya está por debajo (Base, BNB Chain) se queda en lo sugerido: ahí
 * la mitad puede caer bajo el mínimo que aceptan los validadores (BSC) y no minarse.
 */
export const tierPriority = (suggested: bigint, tier: FeeTier): bigint => {
	if (tier === 'fast') return suggested * 2n
	if (tier === 'slow') {
		const half = suggested / 2n
		const floor = suggested < MIN_PRIORITY_FEE_WEI ? suggested : MIN_PRIORITY_FEE_WEI
		return half > floor ? half : floor
	}
	return suggested
}

export type EvmFeeEstimate = {
	gasLimit: bigint
	/** Lo que se espera pagar (wei): gas × (base + priority) o gas × gasPrice. */
	estimatedWei: bigint
	/** Lo máximo que la tx autoriza (wei): gas × maxFeePerGas. */
	maxWei: bigint
	eip1559: boolean
}

export type PreparedEvmSend = {
	intent: EvmSendIntent
	tx: TransactionSerializable
	fee: EvmFeeEstimate
	tier: FeeTier
	/** Fee estimada (wei) por nivel con el mismo gas, para mostrar las opciones sin volver al nodo. */
	feeByTier: Record<FeeTier, bigint>
	/**
	 * Patrocinada: legacy con gasPrice 0. Solo vale dentro de un bundle de un paymaster
	 * BEP-414 (BSC), así que NUNCA se difunde desde la app: la manda el backend.
	 */
	sponsored: boolean
}

type Deps = { signal?: AbortSignal }

const rpcOpts = (rpc: RegistryRpc, deps: Deps) => ({ signal: deps.signal, headers: rpc.headers })

export class EvmVerifyError extends Error {
	constructor(message: string) { super(message); this.name = 'EvmVerifyError' }
}

/** Fee actual de la red: EIP-1559 (base del último bloque + prioridad) o legacy. PURO salvo las 2-3 llamadas RPC. */
export const getEvmFeeData = async (rpc: RegistryRpc, deps: Deps = {}): Promise<{ eip1559: true, baseFee: bigint, priorityFee: bigint } | { eip1559: false, gasPrice: bigint }> => {
	const block = await jsonRpc<{ baseFeePerGas?: string }>(rpc.url, 'eth_getBlockByNumber', ['latest', false], rpcOpts(rpc, deps))
	if (block?.baseFeePerGas) {
		let priority = MIN_PRIORITY_FEE_WEI
		try {
			const suggested = hexToBigInt(await jsonRpc<string>(rpc.url, 'eth_maxPriorityFeePerGas', [], rpcOpts(rpc, deps)))
			if (suggested > 0n) priority = suggested
		} catch { /* nodo sin el método: 1 gwei de prioridad */ }
		return { eip1559: true, baseFee: hexToBigInt(block.baseFeePerGas), priorityFee: priority }
	}
	return { eip1559: false, gasPrice: hexToBigInt(await jsonRpc<string>(rpc.url, 'eth_gasPrice', [], rpcOpts(rpc, deps))) }
}

/**
 * Un `eth_estimateGas` que el nodo rechaza porque la tx REVERTIRÍA o no hay saldo no es un
 * fallo del nodo: sería igual en cualquiera. Varios (geth) lo devuelven con el código
 * genérico -32000, que `jsonRpc` trata como «prueba con otro nodo»; aquí se marca como
 * definitivo para que no se recorran todos y el motivo llegue a la pantalla.
 */
const rejectedEstimate = (err: unknown): never => {
	const message = (err as Error)?.message ?? ''
	if (/revert|insufficient funds|exceeds balance|insufficient balance/i.test(message)) {
		throw new ChainHttpError(message, { retryable: false, data: (err as ChainHttpError)?.data })
	}
	throw err
}

/**
 * Construye la tx sin firmar con nonce, gas y fee reales del nodo. Lanza
 * `ChainHttpError` no reintentable con el mensaje del nodo si la estimación
 * revierte (saldo de token insuficiente, contrato pausado…).
 */
export const prepareEvmSend = async (rpc: RegistryRpc, chain: RegistryChain, intent: EvmSendIntent, deps: Deps & { tier?: FeeTier, zeroGas?: boolean } = {}): Promise<PreparedEvmSend> => {
	const tier = deps.tier ?? 'normal'
	if (!isValidEvmAddress(intent.to)) throw new ChainHttpError('evm: destino inválido', { retryable: false })
	if (intent.amount <= 0n) throw new ChainHttpError('evm: cantidad inválida', { retryable: false })
	if (chain.chainId !== intent.chainId) throw new ChainHttpError('evm: chainId no coincide con la red', { retryable: false })
	if (deps.zeroGas) return prepareSponsoredEvmSend(rpc, intent, deps)

	const to = (intent.contract ?? intent.to) as `0x${string}`
	const value = intent.contract ? 0n : intent.amount
	const data = intent.contract ? encodeErc20Transfer(intent.to, intent.amount) : ('0x' as `0x${string}`)

	const [nonceHex, feeData, gasHex] = await Promise.all([
		// `pending`: si hay una tx nuestra en el mempool, la siguiente no debe pisar su nonce
		jsonRpc<string>(rpc.url, 'eth_getTransactionCount', [intent.from, 'pending'], rpcOpts(rpc, deps)),
		getEvmFeeData(rpc, deps),
		// También en nativo (E-01): con 21.000 fijos, un destino que ejecuta código se
		// quedaba sin gas, la tx se minaba, revertía y se quemaba la comisión. Y si la
		// simulación revierte, no se firma
		jsonRpc<string>(rpc.url, 'eth_estimateGas', [{ from: intent.from, to, data, value: `0x${value.toString(16)}` }], rpcOpts(rpc, deps)).catch(rejectedEstimate),
	])

	let gasLimit = hexToBigInt(gasHex)
	if (intent.contract) {
		gasLimit = gasLimit * (100n + TOKEN_GAS_MARGIN_PERCENT) / 100n
		if (gasLimit > MAX_TOKEN_GAS) throw new ChainHttpError(`evm: gas estimado anómalo (${gasLimit})`, { retryable: false })
	} else if (gasLimit <= NATIVE_TRANSFER_GAS) {
		// Una cuenta externa: exactamente el mínimo, sin margen (MÁX lo da por hecho)
		gasLimit = NATIVE_TRANSFER_GAS
	} else {
		gasLimit = gasLimit * (100n + NATIVE_CODE_GAS_MARGIN_PERCENT) / 100n
		if (gasLimit > MAX_NATIVE_GAS) throw new ChainHttpError(`evm: gas estimado anómalo para un envío de nativo (${gasLimit})`, { retryable: false })
	}

	const base = { chainId: intent.chainId, nonce: Number(hexToBigInt(nonceHex)), to, value, data, gas: gasLimit }
	const tiers: FeeTier[] = ['fast', 'normal', 'slow']
	if (feeData.eip1559) {
		const priority = tierPriority(feeData.priorityFee, tier)
		const maxFeePerGas = feeData.baseFee * 2n + priority
		assertSaneGasPrice(intent.chainId, maxFeePerGas)
		const tx: TransactionSerializable = { ...base, type: 'eip1559', maxFeePerGas, maxPriorityFeePerGas: priority }
		const feeByTier = Object.fromEntries(tiers.map(t => [t, gasLimit * (feeData.baseFee + tierPriority(feeData.priorityFee, t))])) as Record<FeeTier, bigint>
		return { intent, tx, fee: { gasLimit, estimatedWei: gasLimit * (feeData.baseFee + priority), maxWei: gasLimit * maxFeePerGas, eip1559: true }, tier, feeByTier, sponsored: false }
	}
	// Legacy: el "priority" es el propio gasPrice escalado
	const gasPrice = tierPriority(feeData.gasPrice, tier)
	assertSaneGasPrice(intent.chainId, gasPrice)
	const tx: TransactionSerializable = { ...base, type: 'legacy', gasPrice }
	const feeByTier = Object.fromEntries(tiers.map(t => [t, gasLimit * tierPriority(feeData.gasPrice, t)])) as Record<FeeTier, bigint>
	return { intent, tx, fee: { gasLimit, estimatedWei: gasLimit * gasPrice, maxWei: gasLimit * gasPrice, eip1559: false }, tier, feeByTier, sponsored: false }
}

/**
 * Tx patrocinada por un paymaster BEP-414 (BSC): `transfer` de token, **legacy con
 * gasPrice 0**. Así es como la espera el paymaster: él añade su propia tx pagadora y las
 * mete juntas en un bundle (entran las dos o ninguna). El usuario no necesita nativo.
 *
 * Solo tokens: patrocinar un envío del propio nativo no tiene sentido (quien lo tiene
 * puede pagar su gas) y los paymasters no lo aceptan.
 *
 * El nonce es `pending`, igual que en un envío normal: si hay otra tx del usuario sin
 * minar, el backend lo detecta (NONCE_GAP) antes de gastar nada. Y como el bundle viaja por
 * canal privado, si el usuario acaba enviando por su cuenta, esa tx toma el mismo nonce y
 * deja sin valor a la patrocinada: como mucho sale una de las dos.
 */
const prepareSponsoredEvmSend = async (rpc: RegistryRpc, intent: EvmSendIntent, deps: Deps): Promise<PreparedEvmSend> => {
	if (!intent.contract) throw new ChainHttpError('evm: solo se patrocinan envíos de tokens', { retryable: false })
	const to = intent.contract as `0x${string}`
	const data = encodeErc20Transfer(intent.to, intent.amount)

	const [nonceHex, gasHex] = await Promise.all([
		jsonRpc<string>(rpc.url, 'eth_getTransactionCount', [intent.from, 'pending'], rpcOpts(rpc, deps)),
		// Sin gasPrice: la estimación no exige saldo de nativo, que es justo lo que falta
		jsonRpc<string>(rpc.url, 'eth_estimateGas', [{ from: intent.from, to, data, value: '0x0' }], rpcOpts(rpc, deps)),
	])

	const gasLimit = hexToBigInt(gasHex) * (100n + TOKEN_GAS_MARGIN_PERCENT) / 100n
	if (gasLimit > MAX_SPONSORED_GAS) throw new ChainHttpError(`evm: gas estimado anómalo para un envío patrocinado (${gasLimit})`, { retryable: false })

	const tx: TransactionSerializable = { chainId: intent.chainId, nonce: Number(hexToBigInt(nonceHex)), to, value: 0n, data, gas: gasLimit, type: 'legacy', gasPrice: 0n }
	const zero = { fast: 0n, normal: 0n, slow: 0n }
	return { intent, tx, fee: { gasLimit, estimatedWei: 0n, maxWei: 0n, eip1559: false }, tier: 'normal', feeByTier: zero, sponsored: true }
}

// ---------------------------------------------------------------------------
// Firma, verificación y broadcast
// ---------------------------------------------------------------------------

export type SignedEvmTx = { raw: `0x${string}`, hash: `0x${string}` }

/**
 * Firma y VERIFICA: la tx serializada se vuelve a parsear y debe coincidir
 * con la intención (chainId, destino, valor, calldata, gas) y recuperar
 * nuestra dirección como firmante. No retiene la clave.
 */
export const signEvmTransaction = async (prepared: PreparedEvmSend, privateKey: Uint8Array): Promise<SignedEvmTx> => {
	const hex = `0x${Array.from(privateKey, b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
	const raw = await signTransaction({ privateKey: hex, transaction: prepared.tx })
	await verifySignedEvmTransaction(raw, prepared)
	return { raw, hash: keccak256(raw) }
}

export const verifySignedEvmTransaction = async (raw: `0x${string}`, { intent, tx, sponsored }: PreparedEvmSend): Promise<void> => {
	const parsed = parseTransaction(raw)
	// gasPrice 0 en las dos direcciones: una patrocinada con precio la pagaría el usuario, y
	// una normal con precio 0 se quedaría en el mempool para siempre
	// (viem deja `gasPrice` sin definir cuando el RLP lo codifica vacío, que es como va el 0)
	const zeroPrice = parsed.type === 'legacy' && (parsed.gasPrice ?? 0n) === 0n
	if (sponsored && !zeroPrice) throw new EvmVerifyError('una tx patrocinada debe ser legacy con gasPrice 0')
	if (!sponsored && (parsed.type === 'legacy' ? !parsed.gasPrice : !parsed.maxFeePerGas)) throw new EvmVerifyError('tx sin precio de gas')
	const expectedTo = (intent.contract ?? intent.to).toLowerCase()
	const expectedData = intent.contract ? encodeErc20Transfer(intent.to, intent.amount) : '0x'
	if (parsed.chainId !== intent.chainId) throw new EvmVerifyError('chainId distinto')
	if ((parsed.to ?? '').toLowerCase() !== expectedTo) throw new EvmVerifyError('destino distinto')
	if ((parsed.value ?? 0n) !== (intent.contract ? 0n : intent.amount)) throw new EvmVerifyError('valor distinto')
	if ((parsed.data ?? '0x').toLowerCase() !== expectedData.toLowerCase()) throw new EvmVerifyError('calldata distinta')
	if ((parsed.gas ?? 0n) !== tx.gas) throw new EvmVerifyError('gas distinto')
	const signer = await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized })
	if (signer.toLowerCase() !== intent.from.toLowerCase()) throw new EvmVerifyError('firmante distinto')
}

export type EvmBroadcastResult = { hash: `0x${string}`, duplicate: boolean }

/**
 * `eth_sendRawTransaction`. "already known"/"already exists" = la misma tx
 * ya está en el mempool (reintento tras timeout): éxito. "nonce too low"
 * tras un reintento suele significar que YA se minó: se confirma buscando el
 * hash antes de darla por fallida. El resto (fondos insuficientes, gas bajo)
 * son errores de negocio, iguales en cualquier nodo: no rotan.
 */
export const broadcastEvmTransaction = async (rpc: RegistryRpc, signed: SignedEvmTx, deps: Deps = {}): Promise<EvmBroadcastResult> => {
	try {
		const hash = await jsonRpc<`0x${string}`>(rpc.url, 'eth_sendRawTransaction', [signed.raw], rpcOpts(rpc, deps))
		return { hash: hash ?? signed.hash, duplicate: false }
	} catch (err) {
		const message = (err as Error)?.message ?? ''
		if (/already known|already exists|known transaction|alreadyknown/i.test(message)) return { hash: signed.hash, duplicate: true }
		if (/nonce too low|replacement transaction underpriced/i.test(message)) {
			const existing = await jsonRpc<{ hash?: string } | null>(rpc.url, 'eth_getTransactionByHash', [signed.hash], rpcOpts(rpc, deps)).catch(() => null)
			if (existing?.hash) return { hash: signed.hash, duplicate: true }
		}
		throw err
	}
}

// ---------------------------------------------------------------------------
// ¿Qué fue de una tx ya difundida?
// ---------------------------------------------------------------------------

/** Tiempo que debe llevar gastado el nonce de una tx para dar por buena su ausencia (como en TRON). */
export const EVM_LOOKUP_MARGIN_S = 180n

/**
 * Ese margen, en bloques, no pasa de lo que un nodo completo guarda de estado (128 bloques,
 * con algo de aire): en las redes rápidas se queda corto en tiempo (~45 s en BNB Chain,
 * ~20 s en Base). Ni baja de `EVM_LOOKUP_MIN_DEPTH`.
 */
export const EVM_LOOKUP_MAX_DEPTH = 100n
export const EVM_LOOKUP_MIN_DEPTH = 12n

/** Lo que identifica una tx firmada ante la cadena: su hash, quién la firma y con qué nonce. */
export type SentEvmTx = { hash: string, from: string, nonce: number }

type EvmReceipt = { transactionHash?: unknown, blockNumber?: unknown, status?: unknown }
type EvmBlockHead = { number?: string, timestamp?: string }

/** El recibo de ESA tx, si el nodo lo tiene. `null`: no hay recibo. */
const readEvmReceipt = async (rpc: RegistryRpc, hash: string, deps: Deps): Promise<TxLookup | null> => {
	const receipt = await jsonRpc<EvmReceipt | null>(rpc.url, 'eth_getTransactionReceipt', [hash], rpcOpts(rpc, deps))
	if (!receipt || typeof receipt !== 'object') return null
	if (typeof receipt.transactionHash !== 'string' || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) return { status: 'unknown' }
	// Con recibo, la tx está en un bloque: gastó su nonce y esa firma ya no vale. `0x0` =
	// revirtió (no movió el importe); cualquier otra cosa se cuenta como ejecutada, que es
	// el lado seguro: nunca invita a firmar otra
	return receipt.status === '0x0' ? { status: 'dropped' } : { status: 'landed', txid: hash }
}

/** ¿Conoce el nodo esa tx (minada o en su mempool)? */
const knowsEvmTransaction = async (rpc: RegistryRpc, hash: string, deps: Deps): Promise<boolean> => {
	const found = await jsonRpc<{ hash?: unknown } | null>(rpc.url, 'eth_getTransactionByHash', [hash], rpcOpts(rpc, deps))
	return !!found && typeof found === 'object' && typeof found.hash === 'string' && found.hash.toLowerCase() === hash.toLowerCase()
}

/**
 * El bloque en el que se mira el nonce: el que queda `EVM_LOOKUP_MARGIN_S` por detrás de
 * la punta, medido con las marcas de tiempo de la propia cadena (los bloques van de 12 s
 * en Ethereum a 0,2 s en Base, y cambian). `null`: la cadena no da para medirlo.
 */
const evmLookupBlock = async (rpc: RegistryRpc, deps: Deps): Promise<bigint | null> => {
	const latest = await jsonRpc<EvmBlockHead | null>(rpc.url, 'eth_getBlockByNumber', ['latest', false], rpcOpts(rpc, deps))
	const head = hexToBigInt(latest?.number)
	if (head <= EVM_LOOKUP_MAX_DEPTH) return null
	const old = await jsonRpc<EvmBlockHead | null>(rpc.url, 'eth_getBlockByNumber', [`0x${(head - EVM_LOOKUP_MAX_DEPTH).toString(16)}`, false], rpcOpts(rpc, deps))
	// Segundos que ocupan los últimos `EVM_LOOKUP_MAX_DEPTH` bloques
	const span = hexToBigInt(latest?.timestamp) - hexToBigInt(old?.timestamp)
	const wanted = span > 0n ? (EVM_LOOKUP_MARGIN_S * EVM_LOOKUP_MAX_DEPTH + span - 1n) / span : EVM_LOOKUP_MAX_DEPTH
	const depth = wanted > EVM_LOOKUP_MAX_DEPTH ? EVM_LOOKUP_MAX_DEPTH : wanted < EVM_LOOKUP_MIN_DEPTH ? EVM_LOOKUP_MIN_DEPTH : wanted
	return head - depth
}

/**
 * ¿Qué fue de una tx firmada cuya difusión no dio respuesta clara?
 *
 * - **Con recibo:** se ejecutó (`landed`) o entró y revirtió (`dropped`).
 * - **Sin recibo pero el nodo la conoce** (mempool): `landed`, lo mismo que una difusión
 *   aceptada. Si luego no se mina, eso ya es seguimiento, no un segundo envío.
 * - **Sin rastro:** una tx EVM no caduca, así que «no está» no prueba que no vaya a entrar…
 *   salvo que su nonce lo haya gastado OTRA tx. Solo eso da `dropped`, y solo si el nonce
 *   ya estaba gastado hace `EVM_LOOKUP_MARGIN_S` y, vuelta a buscar DESPUÉS de leerlo, la
 *   tx sigue sin aparecer. El orden importa: si el nonce lo gastó ESTA tx, un nodo que ya
 *   lo vio gastado la encuentra al buscarla después.
 *
 * Detrás de un balanceador, el nonce y la búsqueda por hash pueden contestarlos nodos
 * distintos: para que uno rezagado diga «no está» de una tx que sí entró tendría que ir
 * más de ese margen por detrás. Mitigación, no prueba (como `TRON_LOOKUP_MARGIN_MS`). Un
 * nodo que ya podó el estado de esa altura lanza, y quien llama lo trata como `unknown`.
 */
export const lookupEvmTransaction = async (rpc: RegistryRpc, sent: SentEvmTx, deps: Deps = {}): Promise<TxLookup> => {
	const receipt = await readEvmReceipt(rpc, sent.hash, deps)
	if (receipt) return receipt
	if (await knowsEvmTransaction(rpc, sent.hash, deps)) return { status: 'landed', txid: sent.hash }

	const block = await evmLookupBlock(rpc, deps)
	if (block === null) return { status: 'unknown' }
	const spentBy = hexToBigInt(await jsonRpc<string>(rpc.url, 'eth_getTransactionCount', [sent.from, `0x${block.toString(16)}`], rpcOpts(rpc, deps)))
	// El nonce sigue libre (o se gastó hace poco): la tx aún puede entrar, o acaba de hacerlo
	if (spentBy <= BigInt(sent.nonce)) return { status: 'unknown' }

	const again = await readEvmReceipt(rpc, sent.hash, deps)
	if (again) return again
	if (await knowsEvmTransaction(rpc, sent.hash, deps)) return { status: 'landed', txid: sent.hash }
	return { status: 'dropped' }
}
