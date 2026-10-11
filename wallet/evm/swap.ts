/**
 * Swap en cadenas EVM vía LI.FI. Módulo PURO (fetch vía `jsonRpc` + viem), tests en node.
 *
 * El backend (qpweb) pide a LI.FI la transacción con las direcciones del propio usuario y
 * nos la pasa. La calldata del router es OPACA (cada puente y DEX codifica distinto) y no se
 * decodifica entera; en su lugar se exigen cuatro cosas que juntas acotan qué puede hacer:
 *
 * 1. El destino es el router de LI.FI de ESA cadena, de una lista blanca que vive en el
 *    CÓDIGO (no en el registry remoto: cambiarla exige publicar versión, que es la idea).
 * 2. El valor es 0 si se paga con un token, o exactamente el importe si se paga con nativo.
 * 3. La dirección que cobra (EVM, o la de Solana si cruza) aparece en la calldata. Sin ella
 *    el router no tiene a quién pagar salvo a otro.
 * 4. `eth_estimateGas` desde la propia dirección no revierte: es la simulación. Una ruta
 *    que fuera a fallar no se firma (y no se quema gas).
 *
 * El permiso (approve) es SIEMPRE por el importe exacto, nunca infinito, y al router de la
 * lista. USDT de Ethereum exige poner el permiso a 0 antes de cambiarlo: es un paso más.
 *
 * Varias transacciones (permiso → swap) van una detrás de otra y cada una se prepara al
 * llegar su turno, leyendo el permiso actual de la cadena (`nextEvmSwapStep`): nada de
 * firmar el swap antes de que el permiso exista, porque su simulación fallaría.
 */
import { base58 } from '@scure/base'
import { keccak256, parseTransaction, recoverTransactionAddress } from 'viem'
import { signTransaction } from 'viem/accounts'
import type { TransactionSerializable, TransactionSerialized } from 'viem'

import { ChainHttpError, hexToBigInt, jsonRpc } from '../chains/http'
import type { RegistryRpc } from '../registry/types'
import { EvmVerifyError, getEvmFeeData, isValidEvmAddress } from './tx'
import type { EvmFeeEstimate, SignedEvmTx } from './tx'

/** Diamond de LI.FI: el mismo en Ethereum, BNB Chain, Polygon y Base (verificado 10 oct 2026). */
export const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'

/** Router y spender permitidos por chainId. Fuera de esta tabla, ningún swap EVM se firma. */
export const EVM_SWAP_ROUTERS: Record<number, { router: string, spender: string }> = {
	1: { router: LIFI_DIAMOND, spender: LIFI_DIAMOND },
	56: { router: LIFI_DIAMOND, spender: LIFI_DIAMOND },
	137: { router: LIFI_DIAMOND, spender: LIFI_DIAMOND },
	8453: { router: LIFI_DIAMOND, spender: LIFI_DIAMOND },
}

/** USDT de Ethereum: `approve` revierte si se cambia un permiso distinto de 0 sin ponerlo antes a 0. */
const TOKENS_NEEDING_RESET = new Set(['0xdac17f958d2ee523a2206206994597c13d831ec7'])

const APPROVE_SELECTOR = '0x095ea7b3'
const ALLOWANCE_SELECTOR = '0xdd62ed3e'
/** Margen sobre la estimación: los pools cambian entre estimar y minar. */
const GAS_MARGIN_PERCENT = 30n
const APPROVE_GAS_MARGIN_PERCENT = 25n
/** Topes duros: por encima, la ruta o el token hacen algo raro. Un puente con hooks ronda 600-900k. */
export const MAX_SWAP_GAS = 2_500_000n
const MAX_APPROVE_GAS = 120_000n

/** Lo que manda qpweb para LI.FI. */
export type EvmRouteBuild = {
	chainId: number
	tx: { to: string, data: string, value: string, gasLimit: string | null }
	approval: { token: string, spender: string, amount: string } | null
}

export type EvmSwapIntent = {
	chainId: number
	/** La wallet que paga y firma. */
	owner: string
	/** Quien cobra: la misma wallet EVM o la del usuario en Solana si la ruta cruza. */
	receiver: string
	/** null = nativo. */
	token: string | null
	/** Unidades mínimas que se pagan. */
	amountIn: bigint
}

export type EvmSwapStep = 'reset' | 'approve' | 'swap'

export type PreparedEvmSwapStep = {
	step: EvmSwapStep
	/** Pasos que quedan DESPUÉS de este (para "Paso 1 de 2"). */
	remaining: number
	intent: EvmSwapIntent
	tx: TransactionSerializable
	fee: EvmFeeEstimate
	/** Lo que la tx debe llevar al re-parsearla tras firmar. */
	expected: { to: string, value: bigint, data: `0x${string}` }
	expiresAt: null
}

type Deps = { signal?: AbortSignal }

const rpcOpts = (rpc: RegistryRpc, deps: Deps) => ({ signal: deps.signal, headers: rpc.headers })
const word = (hex: string) => hex.toLowerCase().replace(/^0x/, '').padStart(64, '0')
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/** `approve(spender, amount)`. */
export const encodeApprove = (spender: string, amount: bigint): `0x${string}` => `${APPROVE_SELECTOR}${word(spender)}${amount.toString(16).padStart(64, '0')}` as `0x${string}`

/**
 * Cómo aparece quien cobra en la calldata: una dirección EVM como palabra de 32 bytes; una
 * de Solana como sus 32 bytes crudos (así la codifican los puentes de LI.FI). Exportado
 * para tests.
 */
export const receiverWord = (receiver: string): string => {
	if (isValidEvmAddress(receiver)) return word(receiver)
	const bytes = base58.decode(receiver)
	if (bytes.length !== 32) throw new EvmVerifyError('receptor con formato desconocido')
	return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Las comprobaciones 1-3 de la cabecera sobre lo que mandó el backend. Exportado para tests.
 * Devuelve la llamada al router ya normalizada.
 */
export const verifyRouteBuild = (build: EvmRouteBuild, intent: EvmSwapIntent): { to: string, data: `0x${string}`, value: bigint } => {
	const allowed = EVM_SWAP_ROUTERS[intent.chainId]
	if (!allowed) throw new EvmVerifyError('cadena sin router de swap permitido')
	if (build.chainId !== intent.chainId) throw new EvmVerifyError('la ruta es de otra cadena')
	if (!same(build.tx.to, allowed.router)) throw new EvmVerifyError('router no permitido')
	const data = String(build.tx.data || '').toLowerCase()
	if (!/^0x[0-9a-f]{8,}$/.test(data) || data.length % 2 !== 0) throw new EvmVerifyError('calldata inválida')
	const value = hexToBigInt(build.tx.value)
	if (value !== (intent.token ? 0n : intent.amountIn)) throw new EvmVerifyError('valor distinto del importe')
	// Busca la palabra del receptor ALINEADA tras el selector: un acierto a mitad de palabra no cuenta
	const target = receiverWord(intent.receiver)
	const body = data.slice(10)
	let found = false
	for (let i = 0; i + 64 <= body.length; i += 64) { if (body.slice(i, i + 64) === target) { found = true; break } }
	if (!found) throw new EvmVerifyError('la ruta no paga a tu wallet')

	if (intent.token) {
		const approval = build.approval
		if (!approval) throw new EvmVerifyError('falta el permiso del token')
		if (!same(approval.token, intent.token)) throw new EvmVerifyError('permiso de otro token')
		if (!same(approval.spender, allowed.spender)) throw new EvmVerifyError('permiso a un contrato no permitido')
		if (BigInt(approval.amount) !== intent.amountIn) throw new EvmVerifyError('permiso por otro importe')
	} else if (build.approval) {
		throw new EvmVerifyError('permiso en un pago con nativo')
	}
	return { to: allowed.router, data: data as `0x${string}`, value }
}

/** Permiso actual de `owner` a `spender` sobre `token`. */
export const readAllowance = async (rpc: RegistryRpc, token: string, owner: string, spender: string, deps: Deps = {}): Promise<bigint> =>
	hexToBigInt(await jsonRpc<string>(rpc.url, 'eth_call', [{ to: token, data: `${ALLOWANCE_SELECTOR}${word(owner)}${word(spender)}` }, 'latest'], rpcOpts(rpc, deps)))

/** Qué toca firmar ahora, según el permiso que hay en la cadena. Exportado para tests. */
export const nextEvmSwapStep = ({ token, amountIn, allowance }: { token: string | null, amountIn: bigint, allowance: bigint }): { step: EvmSwapStep, remaining: number } => {
	if (!token || allowance >= amountIn) return { step: 'swap', remaining: 0 }
	if (allowance > 0n && TOKENS_NEEDING_RESET.has(token.toLowerCase())) return { step: 'reset', remaining: 2 }
	return { step: 'approve', remaining: 1 }
}

/**
 * Prepara el SIGUIENTE paso del swap con nonce, gas y fee reales. El del swap se estima
 * desde la propia wallet: si la ruta revierte, lanza aquí y no se firma nada.
 */
export const prepareEvmSwapStep = async (rpc: RegistryRpc, build: EvmRouteBuild, intent: EvmSwapIntent, deps: Deps = {}): Promise<PreparedEvmSwapStep> => {
	const route = verifyRouteBuild(build, intent)
	const spender = EVM_SWAP_ROUTERS[intent.chainId].spender
	const allowance = intent.token ? await readAllowance(rpc, intent.token, intent.owner, spender, deps) : 0n
	const { step, remaining } = nextEvmSwapStep({ token: intent.token, amountIn: intent.amountIn, allowance })

	const call = step === 'swap'
		? route
		: { to: intent.token!, data: encodeApprove(spender, step === 'reset' ? 0n : intent.amountIn), value: 0n }

	const [nonceHex, feeData, gasHex] = await Promise.all([
		jsonRpc<string>(rpc.url, 'eth_getTransactionCount', [intent.owner, 'pending'], rpcOpts(rpc, deps)),
		getEvmFeeData(rpc, deps),
		// La simulación: desde la propia wallet, con el valor real
		jsonRpc<string>(rpc.url, 'eth_estimateGas', [{ from: intent.owner, to: call.to, data: call.data, value: `0x${call.value.toString(16)}` }], rpcOpts(rpc, deps)),
	])

	const margin = step === 'swap' ? GAS_MARGIN_PERCENT : APPROVE_GAS_MARGIN_PERCENT
	const gasLimit = hexToBigInt(gasHex) * (100n + margin) / 100n
	if (gasLimit > (step === 'swap' ? MAX_SWAP_GAS : MAX_APPROVE_GAS)) throw new ChainHttpError(`evm: gas estimado anómalo (${gasLimit})`, { retryable: false })

	const base = { chainId: intent.chainId, nonce: Number(hexToBigInt(nonceHex)), to: call.to as `0x${string}`, value: call.value, data: call.data, gas: gasLimit }
	let tx: TransactionSerializable
	let fee: EvmFeeEstimate
	if (feeData.eip1559) {
		const maxFeePerGas = feeData.baseFee * 2n + feeData.priorityFee
		tx = { ...base, type: 'eip1559', maxFeePerGas, maxPriorityFeePerGas: feeData.priorityFee }
		fee = { gasLimit, estimatedWei: gasLimit * (feeData.baseFee + feeData.priorityFee), maxWei: gasLimit * maxFeePerGas, eip1559: true }
	} else {
		tx = { ...base, type: 'legacy', gasPrice: feeData.gasPrice }
		fee = { gasLimit, estimatedWei: gasLimit * feeData.gasPrice, maxWei: gasLimit * feeData.gasPrice, eip1559: false }
	}
	return { step, remaining, intent, tx, fee, expected: { to: call.to, value: call.value, data: call.data }, expiresAt: null }
}

/** Firma y VERIFICA re-parseando: destino, valor, calldata, cadena, gas y firmante. */
export const signEvmSwapStep = async (prepared: PreparedEvmSwapStep, privateKey: Uint8Array): Promise<SignedEvmTx> => {
	const hex = `0x${Array.from(privateKey, b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
	const raw = await signTransaction({ privateKey: hex, transaction: prepared.tx })
	const parsed = parseTransaction(raw)
	const { expected, intent } = prepared
	if (parsed.chainId !== intent.chainId) throw new EvmVerifyError('chainId distinto')
	if (!same(parsed.to, expected.to)) throw new EvmVerifyError('destino distinto')
	if ((parsed.value ?? 0n) !== expected.value) throw new EvmVerifyError('valor distinto')
	if ((parsed.data ?? '0x').toLowerCase() !== expected.data.toLowerCase()) throw new EvmVerifyError('calldata distinta')
	if ((parsed.gas ?? 0n) !== prepared.tx.gas) throw new EvmVerifyError('gas distinto')
	if (parsed.type === 'legacy' ? !parsed.gasPrice : !parsed.maxFeePerGas) throw new EvmVerifyError('tx sin precio de gas')
	const signer = await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized })
	if (!same(signer, intent.owner)) throw new EvmVerifyError('firmante distinto')
	return { raw, hash: keccak256(raw) }
}

/**
 * ¿Ya se minó? → true (éxito) · false (revirtió) · null (aún no). Para esperar al permiso
 * antes de preparar el swap.
 */
export const evmReceiptStatus = async (rpc: RegistryRpc, hash: string, deps: Deps = {}): Promise<boolean | null> => {
	const receipt = await jsonRpc<{ status?: string } | null>(rpc.url, 'eth_getTransactionReceipt', [hash], rpcOpts(rpc, deps))
	if (!receipt) return null
	return receipt.status === '0x1'
}
