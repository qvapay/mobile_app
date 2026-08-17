/**
 * Tests de la agrupación por día del histórico (separadores estilo Mercury).
 * Módulo puro: `now` se inyecta para que los "Hoy"/"Ayer" sean deterministas.
 * @jest-environment node
 */
import { dayLabel, groupTransactionsByDay } from './transactionsGrouping'

// Un domingo por la mañana; las fechas de los tests giran alrededor de él
const NOW = new Date(2026, 7, 16, 10, 30)

const tx = (uuid, date) => ({ uuid, updated_at: date.toISOString() })

describe('dayLabel', () => {
	test('el mismo día calendario es "Hoy", aunque sea de madrugada', () => {
		expect(dayLabel(new Date(2026, 7, 16, 0, 5), NOW)).toBe('Hoy')
		expect(dayLabel(new Date(2026, 7, 16, 23, 59), NOW)).toBe('Hoy')
	})

	test('el día anterior es "Ayer", incluso a última hora', () => {
		expect(dayLabel(new Date(2026, 7, 15, 23, 59), NOW)).toBe('Ayer')
	})

	test('dentro del año va sin año; en otro año, con él', () => {
		expect(dayLabel(new Date(2026, 7, 5), NOW)).toBe('5 de agosto')
		expect(dayLabel(new Date(2025, 11, 24), NOW)).toBe('24 de diciembre de 2025')
	})

	test('una fecha rota cae en "Anteriores" en vez de reventar', () => {
		expect(dayLabel('no-es-fecha', NOW)).toBe('Anteriores')
	})
})

describe('groupTransactionsByDay', () => {
	test('inserta un separador por día y posiciona cada transacción DENTRO de su grupo', () => {
		const items = groupTransactionsByDay([
			tx('a', new Date(2026, 7, 16, 9, 0)),
			tx('b', new Date(2026, 7, 16, 8, 0)),
			tx('c', new Date(2026, 7, 15, 20, 0)),
		], NOW)

		expect(items.map(i => i.type)).toEqual(['header', 'tx', 'tx', 'header', 'tx'])
		expect(items[0].label).toBe('Hoy')
		expect(items[3].label).toBe('Ayer')

		// Las posiciones son relativas al grupo del día, no a la lista entera:
		// eso es lo que redondea cada bloque como su propia tarjeta
		expect(items[1]).toMatchObject({ groupIndex: 0, groupSize: 2 })
		expect(items[2]).toMatchObject({ groupIndex: 1, groupSize: 2 })
		expect(items[4]).toMatchObject({ groupIndex: 0, groupSize: 1 })
	})

	test('las claves de separador son estables y únicas por día', () => {
		const items = groupTransactionsByDay([
			tx('a', new Date(2026, 7, 16)),
			tx('b', new Date(2026, 7, 15)),
		], NOW)
		const keys = items.filter(i => i.type === 'header').map(i => i.key)
		expect(new Set(keys).size).toBe(2)
		expect(keys.every(k => k.startsWith('day-'))).toBe(true)
	})

	test('una lista vacía no produce separadores', () => {
		expect(groupTransactionsByDay([], NOW)).toEqual([])
	})

	test('cruzar de página no duplica el separador si el día continúa', () => {
		// La página 2 empieza con el mismo día con el que terminó la página 1:
		// al agrupar la lista ya aplanada, ese día sigue siendo UN solo grupo
		const items = groupTransactionsByDay([
			tx('a', new Date(2026, 7, 14, 22, 0)),
			tx('b', new Date(2026, 7, 14, 3, 0)),
		], NOW)
		expect(items.filter(i => i.type === 'header')).toHaveLength(1)
		expect(items[0].label).toBe('14 de agosto')
	})
})
