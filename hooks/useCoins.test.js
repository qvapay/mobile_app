/**
 * Tests del catálogo de monedas sobre React Query: hidratación desde la caché
 * compartida, deduplicación por filtro, TTL de frescura y las guardas que
 * protegen a las pantallas de dinero (vacío o fallo nunca borran la lista).
 * @jest-environment node
 */
jest.mock('../api/coinsApi', () => ({ __esModule: true, default: { index: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import coinsApi from '../api/coinsApi'
import useCoins, { COIN_FILTERS } from './useCoins'

const FRESH = [{ tick: 'BTC' }, { tick: 'USDT' }]

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const settle = () => act(async () => { await sleep(20) })

// Se guardan para desmontarlos: un QueryClient vivo deja temporizadores de
// recolección abiertos y jest no llega a cerrar el proceso
let mounted = []

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

// `client` compartido entre renders simula lo real: UN QueryClient por app
const renderCoins = async (kind = 'all', client = newClient()) => {
	const result = { current: null }
	const Harness = () => {
		result.current = useCoins(kind)
		return null
	}
	let tree
	await act(async () => {
		tree = create(<QueryClientProvider client={client}>{<Harness />}</QueryClientProvider>)
	})
	mounted.push({ tree, client })
	await settle()
	return { result, client, tree }
}

beforeEach(() => {
	jest.clearAllMocks()
	mounted = []
	coinsApi.index.mockResolvedValue({ success: true, data: FRESH })
})

afterEach(async () => {
	for (const { tree, client } of mounted) {
		await act(async () => { tree.unmount() })
		client.clear()
		client.unmount()
	}
	mounted = []
})

test('cada filtro pide su subconjunto', async () => {
	const { result } = await renderCoins('out')
	expect(coinsApi.index).toHaveBeenCalledWith({ enabled_out: true })
	expect(result.current.coins).toEqual(FRESH)
	expect(result.current.isLoading).toBe(false)
})

test('la segunda pantalla con la copia caliente no vuelve a la red', async () => {
	const { client } = await renderCoins('p2p')
	expect(coinsApi.index).toHaveBeenCalledTimes(1)

	const second = await renderCoins('p2p', client)
	// Dentro del staleTime: ni una petición más, y la lista llega ya pintada
	expect(coinsApi.index).toHaveBeenCalledTimes(1)
	expect(second.result.current.coins).toEqual(FRESH)
	expect(second.result.current.isLoading).toBe(false)
})

test('dos pantallas simultáneas comparten una sola petición', async () => {
	let resolveNetwork
	coinsApi.index.mockImplementation(() => new Promise(res => { resolveNetwork = res }))
	const { client } = await renderCoins('all')
	await renderCoins('all', client)
	expect(coinsApi.index).toHaveBeenCalledTimes(1)
	await act(async () => { resolveNetwork({ success: true, data: FRESH }) })
})

test('filtros distintos no se pisan entre sí', async () => {
	const { client } = await renderCoins('in')
	await renderCoins('out', client)
	expect(coinsApi.index).toHaveBeenCalledTimes(2)
	expect(coinsApi.index).toHaveBeenNthCalledWith(1, { enabled_in: true })
	expect(coinsApi.index).toHaveBeenNthCalledWith(2, { enabled_out: true })
})

test('un fallo de red no rompe: lista vacía y sin loader colgado', async () => {
	coinsApi.index.mockResolvedValue({ success: false, error: 'offline' })
	const { result } = await renderCoins('all')
	expect(result.current.coins).toEqual([])
	expect(result.current.isLoading).toBe(false)
})

test('una respuesta vacía no borra la lista que ya se estaba usando', async () => {
	const { client, tree } = await renderCoins('in')

	// La revalidación (pasado el TTL) llega vacía: se trata como fallo y la
	// caché conserva el catálogo con el que las pantallas de dinero operan
	await act(async () => { tree.unmount() })
	coinsApi.index.mockResolvedValue({ success: true, data: [] })
	jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120000)
	try {
		const again = await renderCoins('in', client)
		expect(coinsApi.index).toHaveBeenCalledTimes(2)
		expect(again.result.current.coins).toEqual(FRESH)
	} finally { Date.now.mockRestore() }
})

test('pasado el TTL de frescura se revalida (los precios mueven dinero real)', async () => {
	const { client, tree } = await renderCoins('out')
	expect(coinsApi.index).toHaveBeenCalledTimes(1)

	await act(async () => { tree.unmount() })
	// Simula una sesión larga: la copia en caché envejece más allá del minuto
	jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120000)
	try {
		await renderCoins('out', client)
		expect(coinsApi.index).toHaveBeenCalledTimes(2)
	} finally { Date.now.mockRestore() }
})

test('cada filtro conoce sus params', () => {
	expect(COIN_FILTERS.p2p.params).toEqual({ enabled_p2p: true })
	expect(COIN_FILTERS.all.params).toEqual({})
})
