/**
 * Movimientos de staking en la actividad de un activo. PURO.
 *
 * El historial (proxy de qpweb) solo ve transferencias: meter 1 SOL en staking aparece como
 * un "Enviado" de 1 SOL a una dirección cualquiera. Pero esa dirección es una stake account
 * DEL PROPIO usuario (derivada de su dirección con `qp-stake-<n>`, o leída como posición),
 * así que la app puede reconocerlo y contarlo como lo que es.
 */
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import type { WalletTx } from '../../types/domain'

/**
 * - stake: el SOL entra en una stake account propia (crear + delegar).
 * - withdraw: vuelve de una stake account propia a la wallet (retirar al saldo).
 * - unstake: tx de solo comisión sobre una stake account propia (desactivar: no mueve SOL).
 * - vote / claim: TRON (votar a un SR, cobrar recompensas); llegan ya marcados del servidor.
 */
export type StakeActivity = 'stake' | 'withdraw' | 'unstake' | 'vote' | 'claim'

/** Tipos que el historial YA trae marcados (TRON: el servidor decodifica el contrato). */
const MARKED: ReadonlySet<string> = new Set(['stake', 'withdraw', 'unstake', 'vote', 'claim'])

/** Movimientos que no sacan dinero del usuario: se pintan sin signo. */
export const isNeutralStakeActivity = (activity: StakeActivity | null): boolean =>
	activity === 'stake' || activity === 'unstake' || activity === 'vote'

export const stakeActivityOf = (tx: Pick<WalletTx, 'kind' | 'direction' | 'from' | 'to'>, stakeAccounts: ReadonlySet<string>): StakeActivity | null => {
	if (tx.kind && MARKED.has(tx.kind)) return tx.kind as StakeActivity
	// Solana: el historial solo ve transferencias; se reconocen por la stake account propia
	if (stakeAccounts.size === 0) return null
	if (tx.kind === 'fee') return tx.to && stakeAccounts.has(tx.to) ? 'unstake' : null
	if (tx.direction === 'out' && tx.to && stakeAccounts.has(tx.to)) return 'stake'
	if (tx.direction === 'in' && tx.from && stakeAccounts.has(tx.from)) return 'withdraw'
	return null
}

/** Icono de cada movimiento de staking en la actividad y en su detalle. */
export const STAKE_ACTIVITY_ICON: Record<StakeActivity, FontAwesome6SolidIconName> = {
	stake: 'seedling',
	withdraw: 'arrow-down',
	unstake: 'hourglass-half',
	vote: 'check-to-slot',
	claim: 'gift',
}
