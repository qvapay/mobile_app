/**
 * Orquestación de staking en la wallet self-custody (capa React → capa pura).
 * Mismo contrato que `walletSendActions`: construir → VERIFICAR → firmar →
 * difundir, y la seed solo se toca en `withWalletKey`, el instante de firmar.
 *
 * Cada cadena aporta un adaptador PURO (en `wallet/<cadena>/stake.ts`) que
 * construye la tx contra un nodo, la verifica re-parseándola, la firma y la
 * difunde. Una cadena sin adaptador lanza `StakeUnsupportedError`: la UI no
 * debería llegar aquí, porque `wallet/staking/capabilities` oculta la entrada.
 */
import { getAppRpcRouter } from '../../../wallet/registry/appRpcRouter'
import type { RegistryChain } from '../../../wallet/registry/types'
import type { StakeAction, StakeIntent, StakeSummary, StakeTxAdapter, StakingKind } from '../../../wallet/staking/types'
import { isStakingKind } from '../../../wallet/staking/types'
import { solanaStakeAdapter } from '../../../wallet/solana/stake'
import { tronStakeAdapter } from '../../../wallet/tron/stake'
import { withWalletKey } from './walletSendActions'
import type { StakeBroadcastResult } from '../../../wallet/staking/types'

export type { StakeIntent, StakeSummary, StakeTxAdapter } from '../../../wallet/staking/types'

/**
 * Adaptadores por familia. Cada fase de la hoja de ruta añade el suyo aquí
 * y sus acciones en `STAKING_CAPABILITIES`:
 * - Fase 1: `solana: solanaStakeAdapter` (wallet/solana/stake.ts) — HECHA
 * - Fase 2: `tron: tronStakeAdapter` (wallet/tron/stake.ts) — HECHA
 * - Fase 3 (Stacks): aparcada — PoX migró a pox-5 (ver wallet/staking/capabilities.ts)
 */
const STAKE_TX_ADAPTERS: Partial<Record<StakingKind, StakeTxAdapter>> = {
	solana: solanaStakeAdapter,
	tron: tronStakeAdapter,
}

export class StakeUnsupportedError extends Error {
	constructor(kind: string, action: StakeAction) {
		super(`wallet: staking (${action}) en ${kind} aún no está disponible`)
		this.name = 'StakeUnsupportedError'
	}
}

export type PreparedStake = { kind: StakingKind, chain: RegistryChain, intent: StakeIntent, summary: StakeSummary, inner: unknown }

/** Firma retenida solo para re-difundir la MISMA tx tras un fallo de red. */
export type SignedStake = { kind: StakingKind, signed: unknown }

const adapterFor = (kind: string, action: StakeAction): StakeTxAdapter => {
	const adapter = isStakingKind(kind as RegistryChain['kind']) ? STAKE_TX_ADAPTERS[kind as StakingKind] : undefined
	if (!adapter) throw new StakeUnsupportedError(kind, action)
	return adapter
}

export const prepareStake = async (chain: RegistryChain, intent: StakeIntent): Promise<PreparedStake> => {
	if (chain.kind !== intent.kind) throw new Error('wallet: la intención de staking no corresponde a la cadena')
	const adapter = adapterFor(intent.kind, intent.action)
	const accept = adapter.accept?.bind(adapter)
	const { inner, summary } = await getAppRpcRouter().call(
		intent.chainKey,
		(rpc, signal) => adapter.prepare(rpc, intent, { signal }),
		accept ? { accept } : undefined,
	)
	return { kind: intent.kind, chain, intent, summary, inner }
}

export const signStake = (prepared: PreparedStake): Promise<SignedStake> => {
	const adapter = adapterFor(prepared.kind, prepared.intent.action)
	return withWalletKey(prepared.kind, async privateKey => ({ kind: prepared.kind, signed: await adapter.sign(prepared.inner, privateKey) }))
}

export const broadcastStake = (prepared: PreparedStake, signed: SignedStake): Promise<StakeBroadcastResult> => {
	if (signed.kind !== prepared.kind) throw new Error('wallet: firma y transacción de cadenas distintas')
	const adapter = adapterFor(prepared.kind, prepared.intent.action)
	const accept = adapter.accept?.bind(adapter)
	return getAppRpcRouter().call(
		prepared.intent.chainKey,
		(rpc, signal) => adapter.broadcast(rpc, prepared.inner, signed.signed, { signal }),
		accept ? { accept } : undefined,
	)
}

/**
 * Lo que MÁX debe dejar al entrar en staking (renta de la nueva posición, mínimo de la
 * wallet, comisión). 0 si la cadena no declara reserva o no tiene adaptador.
 */
export const estimateStakeReserve = async (chain: RegistryChain, chainKey: string): Promise<bigint> => {
	const adapter = isStakingKind(chain.kind) ? STAKE_TX_ADAPTERS[chain.kind] : undefined
	if (!adapter?.entryReserve) return 0n
	const entryReserve = adapter.entryReserve.bind(adapter)
	return getAppRpcRouter().call(chainKey, (rpc, signal) => entryReserve(rpc, { signal }), { idempotent: true })
}

/** Mínimo de la red para entrar en staking (0 si la cadena no lo declara). */
export const estimateStakeMinimum = async (chain: RegistryChain, chainKey: string): Promise<bigint> => {
	const adapter = isStakingKind(chain.kind) ? STAKE_TX_ADAPTERS[chain.kind] : undefined
	if (!adapter?.entryMinimum) return 0n
	const entryMinimum = adapter.entryMinimum.bind(adapter)
	return getAppRpcRouter().call(chainKey, (rpc, signal) => entryMinimum(rpc, { signal }), { idempotent: true })
}
