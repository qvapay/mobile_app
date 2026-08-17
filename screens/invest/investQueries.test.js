/**
 * Tests del dashboard de Invest sobre React Query.
 *
 * Los dos que de verdad importan: las cuatro fuentes salen EN PARALELO (la
 * técnica de la compuerta, como en useHomeFeed.test), y el pull-to-refresh
 * revalida AMBAS raíces — el dashboard propio y el resumen de ahorros
 * compartido con BalanceCard, que no cuelga de `['invest']`.
 * @jest-environment node
 */
jest.mock('../../api/coinsApi', () => ({ coinsApi: { index: jest.fn(), priceHistory: jest.fn() } }))
jest.mock('../../api/p2pApi', () => ({ p2pApi: { getAverages: jest.fn() } }))
jest.mock('../../api/stocksApi', () => ({ stocksApi: { index: jest.fn() } }))
jest.mock('../../api/savingApi', () => ({ savingApi: { getSummary: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { coinsApi } from '../../api/coinsApi'
import { p2pApi } from '../../api/p2pApi'
import { stocksApi } from '../../api/stocksApi'
import { savingApi } from '../../api/savingApi'
import { mapP2pPairs, mapStocks, enrichCoins, useInvestDashboard } from './investQueries'

const ok = (data) => ({ success: true, data, status: 200 })
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const settle = () => act(async () => { await sleep(20) })

// Llamadas registradas y compuerta que retiene las respuestas
let started = []
let gate = Promise.resolve()

const wire = () => {
	const record = (name, payload) => jest.fn(async () => {
		started.push(name)
		await gate
		return payload
	})
	savingApi.getSummary = record('savings', ok({ balance: 120, rate: 4, currentRate: 4 }))
	coinsApi.index = record('coins', ok([{ tick: 'BTC' }, { tick: 'ETH' }]))
	stocksApi.index = record('stocks', ok([{ symbol: 'AAPL', name: 'Apple', price: 200, change: 1 }]))
	p2pApi.getAverages = record('p2p', ok({ ZELLE: { name: 'Zelle', average_buy: 1.1, average_sell: 0.9, count: 4 } }))
	// Los históricos cuentan como parte de la fuente coins (salen tras el index)
	coinsApi.priceHistory = jest.fn(async () => ok([{ value: 10 }, { value: 12 }]))
}

// Se guardan para desmontarlos: un QueryClient vivo deja temporizadores de
// recolección abiertos y jest no llega a cerrar el proceso
let mounted = []

const renderDashboard = async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	})
	const result = { current: null }
	const Harness = () => {
		result.current = useInvestDashboard()
		return null
	}
	let tree
	await act(async () => {
		tree = create(<QueryClientProvider client={client}>{<Harness />}</QueryClientProvider>)
	})
	mounted.push({ tree, client })
	await settle()
	return result
}

beforeEach(() => {
	started = []
	gate = Promise.resolve()
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

describe('carga y refresco', () => {
	test('las cuatro fuentes salen EN PARALELO, no encadenadas', async () => {
		// Las APIs retienen su respuesta; se mira ANTES de que llegue ninguna
		gate = new Promise(resolve => setTimeout(resolve, 100))
		const dashboard = await renderDashboard()

		expect(new Set(started)).toEqual(new Set(['savings', 'coins', 'stocks', 'p2p']))

		// Abierta la compuerta, las respuestas aterrizan con normalidad
		await act(async () => { await gate })
		await settle()
		expect(dashboard.current.coins.length).toBeGreaterThan(0)
	})

	test('el refresco revalida el dashboard Y el resumen de ahorros compartido', async () => {
		const dashboard = await renderDashboard()

		started = []
		await act(async () => { await dashboard.current.onRefresh() })
		await settle()

		// Las dos raíces: ['invest', …] y ['savings', 'summary']
		expect(new Set(started)).toEqual(new Set(['savings', 'coins', 'stocks', 'p2p']))
	})

	test('refreshing sube y baja solo en el tirón', async () => {
		const dashboard = await renderDashboard()
		expect(dashboard.current.refreshing).toBe(false)

		let refreshDone
		gate = new Promise(resolve => setTimeout(resolve, 50))
		await act(async () => {
			refreshDone = dashboard.current.onRefresh()
			await sleep(10)
		})
		expect(dashboard.current.refreshing).toBe(true)

		await act(async () => { await refreshDone })
		expect(dashboard.current.refreshing).toBe(false)
	})

	test('mantiene el contrato que consume Invest.jsx, sin listas undefined', async () => {
		const dashboard = await renderDashboard()
		expect(Object.keys(dashboard.current).sort()).toEqual([
			'coins', 'isLoading', 'onRefresh', 'p2pData', 'refreshing', 'savings', 'stocks',
		])
		expect(dashboard.current.savings).toMatchObject({ balance: 120 })
		expect(dashboard.current.p2pData).toEqual([
			{ tick: 'ZELLE', name: 'Zelle', buy: 1.1, sell: 0.9, count: 4 },
		])
	})
})

describe('mapeos puros', () => {
	test('mapP2pPairs respeta el orden del catálogo y salta raíles sin datos', () => {
		const pairs = mapP2pPairs({
			ZELLE: { name: 'Zelle', average_buy: 1.1, average_sell: 0.9, count: 4 },
			BANK_CUP: { count: 10 },
		})
		// BANK_CUP va antes que ZELLE en P2P_COINS, y sus faltantes usan defaults
		expect(pairs).toEqual([
			{ tick: 'BANK_CUP', name: 'BANK_CUP', buy: 0, sell: 0, count: 10 },
			{ tick: 'ZELLE', name: 'Zelle', buy: 1.1, sell: 0.9, count: 4 },
		])
		expect(mapP2pPairs(null)).toEqual([])
	})

	test('mapStocks normaliza symbol→tick y la imagen ausente a null', () => {
		expect(mapStocks([{ symbol: 'AAPL', name: 'Apple', price: 200, change: 1 }])).toEqual([
			{ tick: 'AAPL', name: 'Apple', icon: undefined, iconStyle: undefined, image: null, price: 200, change: 1, changeDollar: undefined },
		])
	})

	test('enrichCoins calcula la variación y tolera un histórico fallido', () => {
		const coins = [{ tick: 'BTC' }, { tick: 'ETH' }, { tick: 'SOL' }]
		const enriched = enrichCoins(coins, ['BTC', 'ETH'], [
			ok([{ value: 100 }, { value: 110 }]),
			{ success: false },
		])
		expect(enriched[0]).toMatchObject({ price: 110, change: 10, changeDollar: 10 })
		expect(enriched[0].priceHistory).toHaveLength(2)
		// ETH falló su histórico y SOL no se pidió: quedan sin enriquecer
		expect(enriched[1]).toEqual({ tick: 'ETH' })
		expect(enriched[2]).toEqual({ tick: 'SOL' })
	})
})
