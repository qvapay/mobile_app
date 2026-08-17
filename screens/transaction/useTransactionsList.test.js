/**
 * Tests del histórico de transacciones sobre React Query.
 *
 * El test que de verdad importa es el del pull-to-refresh tras varias páginas:
 * `refetch()` a secas revalidaría en cadena TODAS las páginas cargadas (una
 * petición por página, secuenciales). El hook recorta la caché a la página 1
 * antes de refetchear, así que un refresh es UNA sola petición — igual que la
 * implementación anterior de cursores manuales. Este test falla contra un
 * `refetch()` sin recorte.
 * @jest-environment node
 */
jest.mock('../../api/transferApi', () => ({
	transferApi: { getLatestTransactions: jest.fn() },
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { transferApi } from '../../api/transferApi'
import { getNextPage, trimToFirstPage, PAGE_SIZE } from './transactionsQueries'
import useTransactionsList from './useTransactionsList'

const ok = (data) => ({ success: true, data, status: 200 })
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// React Query notifica sus resultados vía notifyManager (setTimeout), así que
// tras cada interacción hay que dejar correr un temporizador real, no solo
// microtareas, para que el estado del hook refleje la respuesta
const settle = () => act(async () => { await sleep(20) })
const pageOf = (page, count) => Array.from({ length: count }, (_, i) => ({ uuid: `p${page}-${i}` }))

// Peticiones registradas y compuerta que retiene las respuestas
let calls = []
let gate = Promise.resolve()

// Páginas que "sirve" el backend de mentira; se ajustan por test
let pages = {}

const wire = () => {
	transferApi.getLatestTransactions = jest.fn(async (params) => {
		calls.push(params)
		await gate
		return ok(pages[params.page] ?? [])
	})
}

// Se guardan para desmontarlos: un QueryClient vivo deja temporizadores de
// recolección abiertos y jest no llega a cerrar el proceso
let mounted = []

const renderList = async (filters = {}) => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	})
	const result = { current: null }
	const Harness = ({ f }) => {
		result.current = useTransactionsList(f)
		return null
	}
	let tree
	await act(async () => {
		tree = create(<QueryClientProvider client={client}><Harness f={filters} /></QueryClientProvider>)
	})
	mounted.push({ tree, client })
	await settle()
	const setFilters = async (f) => {
		await act(async () => {
			tree.update(<QueryClientProvider client={client}><Harness f={f} /></QueryClientProvider>)
		})
		await settle()
	}
	return { result, setFilters }
}

beforeEach(() => {
	calls = []
	gate = Promise.resolve()
	pages = { 1: pageOf(1, PAGE_SIZE), 2: pageOf(2, PAGE_SIZE), 3: pageOf(3, 5) }
	mounted = []
	wire()
})

afterEach(async () => {
	for (const { tree, client } of mounted) {
		await act(async () => { tree.unmount() })
		client.clear()
		client.unmount()
	}
	mounted = []
})

describe('paginación', () => {
	test('la primera carga pide la página 1 con el tamaño y los filtros aplicados', async () => {
		const { result } = await renderList({ status: 'paid' })
		expect(calls).toEqual([{ page: 1, take: PAGE_SIZE, status: 'paid' }])
		expect(result.current.transactions).toHaveLength(PAGE_SIZE)
	})

	test('loadMore concatena la siguiente página; una página corta corta el scroll', async () => {
		pages = { 1: pageOf(1, PAGE_SIZE), 2: pageOf(2, 5) }
		const { result } = await renderList()

		await act(async () => { result.current.loadMore() })
		await settle()
		expect(calls.map(c => c.page)).toEqual([1, 2])
		expect(result.current.transactions).toHaveLength(PAGE_SIZE + 5)

		// La página 2 vino corta: no hay más que pedir
		await act(async () => { result.current.loadMore() })
		await settle()
		expect(calls).toHaveLength(2)
	})

	test('getNextPage: página llena avanza, página corta termina', () => {
		expect(getNextPage(pageOf(1, PAGE_SIZE), [], 1)).toBe(2)
		expect(getNextPage(pageOf(2, 3), [], 2)).toBeUndefined()
		expect(getNextPage([], [], 1)).toBeUndefined()
	})
})

describe('pull-to-refresh', () => {
	test('tras varias páginas cargadas, el refresh es UNA sola petición de la página 1', async () => {
		const { result } = await renderList()
		await act(async () => { result.current.loadMore() })
		await settle()
		await act(async () => { result.current.loadMore() })
		await settle()
		expect(result.current.transactions).toHaveLength(PAGE_SIZE * 2 + 5)

		calls = []
		await act(async () => { await result.current.onRefresh() })
		await settle()

		expect(calls).toEqual([{ page: 1, take: PAGE_SIZE }])
		// La lista vuelve a ser la primera página fresca, sin colas viejas
		expect(result.current.transactions).toHaveLength(PAGE_SIZE)
	})

	test('refreshing sube y baja solo en el tirón, no en la carga inicial', async () => {
		const { result } = await renderList()
		expect(result.current.refreshing).toBe(false)

		let refreshDone
		gate = new Promise(resolve => setTimeout(resolve, 50))
		await act(async () => {
			refreshDone = result.current.onRefresh()
			await new Promise(resolve => setTimeout(resolve, 10))
		})
		expect(result.current.refreshing).toBe(true)

		await act(async () => { await refreshDone })
		expect(result.current.refreshing).toBe(false)
	})
})

describe('filtros', () => {
	test('cambiar de filtros arranca una query nueva: lista vacía y carga en curso', async () => {
		const { result, setFilters } = await renderList()
		expect(result.current.transactions).toHaveLength(PAGE_SIZE)

		// La respuesta de la query filtrada queda retenida por la compuerta
		gate = new Promise(resolve => setTimeout(resolve, 50))
		await setFilters({ search: 'cafe' })

		expect(result.current.isPending).toBe(true)
		expect(result.current.transactions).toEqual([])
		expect(calls.at(-1)).toEqual({ page: 1, take: PAGE_SIZE, search: 'cafe' })

		await act(async () => { await gate })
		await settle()
		expect(result.current.isPending).toBe(false)
		expect(result.current.transactions).toHaveLength(PAGE_SIZE)
	})

	test('volver a un juego de filtros ya visto rehidrata de caché al instante', async () => {
		const { result, setFilters } = await renderList()
		await setFilters({ search: 'cafe' })
		await setFilters({})

		// Los datos sin filtrar reaparecen sin esperar a la red
		expect(result.current.transactions).toHaveLength(PAGE_SIZE)
	})
})

describe('trimToFirstPage', () => {
	test('recorta páginas y params en paralelo; una sola página queda intacta', () => {
		const data = { pages: [pageOf(1, 2), pageOf(2, 2)], pageParams: [1, 2] }
		expect(trimToFirstPage(data)).toEqual({ pages: [pageOf(1, 2)], pageParams: [1] })

		const single = { pages: [pageOf(1, 2)], pageParams: [1] }
		expect(trimToFirstPage(single)).toBe(single)
		expect(trimToFirstPage(undefined)).toBeUndefined()
	})
})
