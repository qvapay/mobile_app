/**
 * Medidas de la barra inferior emulada: módulo puro.
 * @jest-environment node
 */
import {
	BAR_HEIGHT,
	BAR_HEIGHT_LABELS,
	BAR_MAX_WIDTH,
	BAR_MIN_BOTTOM,
	BAR_SIDE_MARGIN,
	barBottomOffset,
	barHeight,
	barWidth,
	glassMaterial,
	pillFrame,
	tabBarClearance,
} from './glassTabBarMetrics'

describe('barBottomOffset', () => {
	test('sin inset (iPhone con botón) usa el mínimo', () => {
		expect(barBottomOffset(0)).toBe(BAR_MIN_BOTTOM)
		expect(barBottomOffset(undefined)).toBe(BAR_MIN_BOTTOM)
		expect(barBottomOffset(-5)).toBe(BAR_MIN_BOTTOM)
	})

	test('con indicador de gestos se mete en el área segura sin bajar del mínimo', () => {
		expect(barBottomOffset(34)).toBe(26)
		expect(barBottomOffset(24)).toBe(16)
		expect(barBottomOffset(16)).toBe(BAR_MIN_BOTTOM)
	})

	test('con botones de navegación va entera por encima', () => {
		expect(barBottomOffset(48)).toBeGreaterThan(48)
	})
})

describe('tabBarClearance', () => {
	test('es lo que sobresale la cápsula por encima del área segura', () => {
		// iPhone con Face ID: 26 + 56 − 34
		expect(tabBarClearance(34, false)).toBe(48)
		// Sin inset: 12 + 56
		expect(tabBarClearance(0, false)).toBe(BAR_MIN_BOTTOM + BAR_HEIGHT)
	})

	test('las etiquetas suman su alto', () => {
		expect(tabBarClearance(34, true) - tabBarClearance(34, false)).toBe(BAR_HEIGHT_LABELS - BAR_HEIGHT)
		expect(barHeight(true)).toBe(BAR_HEIGHT_LABELS)
		expect(barHeight(false)).toBe(BAR_HEIGHT)
	})

	test('inset + hueco deja SIEMPRE libre el borde superior de la cápsula', () => {
		for (const inset of [0, 16, 24, 34, 48]) {
			for (const labels of [false, true]) {
				expect(inset + tabBarClearance(inset, labels)).toBe(barBottomOffset(inset) + barHeight(labels))
			}
		}
	})
})

describe('pillFrame', () => {
	test('reparte el ancho entre las pestañas', () => {
		expect(pillFrame(0, 5, 300)).toEqual({ x: 0, width: 60 })
		expect(pillFrame(2, 5, 300)).toEqual({ x: 120, width: 60 })
		expect(pillFrame(4, 5, 300)).toEqual({ x: 240, width: 60 })
	})

	test('acota el índice y aguanta medidas vacías', () => {
		expect(pillFrame(9, 5, 300).x).toBe(240)
		expect(pillFrame(-1, 5, 300).x).toBe(0)
		expect(pillFrame(0, 0, 300)).toEqual({ x: 0, width: 0 })
		expect(pillFrame(1, 5, 0)).toEqual({ x: 0, width: 0 })
	})
})

describe('barWidth', () => {
	test('deja el margen lateral y no pasa del máximo', () => {
		expect(barWidth(390)).toBe(390 - BAR_SIDE_MARGIN * 2)
		expect(barWidth(1024)).toBe(BAR_MAX_WIDTH)
		expect(barWidth(0)).toBe(0)
	})
})

describe('glassMaterial', () => {
	test('sin desenfoque el tinte va casi opaco', () => {
		for (const isDark of [true, false]) {
			expect(glassMaterial(isDark, false).tintAlpha).toBeGreaterThan(0.9)
			expect(glassMaterial(isDark, true).tintAlpha).toBeLessThan(glassMaterial(isDark, false).tintAlpha)
		}
	})
})
