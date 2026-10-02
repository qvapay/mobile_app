/**
 * Lecturas Stacks vía la API de Hiro (dialecto `hiro`). PURO.
 * `/extended/v1/address/{addr}/balances`: STX en micro-STX y tokens SIP-010
 * por identificador `SP….contrato::asset` (unidades mínimas del token).
 */
import { getJson } from './http'
import type { RegistryRpc } from '../registry/types'

export type HiroBalances = {
	/** `balance` es el TOTAL e incluye lo bloqueado en stacking (`locked`). */
	stx?: { balance?: string, locked?: string, burnchain_unlock_height?: number }
	fungible_tokens?: Record<string, { balance?: string }>
}

const base = (rpc: RegistryRpc) => rpc.url.replace(/\/+$/, '')

export const getStacksBalances = async (rpc: RegistryRpc, address: string, { signal }: { signal?: AbortSignal } = {}): Promise<HiroBalances> =>
	getJson<HiroBalances>(`${base(rpc)}/extended/v1/address/${address}/balances`, { signal, headers: rpc.headers })

/** micro-STX bloqueados por PoX (stacking propio o delegado): no se pueden enviar hasta el desbloqueo. */
export const stxLockedOf = (balances: HiroBalances): bigint => BigInt(balances.stx?.locked ?? '0')

/**
 * Saldo GASTABLE: total − bloqueado. Contar lo bloqueado ofrecería enviar STX
 * que el nodo rechaza. Acotado a 0 por si Hiro devuelve un total desfasado.
 */
export const stxBalanceOf = (balances: HiroBalances): bigint => {
	const spendable = BigInt(balances.stx?.balance ?? '0') - stxLockedOf(balances)
	return spendable > 0n ? spendable : 0n
}

/** Token ausente en la respuesta = 0 (Hiro solo lista los que alguna vez se tocaron). */
export const ftBalanceOf = (balances: HiroBalances, assetIdentifier: string): bigint =>
	BigInt(balances.fungible_tokens?.[assetIdentifier]?.balance ?? '0')

/** Altura de bloque de BITCOIN que ve el nodo (los desbloqueos PoX se miden en ella). */
export const getStacksBurnHeight = async (rpc: RegistryRpc, { signal }: { signal?: AbortSignal } = {}): Promise<number> => {
	const info = await getJson<{ burn_block_height?: number }>(`${base(rpc)}/v2/info`, { signal, headers: rpc.headers })
	if (typeof info.burn_block_height !== 'number') throw new Error('stacks: /v2/info sin burn_block_height')
	return info.burn_block_height
}
