/**
 * Resúmenes de posiciones de staking para pintar. PURO.
 *
 * Todo en unidades mínimas (bigint): los importes de staking se suman con el
 * saldo gastable para el total del activo, y un redondeo en coma flotante ahí
 * descuadraría el héroe contra la cadena.
 */
import type { StakePosition, StakeStatus } from './types'

export type StakingSummary = {
	/** Rindiendo (o bloqueado rindiendo, en Stacks). */
	active: bigint
	/** Delegado, aún sin rendir. */
	activating: bigint
	/** Saliendo: no rinde y aún no se puede retirar. */
	cooling: bigint
	/** Listo para volver al saldo gastable con una tx de retiro. */
	withdrawable: bigint
	/** Todo lo que NO es gastable ahora mismo: suma de las cuatro anteriores. */
	committed: bigint
	/** Recompensas pendientes de cobrar (TRON). */
	rewardsPending: bigint
	/** Próximo cambio de estado conocido (ms epoch), o null. */
	nextUnlockAt: number | null
	count: number
}

const EMPTY: StakingSummary = { active: 0n, activating: 0n, cooling: 0n, withdrawable: 0n, committed: 0n, rewardsPending: 0n, nextUnlockAt: null, count: 0 }

const BUCKET: Record<StakeStatus, 'active' | 'activating' | 'cooling' | 'withdrawable'> = {
	active: 'active',
	locked: 'active',
	activating: 'activating',
	cooling: 'cooling',
	withdrawable: 'withdrawable',
}

export const summarizePositions = (positions: StakePosition[] | null | undefined): StakingSummary => {
	if (!positions?.length) return EMPTY
	const summary = { ...EMPTY }
	for (const position of positions) {
		summary[BUCKET[position.status]] += position.amount
		summary.committed += position.amount
		summary.rewardsPending += position.rewards ?? 0n
		summary.count += 1
		// Lo que ya se puede retirar no tiene un "cuándo": no cuenta como próximo cambio
		if (position.status !== 'withdrawable' && typeof position.unlockAt === 'number') {
			summary.nextUnlockAt = summary.nextUnlockAt === null ? position.unlockAt : Math.min(summary.nextUnlockAt, position.unlockAt)
		}
	}
	return summary
}

/** Tiempo restante hasta `at` en la unidad más legible. null = pasado o desconocido. */
export type TimeLeft = { unit: 'days' | 'hours' | 'minutes', value: number }

export const timeLeft = (at: number | null | undefined, now: number): TimeLeft | null => {
	if (typeof at !== 'number' || !Number.isFinite(at) || at <= now) return null
	const minutes = Math.ceil((at - now) / 60_000)
	if (minutes < 60) return { unit: 'minutes', value: minutes }
	const hours = Math.ceil(minutes / 60)
	if (hours < 48) return { unit: 'hours', value: hours }
	return { unit: 'days', value: Math.ceil(hours / 24) }
}

/** Posiciones en el orden en que el usuario las busca: lo accionable primero. */
const STATUS_ORDER: Record<StakeStatus, number> = { withdrawable: 0, active: 1, locked: 1, activating: 2, cooling: 3 }

export const sortPositions = (positions: StakePosition[]): StakePosition[] =>
	positions.slice().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
