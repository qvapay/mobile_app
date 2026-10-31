/**
 * Mini-apps favoritas: lógica pura (marcar/desmarcar, lectura del disco y
 * accesos rápidos del icono).
 * @jest-environment node
 */
import { toggleFavorite, parseStoredFavorites, quickActionFavorites, QUICK_ACTIONS_LIMIT } from './miniappFavorites'

const app = (slug, extra = {}) => ({ slug, name: `App ${slug}`, icon: `apps/${slug}.png`, featured: false, ...extra })

describe('toggleFavorite', () => {
	test('al marcar, la mini-app va primera', () => {
		expect(toggleFavorite(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
	})

	test('al desmarcar, sale y el resto conserva su orden', () => {
		expect(toggleFavorite(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
	})

	test('no muta la lista de entrada', () => {
		const list = ['a']
		toggleFavorite(list, 'b')
		expect(list).toEqual(['a'])
	})
})

describe('parseStoredFavorites', () => {
	test('lee el mapa por cuenta', () => {
		expect(parseStoredFavorites(JSON.stringify({ u1: ['a', 'b'], u2: ['c'] }))).toEqual({ u1: ['a', 'b'], u2: ['c'] })
	})

	test('nada guardado o JSON roto = sin favoritas', () => {
		expect(parseStoredFavorites(null)).toEqual({})
		expect(parseStoredFavorites('')).toEqual({})
		expect(parseStoredFavorites('{no es json')).toEqual({})
		expect(parseStoredFavorites('["a"]')).toEqual({})
		expect(parseStoredFavorites('42')).toEqual({})
	})

	test('descarta basura, duplicados y cuentas vacías', () => {
		const raw = JSON.stringify({ u1: ['a', 3, null, '', 'a', 'b'], u2: 'a', u3: [], u4: [{}] })
		expect(parseStoredFavorites(raw)).toEqual({ u1: ['a', 'b'] })
	})
})

describe('quickActionFavorites', () => {
	test('las favoritas vivas en su orden, con nombre e icono', () => {
		const apps = [app('a'), app('b'), app('c')]
		expect(quickActionFavorites(apps, ['c', 'a'])).toEqual([
			{ slug: 'c', name: 'App c', icon: 'apps/c.png' },
			{ slug: 'a', name: 'App a', icon: 'apps/a.png' },
		])
	})

	test('sin relleno: las destacadas no entran si no son favoritas', () => {
		expect(quickActionFavorites([app('a', { featured: true }), app('b')], [])).toEqual([])
	})

	test('cuatro como mucho (lo que enseña iOS)', () => {
		const slugs = ['a', 'b', 'c', 'd', 'e', 'f']
		expect(QUICK_ACTIONS_LIMIT).toBe(4)
		expect(quickActionFavorites(slugs.map(slug => app(slug)), slugs).map(item => item.slug)).toEqual(['a', 'b', 'c', 'd'])
	})

	test('ignora favoritas retiradas o en borrador y apps sin icono', () => {
		const apps = [app('a', { icon: null }), app('b', { preview: true })]
		expect(quickActionFavorites(apps, ['gone', 'b', 'a'])).toEqual([{ slug: 'a', name: 'App a', icon: null }])
		expect(quickActionFavorites(null, ['a'])).toEqual([])
	})
})
