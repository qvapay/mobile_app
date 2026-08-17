/**
 * Tests del catálogo de la tienda sobre React Query.
 *
 * El caso que de verdad importa es la CARRERA de la selección de país: la
 * restauración de AsyncStorage debe resolverse antes de aplicar el default
 * (CU) — sin esa compuerta, cada arranque pisaría el país guardado.
 *
 * Nota: en el entorno node de jest `Platform.OS` es 'ios', así que las
 * queries de gift cards quedan deshabilitadas — igual que en producción iOS.
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(async () => null),
	setItem: jest.fn(async () => { }),
}))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn() } }))
jest.mock('../../api/storeApi', () => ({
	storeApi: { getTopupCatalog: jest.fn(), getVoucherCatalog: jest.fn() },
}))
jest.mock('../../api/marketApi', () => ({
	marketApi: { getStores: jest.fn() },
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { toast } from 'sonner-native'

import { storeApi } from '../../api/storeApi'
import { marketApi } from '../../api/marketApi'
import { useStoreCatalog } from './storeQueries'

const ok = (data) => ({ success: true, data, status: 200 })
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const settle = () => act(async () => { await sleep(20) })

const COUNTRIES = [{ code: 'US', name: 'Estados Unidos' }, { code: 'CU', name: 'Cuba' }]

const wire = () => {
	storeApi.getTopupCatalog.mockImplementation(async (params) => {
		if (params.countries) return ok({ countries: COUNTRIES })
		return ok({ brands: [{ brand: `op-${params.country}` }] })
	})
	marketApi.getStores.mockResolvedValue(ok({ stores: [{ slug: 's1' }] }))
	storeApi.getVoucherCatalog.mockResolvedValue(ok({}))
}

// Se guardan para desmontarlos: un QueryClient vivo deja temporizadores de
// recolección abiertos y jest no llega a cerrar el proceso
let mounted = []

const renderCatalog = async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	})
	const result = { current: null }
	const Harness = () => {
		result.current = useStoreCatalog()
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
	jest.clearAllMocks()
	AsyncStorage.getItem.mockResolvedValue(null)
	AsyncStorage.setItem.mockResolvedValue()
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

describe('selección de país', () => {
	test('sin preferencia guardada cae en Cuba aunque no sea el primero de la lista', async () => {
		const catalog = await renderCatalog()
		expect(catalog.current.topupSelected).toMatchObject({ code: 'CU' })
	})

	test('la preferencia guardada GANA la carrera contra el default', async () => {
		// La restauración llega lenta (después de que los países ya resolvieron):
		// la compuerta selectionRestored evita que el default la pise
		AsyncStorage.getItem.mockImplementation(async () => {
			await sleep(30)
			return JSON.stringify({ code: 'US', name: 'Estados Unidos' })
		})
		const catalog = await renderCatalog()
		await settle()
		expect(catalog.current.topupSelected).toMatchObject({ code: 'US' })
	})

	test('elegir país dispara los operadores de ESE país y persiste la preferencia', async () => {
		const catalog = await renderCatalog()
		expect(catalog.current.topupBrands).toEqual([{ brand: 'op-CU' }])

		await act(async () => { catalog.current.setTopupSelected(COUNTRIES[0]) })
		await settle()
		expect(catalog.current.topupBrands).toEqual([{ brand: 'op-US' }])
		expect(AsyncStorage.setItem).toHaveBeenCalledWith('@store_topup_country', JSON.stringify(COUNTRIES[0]))
	})
})

describe('operadores', () => {
	test('un fallo sin datos previos avisa con toast', async () => {
		storeApi.getTopupCatalog.mockImplementation(async (params) => {
			if (params.countries) return ok({ countries: COUNTRIES })
			return { success: false, error: 'sin cobertura', status: 400 }
		})
		await renderCatalog()
		await settle()
		expect(toast.error).toHaveBeenCalledWith('Operadores', { description: 'sin cobertura' })
	})
})

describe('refresco', () => {
	test('onRefresh revalida todo el catálogo bajo la raíz de la tienda', async () => {
		const catalog = await renderCatalog()
		storeApi.getTopupCatalog.mockClear()
		marketApi.getStores.mockClear()

		await act(async () => { await catalog.current.onRefresh() })
		await settle()

		// Países + operadores del país activo + escaparate del marketplace
		expect(marketApi.getStores).toHaveBeenCalled()
		const modes = storeApi.getTopupCatalog.mock.calls.map(([p]) => p.countries ? 'countries' : p.country)
		expect(new Set(modes)).toEqual(new Set(['countries', 'CU']))
	})
})
