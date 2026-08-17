/**
 * Tests de la política de persistencia del cliente de queries.
 *
 * Dos reglas con consecuencias reales en producción:
 * - Una query infinita se persiste SOLO con su primera página: persistirlas
 *   todas obligaría al próximo arranque en frío a revalidar N páginas en
 *   cadena, una petición por página.
 * - `meta.noPersist` excluye del disco variantes efímeras (históricos
 *   filtrados o buscados), que llenarían el storage de queries muertas.
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
	setItem: jest.fn(),
	getItem: jest.fn(),
	removeItem: jest.fn(),
}))

import { trimInfiniteQueries, shouldPersistQuery, persistOptions } from './queryClient'

const infiniteQuery = (pages) => ({
	queryKey: ['transactions', 'list', {}],
	queryHash: 'hash-infinite',
	state: {
		status: 'success',
		data: {
			pages,
			pageParams: pages.map((_, i) => i + 1),
		},
	},
})

const plainQuery = () => ({
	queryKey: ['home', 'promo'],
	queryHash: 'hash-plain',
	state: { status: 'success', data: { id: 'promo-1' } },
})

const persistedClient = (queries) => ({
	timestamp: 123,
	buster: '9.9.9',
	clientState: { mutations: [], queries },
})

describe('trimInfiniteQueries', () => {
	test('recorta una infinita de varias páginas a la primera, con su pageParam', () => {
		const client = persistedClient([infiniteQuery([['a'], ['b'], ['c']]), plainQuery()])
		const trimmed = trimInfiniteQueries(client)

		const [infinite, plain] = trimmed.clientState.queries
		expect(infinite.state.data).toEqual({ pages: [['a']], pageParams: [1] })
		// Las queries normales pasan intactas, y el sobre exterior también
		expect(plain).toEqual(plainQuery())
		expect(trimmed.timestamp).toBe(123)
		expect(trimmed.buster).toBe('9.9.9')
	})

	test('una infinita de una sola página no se toca', () => {
		const query = infiniteQuery([['a']])
		const trimmed = trimInfiniteQueries(persistedClient([query]))
		expect(trimmed.clientState.queries[0]).toBe(query)
	})

	test('no confunde datos normales con forma infinita', () => {
		const arrayData = {
			queryKey: ['home', 'transactions'],
			queryHash: 'hash-array',
			state: { status: 'success', data: [['no'], ['es'], ['infinita']] },
		}
		const trimmed = trimInfiniteQueries(persistedClient([arrayData]))
		expect(trimmed.clientState.queries[0]).toBe(arrayData)
	})
})

describe('shouldPersistQuery', () => {
	test('una query resuelta sin meta se persiste', () => {
		expect(shouldPersistQuery({ state: { status: 'success' }, meta: undefined })).toBe(true)
	})

	test('meta.noPersist la deja fuera aunque esté resuelta', () => {
		expect(shouldPersistQuery({ state: { status: 'success' }, meta: { noPersist: true } })).toBe(false)
	})

	test('una query pendiente o fallida nunca toca el disco', () => {
		expect(shouldPersistQuery({ state: { status: 'pending' } })).toBe(false)
		expect(shouldPersistQuery({ state: { status: 'error' } })).toBe(false)
	})

	test('está cableada en persistOptions', () => {
		expect(persistOptions.dehydrateOptions.shouldDehydrateQuery).toBe(shouldPersistQuery)
	})
})
