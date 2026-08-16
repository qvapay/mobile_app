/**
 * Tests del catálogo de monedas cacheado: hidratación instantánea desde
 * memoria/disco, una sola petición por filtro y reparto entre pantallas.
 * @jest-environment node
 */
jest.mock('../api/coinsApi', () => ({ __esModule: true, default: { index: jest.fn() } }))
jest.mock('../helpers/dataCache', () => ({
	CACHE_KEYS: { COINS_IN: 'coins_in', COINS_OUT: 'coins_out', COINS_ALL: 'coins_all', P2P_COINS: 'p2p_coins' },
	readCache: jest.fn(async () => null),
	writeCache: jest.fn(),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import coinsApi from '../api/coinsApi'
import { readCache, writeCache } from '../helpers/dataCache'
import useCoins, { clearCoinsMemory, COIN_FILTERS } from './useCoins'

const FRESH = [{ tick: 'BTC' }, { tick: 'USDT' }]
const STORED = [{ tick: 'CACHED' }]

const renderCoins = async (kind = 'all') => {
	const result = { current: null }
	const Harness = () => {
		result.current = useCoins(kind)
		return null
	}
	await act(async () => { create(<Harness />) })
	return result
}

beforeEach(() => {
	jest.clearAllMocks()
	clearCoinsMemory()
	// clearAllMocks limpia las llamadas pero NO las implementaciones: sin esto,
	// el mockResolvedValue de un test se filtra a los siguientes
	readCache.mockResolvedValue(null)
	coinsApi.index.mockResolvedValue({ success: true, data: FRESH })
})

test('cada filtro pide su subconjunto y lo persiste en su clave', async () => {
	await renderCoins('out')
	expect(coinsApi.index).toHaveBeenCalledWith({ enabled_out: true })
	expect(writeCache).toHaveBeenCalledWith('coins_out', FRESH)
})

test('el catálogo de disco pinta antes que la red', async () => {
	let resolveNetwork
	coinsApi.index.mockImplementation(() => new Promise(res => { resolveNetwork = res }))
	readCache.mockResolvedValue(STORED)

	const result = await renderCoins('in')
	// Disco ya resolvió: hay lista que pintar sin esperar a la red
	expect(result.current.coins).toEqual(STORED)
	expect(result.current.isLoading).toBe(false)

	await act(async () => { resolveNetwork({ success: true, data: FRESH }) })
	expect(result.current.coins).toEqual(FRESH)
})

test('la segunda pantalla que pide el mismo filtro no vuelve a la red', async () => {
	await renderCoins('p2p')
	expect(coinsApi.index).toHaveBeenCalledTimes(1)

	coinsApi.index.mockClear()
	readCache.mockClear()
	const second = await renderCoins('p2p')
	// Memoria de módulo: ni red ni disco, y la lista llega ya pintada
	expect(coinsApi.index).not.toHaveBeenCalled()
	expect(readCache).not.toHaveBeenCalled()
	expect(second.current.coins).toEqual(FRESH)
	expect(second.current.isLoading).toBe(false)
})

test('dos pantallas simultáneas comparten una sola petición', async () => {
	let resolveNetwork
	coinsApi.index.mockImplementation(() => new Promise(res => { resolveNetwork = res }))
	await renderCoins('all')
	await renderCoins('all')
	expect(coinsApi.index).toHaveBeenCalledTimes(1)
	await act(async () => { resolveNetwork({ success: true, data: FRESH }) })
})

test('filtros distintos no se pisan entre sí', async () => {
	await renderCoins('in')
	await renderCoins('out')
	expect(coinsApi.index).toHaveBeenCalledTimes(2)
	expect(coinsApi.index).toHaveBeenNthCalledWith(1, { enabled_in: true })
	expect(coinsApi.index).toHaveBeenNthCalledWith(2, { enabled_out: true })
})

test('un fallo de red no rompe ni cachea nada', async () => {
	coinsApi.index.mockRejectedValue(new Error('offline'))
	const result = await renderCoins('all')
	expect(result.current.coins).toEqual([])
	expect(result.current.isLoading).toBe(false)
	expect(writeCache).not.toHaveBeenCalled()
})

test('una respuesta vacía no borra lo que ya había en caché', async () => {
	coinsApi.index.mockResolvedValue({ success: true, data: [] })
	readCache.mockResolvedValue(STORED)
	const result = await renderCoins('in')
	expect(result.current.coins).toEqual(STORED)
	expect(writeCache).not.toHaveBeenCalled()
})

test('el disco NO pisa una respuesta de red ya resuelta', async () => {
	// La red resuelve primero y el disco llega tarde con datos viejos: si se
	// colara, además envenenaría la memoria compartida para toda la sesión
	let resolveDisk
	readCache.mockImplementation(() => new Promise(res => { resolveDisk = res }))
	const result = await renderCoins('in')
	expect(result.current.coins).toEqual(FRESH)

	await act(async () => { resolveDisk(STORED) })
	expect(result.current.coins).toEqual(FRESH)
})

test('pasado el TTL de memoria se revalida (los precios mueven dinero real)', async () => {
	await renderCoins('out')
	expect(coinsApi.index).toHaveBeenCalledTimes(1)

	// Simula una sesión larga: la copia en memoria envejece
	jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120000)
	try {
		await renderCoins('out')
		expect(coinsApi.index).toHaveBeenCalledTimes(2)
	} finally { Date.now.mockRestore() }
})

test('cada filtro conoce su clave de caché', () => {
	expect(COIN_FILTERS.p2p.cacheKey).toBe('p2p_coins')
	expect(COIN_FILTERS.in.cacheKey).toBe('coins_in')
})
