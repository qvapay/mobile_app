/**
 * Lecturas Bitcoin vía Esplora (mempool.space/blockstream o el propio). PURO.
 */
import { getJson } from './http'
import type { RegistryRpc } from '../registry/types'

type EsploraStats = { funded_txo_sum?: number, spent_txo_sum?: number }
export type EsploraAddress = { chain_stats?: EsploraStats, mempool_stats?: EsploraStats }

const net = (stats?: EsploraStats): bigint => BigInt(stats?.funded_txo_sum ?? 0) - BigInt(stats?.spent_txo_sum ?? 0)

/**
 * Saldo en sats = confirmado + mempool. Incluir el mempool es lo que hacen
 * Trust/SafePal: un depósito recién difundido se ve al instante (el detalle lo
 * marca como pendiente). Nunca negativo en la UI.
 */
export const esploraBalance = (data: EsploraAddress): bigint => {
	const total = net(data.chain_stats) + net(data.mempool_stats)
	return total < 0n ? 0n : total
}

export const getBtcBalance = async (rpc: RegistryRpc, address: string, { signal }: { signal?: AbortSignal } = {}): Promise<bigint> =>
	esploraBalance(await getJson<EsploraAddress>(`${rpc.url.replace(/\/+$/, '')}/address/${address}`, { signal, headers: rpc.headers }))
