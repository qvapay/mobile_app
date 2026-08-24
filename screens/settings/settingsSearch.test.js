/**
 * Unit tests for the Settings menu search filter — node environment
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import settings from './settings'
import { normalizeQuery, filterSettings } from './settingsSearch'

describe('normalizeQuery', () => {
	test('lowercases and strips accents', () => {
		expect(normalizeQuery('Verificación')).toBe('verificacion')
		expect(normalizeQuery('TELÉFONO')).toBe('telefono')
		expect(normalizeQuery('Tamaño')).toBe('tamano')
	})

	test('tolerates empty and nullish input', () => {
		expect(normalizeQuery('')).toBe('')
		expect(normalizeQuery(null)).toBe('')
		expect(normalizeQuery(undefined)).toBe('')
	})
})

describe('filterSettings', () => {
	test('empty or whitespace-only query returns the catalog untouched', () => {
		expect(filterSettings(settings, '')).toBe(settings)
		expect(filterSettings(settings, '   ')).toBe(settings)
		expect(filterSettings(settings, undefined)).toBe(settings)
	})

	test('matches titles accent- and case-insensitively', () => {
		const result = filterSettings(settings, 'verificacion')
		const titles = Object.values(result).flatMap(g => g.options.map(o => o.title))
		expect(titles).toContain('Verificación de identidad')
	})

	test('matches by keywords the title does not contain', () => {
		const byKeyword = (query, expectedTitle) => {
			const result = filterSettings(settings, query)
			const titles = Object.values(result).flatMap(g => g.options.map(o => o.title))
			expect(titles).toContain(expectedTitle)
		}
		byKeyword('huella', 'Face ID / Touch ID')
		byKeyword('kyc', 'Verificación de identidad')
		byKeyword('pyme', 'Empresa')
		byKeyword('pin', 'Bloqueo de app')
		byKeyword('teléfono', 'Verificar celular')
	})

	test('drops groups left without matches and keeps group titles', () => {
		const result = filterSettings(settings, 'huella')
		expect(Object.keys(result)).toEqual(['security'])
		expect(result.security.title).toBe('SEGURIDAD')
		expect(result.security.options).toHaveLength(1)
	})

	test('an unmatched query returns an empty catalog', () => {
		expect(filterSettings(settings, 'zzzznoexiste')).toEqual({})
	})

	test('does not mutate the original catalog', () => {
		const totalBefore = Object.values(settings).reduce((n, g) => n + g.options.length, 0)
		filterSettings(settings, 'tema')
		const totalAfter = Object.values(settings).reduce((n, g) => n + g.options.length, 0)
		expect(totalAfter).toBe(totalBefore)
	})
})
