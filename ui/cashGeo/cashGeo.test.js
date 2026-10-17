/**
 * @jest-environment node
 *
 * Las ciudades de la tarjeta USD CASH: una por provincia con entrega, y cada geografía
 * generada cabe en el lienzo y trae lo que la tarjeta necesita (calles y seis rutas).
 */
import { CASH_CITIES, pickCashCity } from './index'

const W = 360
const H = 200
const onCanvas = ([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H

describe('ciudades de la tarjeta USD CASH', () => {
	test('una cabecera por provincia del tarifario (sin repetir)', () => {
		expect(new Set(CASH_CITIES.map(city => city.key)).size).toBe(CASH_CITIES.length)
		expect(new Set(CASH_CITIES.map(city => city.province)).size).toBe(CASH_CITIES.length)
		// Cienfuegos no tiene zonas de entrega: no se promete
		expect(CASH_CITIES.map(city => city.province)).not.toContain('CFG')
		expect(CASH_CITIES[0].key).toBe('havana')
	})

	test.each(CASH_CITIES.map(city => [city.name, city]))('%s: calles, puntos y seis rutas dentro del lienzo', (_name, city) => {
		expect(city.roadsMajor.startsWith('M')).toBe(true)
		expect(city.roadsMinor.startsWith('M')).toBe(true)
		expect(city.routes).toHaveLength(6)
		for (const route of city.routes) {
			expect(route.length).toBeGreaterThanOrEqual(2)
			expect(route.every(onCanvas)).toBe(true)
		}
		expect(city.landmarks.length).toBeGreaterThan(0)
		expect(city.landmarks.every(({ point }) => onCanvas(point))).toBe(true)
		// Con costa, la tierra va con ella; sin costa, la ciudad es de interior
		expect(!!city.land).toBe(!!city.coast)
	})

	test('pickCashCity cubre de la primera a la última sin salirse', () => {
		expect(pickCashCity(() => 0)).toBe(CASH_CITIES[0])
		expect(pickCashCity(() => 0.9999)).toBe(CASH_CITIES[CASH_CITIES.length - 1])
		expect(pickCashCity(() => 1)).toBe(CASH_CITIES[CASH_CITIES.length - 1])
	})
})
