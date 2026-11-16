/**
 * @jest-environment node
 */
import { categoryOf, coverOf, presentCategories, normalizeSearch, matchesQuery, buildCatalogView, pickHomeMiniApps, homeMiniAppsGrid, splitHomeMiniApps, MINIAPP_CATEGORIES, CATEGORY_META, HOME_MINIAPPS_LIMIT } from './miniappsCatalog'

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

	describe('homeMiniAppsGrid / splitHomeMiniApps (rejilla del Home)', () => {
		const grid = (width, height) => homeMiniAppsGrid({ width, height, itemWidth: 64, minGap: 8, rowGap: 14 })

		test('teléfono pequeño: una fila de seis con el hueco de siempre', () => {
			expect(grid(343, 667)).toEqual({ rows: 1, perRow: 4, limit: 6, gap: 14 })
		})

		test('pantalla razonable: dos filas llenas, con los iconos repartidos por el ancho', () => {
			const g = grid(361, 852)
			expect(g).toMatchObject({ rows: 2, perRow: 5, limit: 10 })
			expect(5 * 64 + 4 * g.gap).toBeCloseTo(361)
			expect(grid(328, 780)).toMatchObject({ rows: 2, perRow: 4, limit: 8, gap: 24 })
		})

		test('el tope nunca baja de las seis de siempre', () => {
			expect(grid(150, 900)).toMatchObject({ rows: 2, perRow: 2, limit: 6 })
		})

		test('reparto: una fila si caben, la de arriba llena primero, a medias si desbordan', () => {
			const two = { rows: 2, perRow: 4 }
			expect(splitHomeMiniApps([1, 2, 3, 4], two)).toEqual([[1, 2, 3, 4]])
			expect(splitHomeMiniApps([1, 2, 3, 4, 5, 6], two)).toEqual([[1, 2, 3, 4], [5, 6]])
			expect(splitHomeMiniApps([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], two)).toEqual([[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11]])
			expect(splitHomeMiniApps([1, 2, 3, 4, 5, 6], { rows: 1, perRow: 4 })).toEqual([[1, 2, 3, 4, 5, 6]])
		})
	})

	describe('pickHomeMiniApps (fila del Home)', () => {
		test('destacadas primero y el resto en el orden del servidor', () => {
			const apps = [app('a'), app('b', { featured: true }), app('c'), app('d', { featured: true })]
			expect(pickHomeMiniApps(apps).map(a => a.slug)).toEqual(['b', 'd', 'a', 'c'])
		})

		test('corta en seis por defecto y respeta limit', () => {
			const apps = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(slug => app(slug))
			expect(HOME_MINIAPPS_LIMIT).toBe(6)
			expect(pickHomeMiniApps(apps)).toHaveLength(6)
			expect(pickHomeMiniApps(apps, { limit: 2 }).map(a => a.slug)).toEqual(['a', 'b'])
			expect(pickHomeMiniApps(apps, { limit: 0 })).toEqual([])
		})

		test('las favoritas van primero, en su orden, por delante de las destacadas', () => {
			const apps = [app('a'), app('b', { featured: true }), app('c'), app('d')]
			expect(pickHomeMiniApps(apps, { favorites: ['d', 'a'] }).map(a => a.slug)).toEqual(['d', 'a', 'b', 'c'])
		})

		test('las favoritas no tienen tope; el resto solo rellena hasta seis', () => {
			const slugs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
			const apps = slugs.map(slug => app(slug, { featured: slug === 'i' }))
			const favorites = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
			expect(pickHomeMiniApps(apps, { favorites }).map(a => a.slug)).toEqual(favorites)
			expect(pickHomeMiniApps(apps, { favorites: ['h', 'g'] }).map(a => a.slug)).toEqual(['h', 'g', 'i', 'a', 'b', 'c'])
		})

		test('sin duplicados: una favorita destacada no sale dos veces', () => {
			const apps = [app('a', { featured: true }), app('b')]
			expect(pickHomeMiniApps(apps, { favorites: ['a', 'a'] }).map(a => a.slug)).toEqual(['a', 'b'])
		})

		test('ignora favoritas que ya no están en el directorio o son borradores', () => {
			const apps = [app('a'), app('b', { preview: true })]
			expect(pickHomeMiniApps(apps, { favorites: ['gone', 'b', 'a'] }).map(a => a.slug)).toEqual(['a'])
		})

		test('los borradores en preview no salen aunque estén destacados', () => {
			const apps = [app('a', { preview: true, featured: true }), app('b')]
			expect(pickHomeMiniApps(apps).map(a => a.slug)).toEqual(['b'])
		})

		test('tolera null y undefined', () => {
			expect(pickHomeMiniApps(null)).toEqual([])
			expect(pickHomeMiniApps(undefined)).toEqual([])
		})
	})
})
