/**
 * Enlaces públicos de mini-apps — módulo puro, entorno node.
 * @jest-environment node
 */
import { buildMiniAppUrl, buildMiniAppShareMessage, parseMiniAppLink } from './miniappLinks'

describe('buildMiniAppUrl', () => {
	test('sale por www (dominio canónico) bajo /apps/', () => {
		expect(buildMiniAppUrl('mi-app')).toBe('https://www.qvapay.com/apps/mi-app')
	})

	test('codifica el slug por si llega algo raro', () => {
		expect(buildMiniAppUrl('a b/c')).toBe('https://www.qvapay.com/apps/a%20b%2Fc')
	})
})

describe('parseMiniAppLink', () => {
	test.each([
		['https://qvapay.com/apps/mi-app', 'mi-app'],
		['https://www.qvapay.com/apps/mi-app', 'mi-app'],
		['https://www.qvapay.com/apps/mi-app?utm_source=tg#top', 'mi-app'],
		['https://www.qvapay.com/apps/mi-app/', 'mi-app'],
		['qvapay://apps/mi-app', 'mi-app'],
		['qvapay://apps/mi-app?order=1', 'mi-app'],
	])('%s → %s', (url, slug) => {
		expect(parseMiniAppLink(url)).toEqual({ slug })
	})

	test('decodifica el slug', () => {
		expect(parseMiniAppLink('https://www.qvapay.com/apps/mi%2Dapp')).toEqual({ slug: 'mi-app' })
	})

	test.each([
		'https://www.qvapay.com/apps',
		'https://www.qvapay.com/apps/',
		'https://www.qvapay.com/app/mi-app',
		'https://www.qvapay.com/store/mi-tienda',
		'https://www.qvapay.com/p2p/abc',
		'qvapay://apps/',
		'qvapay://home',
	])('%s no es un enlace de mini-app', (url) => {
		expect(parseMiniAppLink(url)).toBeNull()
	})

	test('un porcentaje mal codificado no lanza', () => {
		expect(parseMiniAppLink('https://www.qvapay.com/apps/%E0%A4%A')).toBeNull()
	})
})

describe('buildMiniAppShareMessage', () => {
	const url = 'https://www.qvapay.com/apps/mi-app'

	test('sin texto propio usa el copy por defecto (que ya lleva la URL)', () => {
		expect(buildMiniAppShareMessage({ url, defaultMessage: `Descubre Mi App en QvaPay: ${url}` })).toBe(`Descubre Mi App en QvaPay: ${url}`)
	})

	test('con texto de la mini-app, la URL va en su propia línea', () => {
		expect(buildMiniAppShareMessage({ url, defaultMessage: 'x', text: 'Mira esto' })).toBe(`Mira esto\n${url}`)
	})

	test('texto vacío cuenta como sin texto', () => {
		expect(buildMiniAppShareMessage({ url, defaultMessage: 'por defecto', text: '' })).toBe('por defecto')
	})
})
