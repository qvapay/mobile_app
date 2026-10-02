import type { SavingsSummary } from '../../types/domain'

// El backend ha servido los totales en camelCase y en snake_case según la versión
const toFixedMoney = (camel: unknown, snake: unknown) => Number(camel || snake || 0).toFixed(2)

/**
 * Totales históricos del ahorro, ya formateados a 2 decimales.
 *
 * @param savings - Resumen del ahorro (o null mientras carga).
 * @returns `{ rate, totalDeposited, totalWithdrawn, totalEarned, hasHistory }`.
 */
export const getSavingsTotals = (savings: SavingsSummary | null) => {
	const totalDeposited = toFixedMoney(savings?.totalDeposited, savings?.total_deposited)
	const totalWithdrawn = toFixedMoney(savings?.totalWithdrawn, savings?.total_withdrawn)
	const totalEarned = toFixedMoney(savings?.totalEarned, savings?.total_earned)
	return {
		rate: savings?.currentRate || 0,
		totalDeposited,
		totalWithdrawn,
		totalEarned,
		hasHistory: Number(totalDeposited) > 0 || Number(totalWithdrawn) > 0 || Number(totalEarned) > 0,
	}
}
