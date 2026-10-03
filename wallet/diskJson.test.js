/**
 * @jest-environment node
 */
import { encodeDiskJson, decodeDiskJson } from './diskJson'

describe('diskJson', () => {
	test('ida y vuelta conserva los bigint exactos, también anidados', () => {
		const value = { amount: 123456789012345678901234567890n, positions: [{ rewards: 5n, note: 'x' }], apy: 0.05, none: null }
		expect(decodeDiskJson(encodeDiskJson(value))).toEqual(value)
	})

	test('un objeto normal con más claves no se confunde con la etiqueta', () => {
		const value = { $bigint: '1', other: true }
		expect(decodeDiskJson(encodeDiskJson(value))).toEqual(value)
	})
})
