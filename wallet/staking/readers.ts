/**
 * Lectores de posiciones de staking por cadena. PURO: router inyectado.
 *
 * Una llamada del router por cadena (todas las lecturas contra el MISMO
 * nodo), igual que los saldos: mezclar alturas de nodos distintos haría que
 * una posición recién activada apareciera y desapareciera.
 */
import type { RpcRouter } from '../registry/rpcRouter'
import type { RpcRegistry } from '../registry/types'
import { getStacksBalances, getStacksBurnHeight, stxLockedOf } from '../chains/stacks'
import { getEpochInfo, getSlotMs, readSolanaLastRewards, readSolanaStakeAccounts, readSolanaTargetApys, solanaPositionsFrom } from '../solana/stake'
import type { TargetSamples } from '../solana/stake'
import { solanaApyFromRewards } from './apy'
import { CLAIM_INTERVAL_MS, getTronAccount, getTronReward, getTronStakeParams, readTronBrokerages, readTronWitnesses, TRON_BROKERAGE_RPC, tronPositionsFrom, tronTargetApys } from '../tron/stake'
import { TRON_TX_RPC } from '../tron/tx'
import { tronPowerSun, tronVotesUsed } from '../chains/tron'
import { stakingCapability } from './capabilities'
import type { StakePosition, StakingKind, StakingSnapshot } from './types'
import { isStakingKind } from './types'

type RouterLike = Pick<RpcRouter, 'call'>

/** Un bloque de Bitcoin cada ~10 minutos: con esto se estima cuándo llega una altura. */
export const BTC_BLOCK_MS = 10 * 60_000

/**
 * STX bloqueado por PoX. La API de saldos ya lo trae (`locked` +
 * `burnchain_unlock_height`), así que sin más llamadas se ve también el
 * stacking hecho desde otra wallet con la misma seed.
 */
export const stacksPositionsFrom = (
	balances: { stx?: { locked?: string, burnchain_unlock_height?: number } },
	burnHeight: number | null,
	now: number,
): StakePosition[] => {
	const locked = stxLockedOf(balances)
	if (locked <= 0n) return []
	const unlockHeight = balances.stx?.burnchain_unlock_height
	const unlockAt = typeof unlockHeight === 'number' && unlockHeight > 0 && burnHeight !== null
		? now + Math.max(0, unlockHeight - burnHeight) * BTC_BLOCK_MS
		: null
	return [{ chainKey: 'stacks', kind: 'stacks', id: 'pox', status: 'locked', amount: locked, unlockAt, target: null }]
}

/**
 * Foto de staking de una cadena. null = la app aún no sabe leer esa cadena
 * (fase pendiente): la UI lo trata como "sin posiciones", no como error.
 */
export const fetchStakingSnapshot = async (
	router: RouterLike,
	registry: RpcRegistry,
	chainKey: string,
	address: string,
	now: () => number = Date.now,
	/** Destino (vote account, SR, pool) → nombre del registry, para pintar a quién se delega. */
	names: Record<string, string> = {},
): Promise<StakingSnapshot | null> => {
	const chain = registry.chains[chainKey]
	if (!chain || !isStakingKind(chain.kind) || !stakingCapability(chain.kind)?.read) return null
	const kind: StakingKind = chain.kind

	if (kind === 'stacks') {
		return router.call(chainKey, async (rpc, signal) => {
			const balances = await getStacksBalances(rpc, address, { signal })
			// Sin altura no hay cuenta atrás, pero la posición se ve igual
			const burnHeight = stxLockedOf(balances) > 0n
				? await getStacksBurnHeight(rpc, { signal }).catch(() => null)
				: null
			const at = now()
			return { chainKey, kind, positions: stacksPositionsFrom(balances, burnHeight, at).map(p => ({ ...p, chainKey })), updatedAt: at }
		}, { idempotent: true })
	}
	if (kind === 'solana') {
		return router.call(chainKey, async (rpc, signal) => {
			const [accounts, info, slotMs] = await Promise.all([readSolanaStakeAccounts(rpc, address, { signal }), getEpochInfo(rpc, { signal }), getSlotMs(rpc, { signal })])
			// El rendimiento es un extra: si el nodo no da recompensas, la foto sale igual sin APY
			const rewards = await readSolanaLastRewards(rpc, accounts, info, { signal }).catch(() => [])
			const at = now()
			return {
				chainKey,
				kind,
				positions: solanaPositionsFrom(accounts, info, at, names, slotMs).map(p => ({ ...p, chainKey })),
				apy: solanaApyFromRewards(rewards, info.slotsInEpoch * slotMs),
				updatedAt: at,
			}
		}, { idempotent: true })
	}
	if (kind === 'tron') {
		return router.call(chainKey, async (rpc, signal) => {
			const [state, reward] = await Promise.all([
				getTronAccount(rpc, address, signal),
				// Las recompensas son un extra: sin ellas la foto sale igual
				getTronReward(rpc, address, signal).catch(() => null),
			])
			const at = now()
			const nextClaim = state.latestWithdrawTime !== null ? state.latestWithdrawTime + CLAIM_INTERVAL_MS : null
			const unvoted = tronPowerSun(state) - tronVotesUsed(state) * 1_000_000n
			return {
				chainKey,
				kind,
				positions: tronPositionsFrom(state, at, names).map(p => ({ ...p, chainKey })),
				claimable: reward,
				claimableAt: nextClaim !== null && nextClaim > at ? nextClaim : null,
				unvotedPower: unvoted > 0n ? unvoted : 0n,
				updatedAt: at,
			}
		}, { accept: TRON_TX_RPC, idempotent: true })
	}
	return null
}

/**
 * APY estimado de cada destino del selector (validador, SR, pool). {} = la red aún no
 * sabe estimarlo: el selector se pinta igual, sin cifra.
 */
export const fetchTargetApys = async (router: RouterLike, registry: RpcRegistry, chainKey: string, targets: TargetSamples[]): Promise<Record<string, number | null>> => {
	const chain = registry.chains[chainKey]
	if (!chain || targets.length === 0) return {}
	const targetIds = targets.map(t => t.id)
	if (chain.kind === 'solana') {
		return router.call(chainKey, (rpc, signal) => readSolanaTargetApys(rpc, targets, { signal }), { idempotent: true })
	}
	if (chain.kind === 'tron') {
		const [witnesses, params] = await router.call(chainKey, (rpc, signal) => Promise.all([readTronWitnesses(rpc, signal), getTronStakeParams(rpc, signal)]), { accept: TRON_TX_RPC, idempotent: true })
		if (params.payPerBlockSun === null) return {}
		// La comisión NO se lee de TronGrid (devuelve 0 siempre): sin otro nodo, no hay cifra
		const brokerages = await router.call(chainKey, (rpc, signal) => readTronBrokerages(rpc, targetIds, signal), { accept: TRON_BROKERAGE_RPC, idempotent: true })
			.catch(() => ({} as Record<string, number | null>))
		return tronTargetApys(witnesses, params.payPerBlockSun, brokerages, targetIds, params.witnessPayPerBlockSun)
	}
	return {}
}
