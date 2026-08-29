/**
 * Tests del encogido por longitud de los héroes numéricos. Sustituye al
 * `adjustsFontSizeToFit` nativo, que la rama animada de QPBalance no puede
 * usar (un elemento por dígito). Contrato: los importes normales se pintan al
 * tamaño pleno, los separadores no penalizan, y solo los números largos de
 * verdad encogen — con un piso.
 * @jest-environment node
 */
import { heroFontSize } from './heroFontSize'

describe('heroFontSize', () => {
	test('los importes normales NO encogen: se ven como hasta ahora', () => {
		expect(heroFontSize('5,00', 60)).toBe(60)
		expect(heroFontSize('1.234,56', 60)).toBe(60)
		expect(heroFontSize('99.999,99', 60)).toBe(60) // 7 dígitos, el límite
	})

	test('encoge un paso por dígito pasado del umbral', () => {
		expect(heroFontSize('999.999,99', 60)).toBe(56)   // 8 dígitos
		expect(heroFontSize('9.999.999,99', 60)).toBe(52) // 9 dígitos
	})

	test('los separadores de miles y el decimal no penalizan', () => {
		// mismos dígitos escritos en los tres locales de la app = mismo tamaño
		expect(heroFontSize('9,999,999.99', 60)).toBe(heroFontSize('9.999.999,99', 60))
		expect(heroFontSize('999999999', 60)).toBe(heroFontSize('999.999.999', 60))
	})

	test('nunca baja del piso (60% del máximo por defecto)', () => {
		expect(heroFontSize('9'.repeat(50), 60)).toBe(36)
	})

	test('piso, paso y franja gratis son configurables', () => {
		expect(heroFontSize('12345', 80, { freeDigits: 1, step: 4, min: 40 })).toBe(64)
		expect(heroFontSize('12345', 80, { freeDigits: 1, step: 4, min: 70 })).toBe(70)
	})

	test('vacío, nulo o el guion de "sin precio" devuelven el tamaño pleno', () => {
		expect(heroFontSize('', 60)).toBe(60)
		expect(heroFontSize(null, 60)).toBe(60)
		expect(heroFontSize(undefined, 60)).toBe(60)
		expect(heroFontSize('—', 60)).toBe(60)
	})
})
