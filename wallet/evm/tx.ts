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
import type { RegistryChain, RegistryRpc } from '../registry/types'

const TRANSFER_SELECTOR = '0xa9059cbb'

/** Gas fijo de una transferencia de nativo a una cuenta externa. */
export const NATIVE_TRANSFER_GAS = 21_000n

/** Margen sobre `eth_estimateGas` en tokens: los saldos que cruzan de 0 y los tokens con hooks (USDT) cuestan más al ejecutar que al estimar. */
const TOKEN_GAS_MARGIN_PERCENT = 25n

/** Tope duro del gas de una transferencia ERC-20: por encima, algo raro pasa con el contrato. */
const MAX_TOKEN_GAS = 300_000n

/** Prioridad mínima (1 gwei): algunos nodos devuelven 0 en `eth_maxPriorityFeePerGas` y la tx se queda sin minar. */
const MIN_PRIORITY_FEE_WEI = 1_000_000_000n

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
			if (suggested > priority) priority = suggested
		} catch { /* nodo sin el método: 1 gwei de prioridad */ }
		return { eip1559: true, baseFee: hexToBigInt(block.baseFeePerGas), priorityFee: priority }
	}
	return { eip1559: false, gasPrice: hexToBigInt(await jsonRpc<string>(rpc.url, 'eth_gasPrice', [], rpcOpts(rpc, deps))) }
}

/**
 * Construye la tx sin firmar con nonce, gas y fee reales del nodo. Lanza
 * `ChainHttpError` no reintentable con el mensaje del nodo si la estimación
 * revierte (saldo de token insuficiente, contrato pausado…).
 */
export const prepareEvmSend = async (rpc: RegistryRpc, chain: RegistryChain, intent: EvmSendIntent, deps: Deps = {}): Promise<PreparedEvmSend> => {
	if (!isValidEvmAddress(intent.to)) throw new ChainHttpError('evm: destino inválido', { retryable: false })
	if (intent.amount <= 0n) throw new ChainHttpError('evm: cantidad inválida', { retryable: false })
	if (chain.chainId !== intent.chainId) throw new ChainHttpError('evm: chainId no coincide con la red', { retryable: false })

	const to = (intent.contract ?? intent.to) as `0x${string}`
	const value = intent.contract ? 0n : intent.amount
	const data = intent.contract ? encodeErc20Transfer(intent.to, intent.amount) : ('0x' as `0x${string}`)

	const [nonceHex, feeData, gasHex] = await Promise.all([
		// `pending`: si hay una tx nuestra en el mempool, la siguiente no debe pisar su nonce
		jsonRpc<string>(rpc.url, 'eth_getTransactionCount', [intent.from, 'pending'], rpcOpts(rpc, deps)),
		getEvmFeeData(rpc, deps),
		intent.contract
			? jsonRpc<string>(rpc.url, 'eth_estimateGas', [{ from: intent.from, to, data, value: '0x0' }], rpcOpts(rpc, deps))
			: Promise.resolve(`0x${NATIVE_TRANSFER_GAS.toString(16)}`),
	])

	let gasLimit = hexToBigInt(gasHex)
	if (intent.contract) {
		gasLimit = gasLimit * (100n + TOKEN_GAS_MARGIN_PERCENT) / 100n
		if (gasLimit > MAX_TOKEN_GAS) throw new ChainHttpError(`evm: gas estimado anómalo (${gasLimit})`, { retryable: false })
	}

	const base = { chainId: intent.chainId, nonce: Number(hexToBigInt(nonceHex)), to, value, data, gas: gasLimit }
	if (feeData.eip1559) {
		const maxFeePerGas = feeData.baseFee * 2n + feeData.priorityFee
		const tx: TransactionSerializable = { ...base, type: 'eip1559', maxFeePerGas, maxPriorityFeePerGas: feeData.priorityFee }
		return { intent, tx, fee: { gasLimit, estimatedWei: gasLimit * (feeData.baseFee + feeData.priorityFee), maxWei: gasLimit * maxFeePerGas, eip1559: true } }
	}
	const tx: TransactionSerializable = { ...base, type: 'legacy', gasPrice: feeData.gasPrice }
	return { intent, tx, fee: { gasLimit, estimatedWei: gasLimit * feeData.gasPrice, maxWei: gasLimit * feeData.gasPrice, eip1559: false } }
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

export const verifySignedEvmTransaction = async (raw: `0x${string}`, { intent, tx }: PreparedEvmSend): Promise<void> => {
	const parsed = parseTransaction(raw)
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
