/**
 * Dominio de staking de la wallet self-custody (SOL nativo, TRX Stake 2.0 +
 * votos, STX stacking PoX). Módulo PURO: tipos compartidos por lectores de
 * posiciones, constructores de tx y pantallas.
 *
 * Non-custodial siempre: una posición es estado ON-CHAIN de la dirección del
 * usuario (stake account, TRX congelado, STX bloqueado); QvaPay no custodia
 * nada, solo lee y construye transacciones que firma el usuario.
 */
import type { ChainKind, RegistryRpc } from '../registry/types'

/** Familias con staking. EVM y BTC no ofrecen staking nativo desde una wallet. */
export type StakingKind = Extract<ChainKind, 'solana' | 'tron' | 'stacks'>

export const STAKING_KINDS: readonly StakingKind[] = ['solana', 'tron', 'stacks']

export const isStakingKind = (kind: ChainKind): kind is StakingKind =>
	(STAKING_KINDS as readonly ChainKind[]).includes(kind)

/**
 * Acciones posibles. No todas existen en todas las cadenas:
 * - Solana: stake (crear + delegar), unstake (deactivate), withdraw.
 * - TRON: stake (freeze + vote), vote (cambiar de SR), claim (cobrar votos),
 *   unstake (unfreeze, 14 días), withdraw (tras los 14 días).
 * - Stacks: delegate (delegate-stx a un pool), revoke (revoke-delegate-stx).
 */
export type StakeAction = 'stake' | 'unstake' | 'withdraw' | 'claim' | 'vote' | 'delegate' | 'revoke'

/**
 * Estado de una posición, común a las tres cadenas:
 * - activating: delegado, aún no rinde (Solana hasta la siguiente epoch; Stacks hasta el ciclo).
 * - active: rindiendo.
 * - cooling: saliendo (Solana deactivating; TRON unfreeze en sus 14 días).
 * - withdrawable: salida terminada, falta retirar al saldo gastable.
 * - locked: bloqueado sin más detalle (STX bloqueado por PoX leído solo del saldo).
 */
export type StakeStatus = 'activating' | 'active' | 'cooling' | 'withdrawable' | 'locked'

/** A quién va el stake: validador, SR o pool. `name` null = no está en el registry. */
export type StakeTargetRef = {
	id: string
	name: string | null
	/** Comisión del destino en [0, 1], si se conoce. */
	commission?: number | null
}

export type StakePosition = {
	chainKey: string
	kind: StakingKind
	/** Identificador estable dentro de la cadena (stake account, `frozen:ENERGY`, `unfreeze:<ts>`, `pox`). */
	id: string
	status: StakeStatus
	/** Unidades mínimas del nativo. */
	amount: bigint
	/** Recompensas pendientes de cobrar (TRON) o acumuladas en la posición (Solana), si se conocen. */
	rewards?: bigint | null
	/** Cuándo termina el estado actual (ms epoch): activación, enfriamiento o desbloqueo. null = desconocido. */
	unlockAt?: number | null
	target?: StakeTargetRef | null
}

/** Foto de staking de UNA cadena para una dirección. */
export type StakingSnapshot = {
	chainKey: string
	kind: StakingKind
	positions: StakePosition[]
	/** Recompensas cobradas históricamente, si la cadena permite leerlas. */
	rewardsLifetime?: bigint | null
	/** APY estimado de referencia de la cadena (fracción: 0.065 = 6,5 %), si se pudo calcular. */
	apy?: number | null
	/** Recompensas pendientes de cobrar a mano (TRON), en unidades mínimas. */
	claimable?: bigint | null
	/** Desde cuándo se puede cobrar (TRON: 24 h tras el último cobro). null = ya. */
	claimableAt?: number | null
	/** Poder de voto sin usar (TRON, en sun): congelado que no está rindiendo recompensas de voto. */
	unvotedPower?: bigint | null
	updatedAt: number
}

// ---------------------------------------------------------------------------
// Contrato de los adaptadores de tx por cadena (wallet/<cadena>/stake.ts).
// Vive aquí, en el módulo puro, para que los adaptadores no importen nada de UI.
// ---------------------------------------------------------------------------

export type StakeIntent = {
	chainKey: string
	kind: StakingKind
	action: StakeAction
	/** Dirección del usuario: es quien firma y quien conserva la autoridad sobre el stake. */
	from: string
	/** Solo Stacks: clave pública comprimida (la tx sin firmar la lleva). */
	fromPublicKey?: string
	/** Unidades mínimas del nativo; null en acciones sin importe (claim, revoke). */
	amount: bigint | null
	/** Validador / SR / pool; null en acciones que no lo necesitan (withdraw, claim). */
	target: StakeTargetRef | null
	/** Posición concreta sobre la que se actúa (stake account de Solana, lote de unfreeze de TRON). */
	positionId?: string | null
}

/** Lo que la confirmación pinta. Sale de la tx CONSTRUIDA y verificada, no del formulario. */
export type StakeSummary = {
	action: StakeAction
	amount: bigint | null
	/** Comisión de red esperada, en unidades mínimas del nativo (todas las tx del paso). */
	feeEstimated: bigint
	/** Vigencia de la tx construida (ms epoch); null = sin expiración. */
	expiresAt: number | null
	target: StakeTargetRef | null
	/** Cuántas tx firma el usuario en este paso (TRON: congelar + votar = 2). */
	txCount: number
	/** Depósito que queda en la posición y se recupera al salir (renta de la stake account de Solana). */
	reserve?: bigint | null
	/** Espera antes de que el paso surta efecto (activación, enfriamiento), si se conoce. */
	waitMs?: number | null
	/** Avisos que la confirmación debe enseñar antes de firmar. */
	notices?: StakeNotice[]
}

/**
 * - replacesVotes: votar a este SR sustituye los votos que ya tenías a otros (TRON).
 * - votesAdjust: al descongelar, la red reajusta tus votos al TRON Power que te quede (TRON).
 */
export type StakeNotice = 'replacesVotes' | 'votesAdjust'

/**
 * Adaptador de una cadena. Sintaxis de MÉTODO a propósito: así un adaptador
 * con tipos concretos (`sign(inner: PreparedSolanaStake …)`) encaja en el
 * mapa genérico sin casts.
 */
export type StakeTxAdapter<Inner = unknown, Signed = unknown> = {
	/** Filtro de nodos (TRON: solo los que construyen tx, no JSON-RPC). */
	accept?(rpc: RegistryRpc): boolean
	prepare(rpc: RegistryRpc, intent: StakeIntent, options: { signal?: AbortSignal }): Promise<{ inner: Inner, summary: StakeSummary }>
	sign(inner: Inner, privateKey: Uint8Array): Signed | Promise<Signed>
	broadcast(rpc: RegistryRpc, inner: Inner, signed: Signed, options: { signal?: AbortSignal }): Promise<StakeBroadcastResult>
	/**
	 * Lo que MÁX debe dejar sin tocar al ENTRAR en staking: comisión y depósitos
	 * que la propia tx exige (renta de la stake account de Solana). Ausente = 0.
	 */
	entryReserve?(rpc: RegistryRpc, options: { signal?: AbortSignal }): Promise<bigint>
	/**
	 * Mínimo que la RED acepta para entrar (Solana: `getStakeMinimumDelegation`, hoy 1 SOL;
	 * TRON: 1 TRX). El formulario lo enseña y no deja continuar por debajo.
	 */
	entryMinimum?(rpc: RegistryRpc, options: { signal?: AbortSignal }): Promise<bigint>
}

/**
 * `note: 'votePending'`: en un paso de dos tx (TRON congelar + votar) la primera entró
 * pero el voto no: el dinero está congelado y sin votar. La UI lo cuenta y ofrece votar.
 */
export type StakeBroadcastResult = { txid: string, duplicate: boolean, note?: 'votePending' }
