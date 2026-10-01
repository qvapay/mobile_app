/**
 * Qué sabe hacer la app en cada cadena. PURO.
 *
 * Es el interruptor por fases de la hoja de ruta: una cadena solo aparece en
 * la UI de producción cuando tiene AL MENOS una acción firmable. Leer
 * posiciones sin poder actuar sobre ellas (Stacks hoy: lee el STX bloqueado
 * por otra wallet) se muestra en la ficha del activo, pero no abre "Ganar".
 *
 * Al terminar cada fase se añaden aquí sus acciones y nada más:
 * - Fase 1 (Solana): ['stake', 'unstake', 'withdraw'] — HECHA 2026-09-30
 * - Fase 2 (TRON): ['stake', 'vote', 'claim', 'unstake', 'withdraw'] — HECHA 2026-09-30
 * - Fase 3 (Stacks): APARCADA (2026-09-30). PoX migró a `pox-5` (stake vía signer-manager,
 *   bonos sBTC, claim-rewards); `delegate-stx` y los pools de pox-4 ya no existen. Stacks
 *   queda en solo lectura: el STX bloqueado (`locked` de Hiro) se sigue viendo.
 */
import type { StakeAction, StakingKind } from './types'
import { isStakingKind } from './types'
import type { ChainKind } from '../registry/types'

export type StakingCapability = {
	/** Hay lector de posiciones on-chain. */
	read: boolean
	/** Acciones que la app sabe construir, verificar y firmar. */
	actions: StakeAction[]
}

export const STAKING_CAPABILITIES: Record<StakingKind, StakingCapability> = {
	solana: { read: true, actions: ['stake', 'unstake', 'withdraw'] },
	tron: { read: true, actions: ['stake', 'vote', 'claim', 'unstake', 'withdraw'] },
	stacks: { read: true, actions: [] },
}

export const stakingCapability = (kind: ChainKind): StakingCapability | null =>
	isStakingKind(kind) ? STAKING_CAPABILITIES[kind] : null

export const canStakeAction = (kind: ChainKind, action: StakeAction): boolean =>
	stakingCapability(kind)?.actions.includes(action) ?? false

/**
 * La entrada "Ganar" se pinta si la cadena tiene alguna acción firmable. En
 * desarrollo (`dev`) se pinta en cuanto la cadena es de staking, para poder
 * recorrer las pantallas mientras se construyen las fases.
 */
export const isStakingEntryVisible = (asset: { kind: ChainKind, contract: string | null }, { dev = false }: { dev?: boolean } = {}): boolean => {
	if (asset.contract !== null) return false
	const capability = stakingCapability(asset.kind)
	if (!capability) return false
	return dev || capability.actions.length > 0
}

/** El hub "Ganar" (y su entrada en Home/Ajustes) existe si alguna cadena tiene acciones, o en desarrollo. */
export const isStakingHubEnabled = ({ dev = false }: { dev?: boolean } = {}): boolean =>
	dev || Object.values(STAKING_CAPABILITIES).some(capability => capability.actions.length > 0)

/** Acción de ENTRADA de cada cadena: Stacks no "stakea", delega en un pool. */
export const entryActionFor = (kind: StakingKind): StakeAction => (kind === 'stacks' ? 'delegate' : 'stake')

/** Acción de SALIDA de cada cadena. */
export const exitActionFor = (kind: StakingKind): StakeAction => (kind === 'stacks' ? 'revoke' : 'unstake')

/** Acciones que eligen destino (validador, SR o pool). */
export const actionNeedsTarget = (action: StakeAction): boolean => action === 'stake' || action === 'delegate' || action === 'vote'

/**
 * Acciones con importe. Revocar, cobrar y cambiar de SR no llevan; retirar
 * tampoco (se retira la posición entera, que es lo que permite la red). Salir
 * lleva importe en TRON (se descongela una parte), pero no en Solana: se
 * desactiva la stake account ENTERA (partirla exigiría `Split`).
 */
export const actionNeedsAmount = (action: StakeAction, kind?: StakingKind): boolean =>
	action === 'stake' || action === 'delegate' || (action === 'unstake' && kind !== 'solana')

/** `__DEV__` sin romper en node (tests): RN lo define, jest-node no. */
export const isDevBuild = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__ === true
