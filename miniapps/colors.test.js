/**
 * @jest-environment node
 */
const { parseHexColor, inkFor, relativeLuminance, INK_COLORS } = require('./colors')

describe('parseHexColor', () => {
	test('normaliza a #rrggbb minúsculas y expande #RGB', () => {
		expect(parseHexColor('#6759EF')).toBe('#6759ef')
		expect(parseHexColor('#fff')).toBe('#ffffff')
		expect(parseHexColor('#0A8')).toBe('#00aa88')
	})

	test('rechaza alfa, funciones CSS, nombres y tipos ajenos', () => {
		for (const bad of ['#ffffff80', '#ffffffff', 'rgb(0,0,0)', 'red', 'transparent', '', '6759EF', '#6759E', '#ggg', 123, null, undefined, {}]) {
			expect(parseHexColor(bad)).toBeNull()
		}
	})
})

describe('inkFor', () => {
	test('fondos oscuros piden tinta clara', () => {
		expect(inkFor('#000000')).toBe('light')
		expect(inkFor('#0e0e1c')).toBe('light')
		expect(inkFor('#6759ef')).toBe('light')
		expect(inkFor('#0a84ff')).toBe('light')
		expect(inkFor('#db253e')).toBe('light')
	})

	test('fondos claros piden tinta oscura', () => {
		expect(inkFor('#ffffff')).toBe('dark')
		expect(inkFor('#ffd700')).toBe('dark')
		expect(inkFor('#7bffb1')).toBe('dark')
		expect(inkFor('#ff9f43')).toBe('dark')
	})

	test('luminancia WCAG en los extremos', () => {
		expect(relativeLuminance('#000000')).toBe(0)
		expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
	})

	test('las tintas reales son colores válidos', () => {
		expect(parseHexColor(INK_COLORS.light)).toBe('#ffffff')
		expect(parseHexColor(INK_COLORS.dark)).toBe('#0e0e1c')
	})
})
