/**
 * Tests del feed de Home sobre React Query.
 *
 * El test que de verdad importa es el del refresco EN PARALELO. La versión
 * anterior encadenaba los `await` (perfil → transacciones → quick-pay → blog →
 * watchlist → promo), acumulando una latencia tras otra en cada tirón; este
 * test falla contra aquella implementación y pasa contra esta.
 *
 * La técnica: se bloquea la respuesta de TODAS las APIs con una compuerta sin
 * resolver y se comprueba que todas las llamadas ya han salido. Encadenadas,
 * solo habría salido la primera.
 * @jest-environment node
 */
jest.mock('@d11/react-native-fast-image', () => ({ preload: jest.fn() }))
jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ updateUser: jest.fn() }) }))
jest.mock('../../helpers/versionCheck', () => ({ maybePromptUpdate: jest.fn(async () => null) }))

jest.mock('../../api/userApi', () => ({ userApi: { getUserProfile: jest.fn() } }))
jest.mock('../../api/transferApi', () => ({
	transferApi: { getLatestTransactions: jest.fn(), getLatestSentTransfers: jest.fn() },
}))
jest.mock('../../api/blogApi', () => ({ blogApi: { getLatestPosts: jest.fn() } }))
jest.mock('../../api/coinsApi', () => ({ coinsApi: { priceHistory: jest.fn() } }))
jest.mock('../../api/promoApi', () => ({ promoApi: { getPromo: jest.fn() } }))
jest.mock('../../api/announcementApi', () => ({ announcementApi: { getAnnouncement: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { userApi } from '../../api/userApi'
import { transferApi } from '../../api/transferApi'
import { blogApi } from '../../api/blogApi'
import { coinsApi } from '../../api/coinsApi'
import { promoApi } from '../../api/promoApi'
import { announcementApi } from '../../api/announcementApi'
import useHomeFeed from './useHomeFeed'

// Llamadas registradas y compuerta que retiene las respuestas
let started = []
let gate = Promise.resolve()

const ok = (data) => ({ success: true, data, status: 200 })

const wire = () => {
	const record = (name, payload) => jest.fn(async () => {
		started.push(name)
		await gate
		return payload
	})
	userApi.getUserProfile = record('profile', ok({ uuid: 'u1' }))
	transferApi.getLatestTransactions = record('transactions', ok([]))
	transferApi.getLatestSentTransfers = record('quickpay', ok([]))
	blogApi.getLatestPosts = record('blog', ok([]))
	promoApi.getPromo = record('promo', ok(null))
	announcementApi.getAnnouncement = record('announcement', ok(null))
	// La watchlist pide 4 monedas; cuenta como una sola fuente
	coinsApi.priceHistory = jest.fn(async () => {
		started.push('watchlist')
		await gate
		return ok([{ value: 1 }, { value: 2 }])
	})
}

// Se guardan para desmontarlos: un QueryClient vivo deja temporizadores de
// recolección abiertos y jest no llega a cerrar el proceso
let mounted = []

const renderFeed = async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	})
	const result = { current: null }
	const Harness = () => {
		result.current = useHomeFeed()
		return null
	}
	let tree
	await act(async () => {
		tree = create(<QueryClientProvider client={client}>{<Harness />}</QueryClientProvider>)
	})
	mounted.push({ tree, client })
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

describe('refresco', () => {
	test('todas las fuentes salen EN PARALELO, no encadenadas', async () => {
		const feed = await renderFeed()

		// Las APIs retienen su respuesta 100ms. La compuerta se abre SOLA: si
		// quedara pendiente, una implementación encadenada colgaría la suite en vez
		// de reportar un fallo limpio
		started = []
		gate = new Promise(resolve => setTimeout(resolve, 100))

		let refreshDone
		await act(async () => {
			refreshDone = feed.current.onRefresh()
			// Se mira ANTES de que llegue ninguna respuesta
			await new Promise(resolve => setTimeout(resolve, 20))
		})

		// Encadenado, a los 20ms solo constaría la primera fuente
		expect(new Set(started)).toEqual(
			new Set(['profile', 'transactions', 'quickpay', 'blog', 'watchlist', 'promo', 'announcement'])
		)

		await act(async () => { await refreshDone })
	})

	test('refreshing sube y baja en el tirón (BalanceCard lo usa como flanco)', async () => {
		const feed = await renderFeed()
		expect(feed.current.refreshing).toBe(false)

		let refreshDone
		gate = new Promise(resolve => setTimeout(resolve, 100))
		await act(async () => {
			refreshDone = feed.current.onRefresh()
			await new Promise(resolve => setTimeout(resolve, 20))
		})
		expect(feed.current.refreshing).toBe(true)

		await act(async () => { await refreshDone })
		expect(feed.current.refreshing).toBe(false)
	})
})

describe('forma devuelta', () => {
	test('mantiene el contrato que consume Home.jsx', async () => {
		const feed = await renderFeed()
		expect(Object.keys(feed.current).sort()).toEqual([
			'announcement', 'dismissUpdate', 'latestBlogPosts',
			'latestSentTransfersUsers', 'latestTransactions', 'onRefresh', 'promo',
			'refreshing', 'txError', 'txLoading', 'updateInfo', 'watchlistData',
		])
	})

	test('las listas nunca son undefined, aunque no haya datos', async () => {
		const feed = await renderFeed()
		expect(Array.isArray(feed.current.latestTransactions)).toBe(true)
		expect(Array.isArray(feed.current.latestSentTransfersUsers)).toBe(true)
		expect(Array.isArray(feed.current.latestBlogPosts)).toBe(true)
		expect(Array.isArray(feed.current.watchlistData)).toBe(true)
	})
})

describe('aviso global', () => {

	// React Query notifica vía notifyManager (setTimeout): sin asentar con un
	// temporizador real, el harness lee el render anterior al de los datos
	const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }

	test('un aviso vigente llega tal cual a la pantalla', async () => {
		const aviso = { id: '7', title: 'Mantenimiento', dismiss_days: 3, ends_at: null }
		announcementApi.getAnnouncement = jest.fn(async () => ok(aviso))
		const feed = await renderFeed()
		await settle()
		expect(feed.current.announcement).toEqual(aviso)
	})

	test('uno con ends_at futuro también', async () => {
		const aviso = { id: '8', title: 'Vigente', dismiss_days: 0, ends_at: new Date(Date.now() + 60_000).toISOString() }
		announcementApi.getAnnouncement = jest.fn(async () => ok(aviso))
		const feed = await renderFeed()
		await settle()
		expect(feed.current.announcement).toEqual(aviso)
	})

	test('uno YA caducado no se resucita desde la caché persistida', async () => {
		// El backend nunca lo mandaría, pero en arranque en frío la pantalla pinta
		// lo persistido antes de revalidar: ahí `ends_at` es la única defensa
		const aviso = { id: '9', title: 'Terminado', dismiss_days: 0, ends_at: new Date(Date.now() - 60_000).toISOString() }
		announcementApi.getAnnouncement = jest.fn(async () => ok(aviso))
		const feed = await renderFeed()
		await settle()
		expect(feed.current.announcement).toBeNull()
	})
})
