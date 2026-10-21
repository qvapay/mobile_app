/**
 * @jest-environment node
 */
import { categoryOf, coverOf, presentCategories, normalizeSearch, matchesQuery, buildCatalogView, MINIAPP_CATEGORIES, CATEGORY_META } from './miniappsCatalog'

const app = (slug, extra = {}) => ({
	slug,
	name: slug,
	tagline: null,
	category: 'other',
	featured: false,
	merchant: { name: null, logo: null },
	...extra,
})

describe('miniappsCatalog', () => {

	test('toda categoría conocida tiene icono y color', () => {
		for (const c of MINIAPP_CATEGORIES) expect(CATEGORY_META[c]).toEqual({ icon: expect.any(String), color: expect.stringMatching(/^#[0-9A-F]{6}$/i) })
	})

	test('una categoría desconocida cae en other', () => {
		expect(categoryOf({ category: 'games' })).toBe('games')
		expect(categoryOf({ category: 'casino' })).toBe('other')
		expect(categoryOf({ category: '' })).toBe('other')
	})

	test('presentCategories respeta el orden fijo y no repite', () => {
		const apps = [app('a', { category: 'tools' }), app('b', { category: 'games' }), app('c', { category: 'tools' }), app('d', { category: 'nueva' })]
		expect(presentCategories(apps)).toEqual(['games', 'tools', 'other'])
		expect(presentCategories([])).toEqual([])
	})

	test('normalizeSearch quita tildes y mayúsculas', () => {
		expect(normalizeSearch('  Café ÑOÑO ')).toBe('cafe nono')
		expect(normalizeSearch(null)).toBe('')
	})

	test('matchesQuery busca en nombre, descripción y autor', () => {
		const a = app('x', { name: 'Dominó', tagline: 'Juega con amigos', merchant: { name: 'La Esquina', logo: null } })
		expect(matchesQuery(a, 'domino')).toBe(true)
		expect(matchesQuery(a, 'AMIGOS')).toBe(true)
		expect(matchesQuery(a, 'esquina')).toBe(true)
		expect(matchesQuery(a, 'parchís')).toBe(false)
		expect(matchesQuery(a, '   ')).toBe(true)
	})

	test('sin filtro: destacadas al carrusel y el resto a la lista', () => {
		const apps = [app('f1', { featured: true }), app('r1'), app('f2', { featured: true }), app('r2')]
		const view = buildCatalogView(apps)
		expect(view.filtering).toBe(false)
		expect(view.featured.map(a => a.slug)).toEqual(['f1', 'f2'])
		expect(view.list.map(a => a.slug)).toEqual(['r1', 'r2'])
	})

	test('con filtro: sin carrusel y las destacadas entran en la lista', () => {
		const apps = [app('f1', { featured: true, category: 'games' }), app('r1', { category: 'games' }), app('r2', { category: 'tools' })]
		expect(buildCatalogView(apps, { category: 'games' })).toEqual({ featured: [], list: [apps[0], apps[1]], filtering: true })
		expect(buildCatalogView(apps, { query: 'r' }).list.map(a => a.slug)).toEqual(['r1', 'r2'])
		expect(buildCatalogView(apps, { query: 'r', category: 'tools' }).list.map(a => a.slug)).toEqual(['r2'])
	})

	test('coverOf: ruta del CDN a URL absoluta, sin portada o SVG = null', () => {
		expect(coverOf({ cover: 'miniapps/hello-cover.jpg' })).toBe('https://media.qvapay.com/miniapps/hello-cover.jpg')
		expect(coverOf({ cover: 'https://cdn.x.com/c.webp' })).toBe('https://cdn.x.com/c.webp')
		expect(coverOf({ cover: 'https://cdn.x.com/c.svg?v=2' })).toBeNull()
		expect(coverOf({ cover: null })).toBeNull()
		expect(coverOf({})).toBeNull()
	})

	test('un query de solo espacios no cuenta como filtro', () => {
		expect(buildCatalogView([app('f', { featured: true })], { query: '  ' }).filtering).toBe(false)
	})
})
