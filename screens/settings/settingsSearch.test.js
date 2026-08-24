/**
 * Unit tests for the Settings menu search filter — node environment
 * (see keypadAmount.test.js for why).
 *
 * Los `title` del catálogo son claves de i18n desde la migración: el filtro
 * recibe `t` y matchea el título RESUELTO en el idioma activo; los keywords
 * son bilingües, así que cualquier idioma encuentra los items.
 * @jest-environment node
 */
import settings from './settings'
import { normalizeQuery, filterSettings } from './settingsSearch'
import i18n from '../../i18n'

const tEs = i18n.getFixedT('es')
const tEn = i18n.getFixedT('en')

// Títulos españoles resueltos de un resultado del filtro
const resolvedTitles = (result) =>
	Object.values(result).flatMap(g => g.options.map(o => tEs(o.title)))

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
		expect(filterSettings(settings, '', tEs)).toBe(settings)
		expect(filterSettings(settings, '   ', tEs)).toBe(settings)
		expect(filterSettings(settings, undefined, tEs)).toBe(settings)
	})

	test('matches resolved titles accent- and case-insensitively', () => {
		const result = filterSettings(settings, 'verificacion', tEs)
		expect(resolvedTitles(result)).toContain('Verificación de identidad')
	})

	test('matches by keywords the title does not contain', () => {
		const byKeyword = (query, expectedTitle) => {
			const result = filterSettings(settings, query, tEs)
			expect(resolvedTitles(result)).toContain(expectedTitle)
		}
		byKeyword('huella', 'Face ID / Touch ID')
		byKeyword('kyc', 'Verificación de identidad')
		byKeyword('pyme', 'Empresa')
		byKeyword('pin', 'Bloqueo de app')
		byKeyword('teléfono', 'Verificar celular')
	})

	test('matches English titles when the active language is English', () => {
		const result = filterSettings(settings, 'personal details', tEn)
		const titles = Object.values(result).flatMap(g => g.options.map(o => tEn(o.title)))
		expect(titles).toContain('Personal details')
	})

	test('bilingual keywords match regardless of the resolver language', () => {
		// 'fingerprint' es keyword en inglés; con t en español igual encuentra
		const result = filterSettings(settings, 'fingerprint', tEs)
		expect(resolvedTitles(result)).toContain('Face ID / Touch ID')
	})

	test('drops groups left without matches and keeps group titles', () => {
		const result = filterSettings(settings, 'huella', tEs)
		expect(Object.keys(result)).toEqual(['security'])
		expect(tEs(result.security.title)).toBe('SEGURIDAD')
		expect(result.security.options).toHaveLength(1)
	})

	test('an unmatched query returns an empty catalog', () => {
		expect(filterSettings(settings, 'zzzznoexiste', tEs)).toEqual({})
	})

	test('does not mutate the original catalog', () => {
		const totalBefore = Object.values(settings).reduce((n, g) => n + g.options.length, 0)
		filterSettings(settings, 'tema', tEs)
		const totalAfter = Object.values(settings).reduce((n, g) => n + g.options.length, 0)
		expect(totalAfter).toBe(totalBefore)
	})
})
