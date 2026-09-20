/**
 * Lecturas Stacks vía la API de Hiro (dialecto `hiro`). PURO.
 * `/extended/v1/address/{addr}/balances`: STX en micro-STX y tokens SIP-010
 * por identificador `SP….contrato::asset` (unidades mínimas del token).
 */
import { getJson } from './http'
import type { RegistryRpc } from '../registry/types'

export type HiroBalances = {
	stx?: { balance?: string }
	fungible_tokens?: Record<string, { balance?: string }>
}

const base = (rpc: RegistryRpc) => rpc.url.replace(/\/+$/, '')

export const getStacksBalances = async (rpc: RegistryRpc, address: string, { signal }: { signal?: AbortSignal } = {}): Promise<HiroBalances> =>
	getJson<HiroBalances>(`${base(rpc)}/extended/v1/address/${address}/balances`, { signal, headers: rpc.headers })

export const stxBalanceOf = (balances: HiroBalances): bigint => BigInt(balances.stx?.balance ?? '0')

/** Token ausente en la respuesta = 0 (Hiro solo lista los que alguna vez se tocaron). */
export const ftBalanceOf = (balances: HiroBalances, assetIdentifier: string): bigint =>
	BigInt(balances.fungible_tokens?.[assetIdentifier]?.balance ?? '0')
