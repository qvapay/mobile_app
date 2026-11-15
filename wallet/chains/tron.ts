/**
 * Lecturas TRON. PURO. El registry declara dos dialectos:
 * - HTTP de java-tron/TronGrid (por defecto): `/wallet/getaccount` y
 *   `/wallet/triggerconstantcontract` con `visible: true` (direcciones base58).
 * - `api: 'jsonrpc'`: la capa eth_* de TRON, que habla direcciones hex de 20
 *   bytes (sin el prefijo 0x41).
 */
import { sha256 } from '@noble/hashes/sha2.js'
import bs58 from 'bs58'

import { encodeBalanceOf, getEvmNativeBalance, getEvmTokenBalance } from './evm'
import { hexToBigInt, postJson } from './http'
import type { RegistryRpc } from '../registry/types'

const toHex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

/** T… (base58check) → 20 bytes hex sin prefijo. Verifica checksum y prefijo 0x41. */
export const tronToHex20 = (address: string): string => {
	const bytes = bs58.decode(address)
	if (bytes.length !== 25 || bytes[0] !== 0x41) throw new Error(`tron: dirección inválida ${address}`)
	const payload = bytes.slice(0, 21)
	const checksum = sha256(sha256(payload)).slice(0, 4)
	if (!checksum.every((b, i) => b === bytes[21 + i])) throw new Error(`tron: checksum inválido ${address}`)
	return toHex(payload.slice(1))
}

/** Los nodos jsonrpc se registran con o sin el sufijo `/jsonrpc`: normalizar. */
export const tronJsonRpcUrl = (url: string): string => (url.replace(/\/+$/, '').endsWith('/jsonrpc') ? url.replace(/\/+$/, '') : `${url.replace(/\/+$/, '')}/jsonrpc`)

type Options = { signal?: AbortSignal }

export const getTronNativeBalance = async (rpc: RegistryRpc, address: string, { signal }: Options = {}): Promise<bigint> => {
	if (rpc.api === 'jsonrpc') {
		return getEvmNativeBalance(tronJsonRpcUrl(rpc.url), `0x${tronToHex20(address)}`, { signal, headers: rpc.headers })
	}
	// Cuenta nunca activada = `{}` sin `balance`: saldo 0, no error
	const account = await postJson<{ balance?: number | string }>(`${rpc.url.replace(/\/+$/, '')}/wallet/getaccount`, { address, visible: true }, { signal, headers: rpc.headers })
	return BigInt(account?.balance ?? 0)
}

/** Lo que java-tron contesta a una llamada simulada, en lo que dice si falló. */
export type TronCallResult = {
	result?: { result?: boolean, message?: string } | null
	transaction?: { ret?: Array<{ ret?: string } | null> | null } | null
}

/** Los mensajes del nodo llegan en texto o en hex (ASCII), según el nodo y el camino. */
const readNodeMessage = (value: unknown): string => {
	if (typeof value !== 'string') return ''
	if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return value.trim()
	let out = ''
	for (let i = 0; i < value.length; i += 2) out += String.fromCharCode(parseInt(value.slice(i, i + 2), 16))
	return out.replace(/[^\x20-\x7e]/g, '').trim()
}

/**
 * ¿Falló la llamada que el nodo simuló (`triggerconstantcontract`)?
 *
 * java-tron contesta `result.result: true` AUNQUE el contrato revierta: eso solo dice que
 * la petición se atendió. El fallo va en `result.message` y en `transaction.ret[0].ret`.
 * Medido el 2026-11-14 en TronGrid, publicnode y tron.qvapay.com con un `transfer` de USDT
 * desde una dirección sin saldo: `result: true`, `message: "REVERT opcode executed"`,
 * `energy_used: 8624`, `constant_result: [""]` y `ret: [{ ret: "FAILED" }]`; con saldo, ni
 * `message` ni `ret`. Mirar solo `result === false` dejaba firmar y difundir un envío que
 * iba a revertir: se quemaba la comisión y la pantalla decía «Enviado».
 *
 * @returns El motivo que da el nodo, o null si la llamada no falló.
 */
export const tronCallFailure = (res: TronCallResult | null | undefined): string | null => {
	const message = readNodeMessage(res?.result?.message)
	if (res?.result?.result === false) return message || 'el nodo rechazó la llamada'
	const ret = res?.transaction?.ret?.[0]?.ret
	// El éxito es el valor por defecto del enum (`SUCESS`, sic) y no viaja en el JSON
	if (typeof ret === 'string' && ret !== '' && !/^SUCC?ESS$/.test(ret)) return message || ret
	return message || null
}

export const getTronTokenBalance = async (rpc: RegistryRpc, token: string, owner: string, { signal }: Options = {}): Promise<bigint> => {
	if (rpc.api === 'jsonrpc') {
		return getEvmTokenBalance(tronJsonRpcUrl(rpc.url), `0x${tronToHex20(token)}`, `0x${tronToHex20(owner)}`, { signal, headers: rpc.headers })
	}
	const response = await postJson<TronCallResult & { constant_result?: string[] }>(
		`${rpc.url.replace(/\/+$/, '')}/wallet/triggerconstantcontract`,
		{
			owner_address: owner,
			contract_address: token,
			function_selector: 'balanceOf(address)',
			// El nodo añade el selector: aquí va solo el argumento codificado
			parameter: encodeBalanceOf(tronToHex20(owner)).slice(10),
			visible: true,
		},
		{ signal, headers: rpc.headers },
	)
	// Un `balanceOf` que revierte no es un saldo de 0: se lanza y la lectura anterior se conserva
	const failure = tronCallFailure(response)
	if (failure) throw new Error(`tron: balanceOf falló (${failure})`)
	return hexToBigInt(response?.constant_result?.[0])
}

// ---------------------------------------------------------------------------
// Estado de Stake 2.0 de una cuenta (`/wallet/getaccount`, HTTP de java-tron)
// ---------------------------------------------------------------------------

export type TronResourceCode = 'BANDWIDTH' | 'ENERGY' | 'TRON_POWER'

export type TronAccountState = {
	/** TRX gastable (sun). */
	balance: bigint
	/** Congelado PROPIO por recurso (sun): lo que se puede descongelar. */
	frozen: Record<TronResourceCode, bigint>
	/** Congelado y DELEGADO a otras cuentas (sun): sigue siendo del usuario y sigue votando. */
	delegatedOut: Record<'BANDWIDTH' | 'ENERGY', bigint>
	/** Descongelados en sus 14 días (o ya retirables). */
	unfrozen: Array<{ resource: TronResourceCode, amount: bigint, expireAt: number }>
	votes: Array<{ address: string, count: bigint }>
	/** Último cobro de recompensas (ms); el siguiente, 24 h después. null = nunca. */
	latestWithdrawTime: number | null
}

type RawTronAccount = {
	balance?: number | string
	frozenV2?: Array<{ type?: string, amount?: number | string }>
	unfrozenV2?: Array<{ type?: string, unfreeze_amount?: number | string, unfreeze_expire_time?: number | string }>
	votes?: Array<{ vote_address: string, vote_count: number | string }>
	latest_withdraw_time?: number | string
	delegated_frozenV2_balance_for_bandwidth?: number | string
	account_resource?: { delegated_frozenV2_balance_for_energy?: number | string }
}

/** El nodo omite `type` para BANDWIDTH (valor por defecto del enum en protobuf). */
const resourceOf = (type: string | undefined): TronResourceCode =>
	type === 'ENERGY' ? 'ENERGY' : type === 'TRON_POWER' ? 'TRON_POWER' : 'BANDWIDTH'

/** PURO. Una cuenta nunca activada llega como `{}`: todo a cero. */
export const parseTronAccount = (raw: RawTronAccount | null | undefined): TronAccountState => {
	const frozen: Record<TronResourceCode, bigint> = { BANDWIDTH: 0n, ENERGY: 0n, TRON_POWER: 0n }
	for (const entry of raw?.frozenV2 ?? []) frozen[resourceOf(entry.type)] += BigInt(entry.amount ?? 0)
	return {
		balance: BigInt(raw?.balance ?? 0),
		frozen,
		delegatedOut: {
			BANDWIDTH: BigInt(raw?.delegated_frozenV2_balance_for_bandwidth ?? 0),
			ENERGY: BigInt(raw?.account_resource?.delegated_frozenV2_balance_for_energy ?? 0),
		},
		unfrozen: (raw?.unfrozenV2 ?? []).map(u => ({ resource: resourceOf(u.type), amount: BigInt(u.unfreeze_amount ?? 0), expireAt: Number(u.unfreeze_expire_time ?? 0) })),
		votes: (raw?.votes ?? []).map(v => ({ address: v.vote_address, count: BigInt(v.vote_count) })),
		latestWithdrawTime: raw?.latest_withdraw_time ? Number(raw.latest_withdraw_time) : null,
	}
}

/** TRON Power en sun: todo lo congelado, propio o delegado a otros (1 TRX = 1 voto). */
export const tronPowerSun = (state: TronAccountState): bigint =>
	state.frozen.BANDWIDTH + state.frozen.ENERGY + state.frozen.TRON_POWER + state.delegatedOut.BANDWIDTH + state.delegatedOut.ENERGY

/** Votos en uso (en TRX). */
export const tronVotesUsed = (state: TronAccountState): bigint => state.votes.reduce((sum, v) => sum + v.count, 0n)

/** Todo lo que NO es gastable: congelado (propio + delegado) y descongelándose. */
export const tronCommittedSun = (state: TronAccountState): bigint =>
	tronPowerSun(state) + state.unfrozen.reduce((sum, u) => sum + u.amount, 0n)

export const getTronAccountState = async (rpc: RegistryRpc, address: string, { signal }: Options = {}): Promise<TronAccountState> =>
	parseTronAccount(await postJson<RawTronAccount>(`${rpc.url.replace(/\/+$/, '')}/wallet/getaccount`, { address, visible: true }, { signal, headers: rpc.headers }))
