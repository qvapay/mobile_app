/**
 * Agrupación del histórico por día calendario, al estilo Mercury: un separador
 * minúsculo con la fecha sobre cada bloque de transacciones del mismo día, y
 * cada bloque renderizado como su propia tarjeta.
 *
 * Módulo puro (sin imports de React Native) para poder testearlo en el entorno
 * node de jest — el mismo patrón de `screens/keypad/keypadAmount.js`. El i18n
 * respeta esa regla: `i18n/index.js` tampoco importa nada nativo.
 */
import i18n, { getDateLocale } from '../../i18n'
import type { Transaction } from '../../types/domain'

/** Ítem aplanado que consume la FlashList del histórico: separador de día o transacción. */
export type TransactionListItem =
	| { type: 'header', key: string, label: string }
	| { type: 'tx', transaction: Transaction, groupIndex: number, groupSize: number }

const DAY_MS = 24 * 60 * 60 * 1000

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/**
 * Etiqueta humana del día en el idioma activo: "Hoy"/"Today", "Ayer"/"Yesterday",
 * "16 de agosto"/"August 16" y, si el año no es el corriente, con año.
 *
 * @param dateInput - Fecha de la transacción.
 * @param now - Inyectable en tests; por defecto, ahora.
 * @returns Etiqueta del separador.
 */
export const dayLabel = (dateInput: string | number | Date, now: Date = new Date()): string => {

	const date = new Date(dateInput)
	// isNaN coerce el Date vía valueOf (mismo runtime); el cast solo calla al type checker
	if (isNaN(date as unknown as number)) return i18n.t('common.dates.earlier')

	// La resta Date - Date coerce vía valueOf (mismo runtime); los casts solo callan al type checker
	const daysAgo = Math.round(((startOfDay(now) as unknown as number) - (startOfDay(date) as unknown as number)) / DAY_MS)
	if (daysAgo === 0) return i18n.t('common.dates.today')
	if (daysAgo === 1) return i18n.t('common.dates.yesterday')

	return date.toLocaleDateString(getDateLocale(), {
		day: 'numeric',
		month: 'long',
		...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
	})
}

/**
 * Aplana la lista de transacciones (ya ordenada de más reciente a más vieja)
 * en los ítems que consume la FlashList: un separador por cada cambio de día
 * seguido de sus transacciones, cada una con su posición DENTRO del grupo.
 *
 * Ese `groupIndex`/`groupSize` relativo es lo que convierte cada día en su
 * propia tarjeta: `QPTransaction` redondea solo las esquinas exteriores del
 * grupo que le digan, así que basta con contarle el grupo del día en vez de
 * la lista entera.
 *
 * @param transactions - Transacciones con `updated_at`.
 * @param now - Inyectable en tests; por defecto, ahora.
 * @returns Ítems aplanados (separadores + transacciones posicionadas).
 */
export const groupTransactionsByDay = (transactions: Transaction[], now: Date = new Date()): TransactionListItem[] => {

	// Primera pasada: partir en grupos por día calendario (consecutivos: la
	// lista viene ordenada por fecha, así que un día nunca reaparece)
	const groups: { key: string, label: string, transactions: Transaction[] }[] = []
	let currentKey: string | null = null
	for (const transaction of transactions) {
		const date = new Date(transaction.updated_at)
		const key = isNaN(date as unknown as number) ? 'sin-fecha' : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
		if (key !== currentKey) {
			currentKey = key
			groups.push({ key, label: dayLabel(transaction.updated_at, now), transactions: [] })
		}
		groups[groups.length - 1].transactions.push(transaction)
	}

	// Segunda pasada: aplanar con posiciones relativas al grupo
	const items: TransactionListItem[] = []
	for (const group of groups) {
		items.push({ type: 'header', key: `day-${group.key}`, label: group.label })
		group.transactions.forEach((transaction, i) => {
			items.push({ type: 'tx', transaction, groupIndex: i, groupSize: group.transactions.length })
		})
	}
	return items
}
