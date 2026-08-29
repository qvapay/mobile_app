/**
 * Unit tests for the P2P offers list hook (fetch, refresh, pagination) — node
 * environment with the APIs, widget bridge and toasts mocked
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../../api/p2pApi', () => ({ p2pApi: { index: jest.fn(), getAverages: jest.fn() } }))
jest.mock('../../api/coinsApi', () => ({ __esModule: true, default: { index: jest.fn() } }))
jest.mock('../../helpers/widgetBridge', () => ({
	updateWidgetP2POffers: jest.fn(),
	reloadWidgets: jest.fn(),
}))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { p2pApi } from '../../api/p2pApi'
import coinsApi from '../../api/coinsApi'
import { updateWidgetP2POffers, reloadWidgets } from '../../helpers/widgetBridge'
import { toast } from 'sonner-native'
import useP2POffers from './useP2POffers'

const PAGE_SIZE = 30
const offers = (count, prefix = 'o') => Array.from({ length: count }, (_, i) => ({ uuid: `${prefix}${i}` }))

// Se guardan para desmontarlos: un QueryClient vivo deja temporizadores de
// recolección abiertos y jest no llega a cerrar el proceso
let clients = []

// React Query notifica vía notifyManager (setTimeout): hay que dejar correr un
// temporizador para que monedas y medias aterricen. Con fake timers activos
// (tests de debounce) se avanza el reloj simulado en su lugar — un setTimeout
// real jamás dispararía y renderOffers se colgaría
const settle = () => act(async () => {
	if (global.setTimeout.clock) { jest.advanceTimersByTime(25) }
	else { await new Promise(r => setTimeout(r, 20)) }
})

const renderOffers = async (props = {}) => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	const result = { current: null }
	let setProps
	const Harness = () => {
		const [state, setState] = React.useState({
			apiFilters: { take: PAGE_SIZE, order: 'desc', orderBy: 'updated_at', type: null },
			p2pEnabled: true,
			quickKey: 'k0',
			...props,
		})
		setProps = (patch) => setState(s => ({ ...s, ...patch }))
		result.current = useP2POffers(state)
		return null
	}
	await act(async () => { create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>) })
	await settle()
	return { result, setProps: (patch) => act(async () => { setProps(patch) }) }
}

afterEach(() => {
	for (const client of clients) { client.clear(); client.unmount() }
	clients = []
})

beforeEach(() => {
	jest.clearAllMocks()
	p2pApi.index.mockResolvedValue({ success: true, offers: [] })
	p2pApi.getAverages.mockResolvedValue({ success: true, data: { BANK_CUP: { average_buy: 400, average_sell: 410 } } })
	coinsApi.index.mockResolvedValue({ success: true, data: [] })
})

describe('mount', () => {
	test('fetches page 1 and the P2P coin catalog once', async () => {
		p2pApi.index.mockResolvedValue({ success: true, offers: offers(3) })
		coinsApi.index.mockResolvedValue({ success: true, data: [{ name: 'Bank', coins: [] }] })
		const { result } = await renderOffers()
		expect(p2pApi.index).toHaveBeenCalledTimes(1)
		expect(p2pApi.index).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
		expect(coinsApi.index).toHaveBeenCalledWith({ enabled_p2p: true })
		expect(result.current.p2pOffers).toHaveLength(3)
		expect(result.current.availableCoins).toEqual([{ name: 'Bank', coins: [] }])
		expect(result.current.isLoading).toBe(false)
	})

	test('fetches nothing while P2P is disabled in settings', async () => {
		await renderOffers({ p2pEnabled: false })
		expect(p2pApi.index).not.toHaveBeenCalled()
	})
})

describe('errors', () => {
	test('an API failure sets the error and toasts it', async () => {
		p2pApi.index.mockResolvedValue({ success: false, error: 'Rate limited' })
		const { result } = await renderOffers()
		expect(result.current.error).toBe('Rate limited')
		expect(toast.error).toHaveBeenCalledWith('Rate limited')
		expect(result.current.refreshing).toBe(false)
	})

	test('a thrown error reports the Spanish connectivity message', async () => {
		p2pApi.index.mockRejectedValue(new Error('boom'))
		const { result } = await renderOffers()
		expect(result.current.error).toBe('Error de conexión')
		expect(toast.error).toHaveBeenCalledWith('Error de conexión')
	})

	// El 400 por requisitos NO es un fallo de carga: la pantalla cambia a la
	// portada de requisitos, así que no se pone un toast rojo encima
	test('un 400 por KYC se expone como requisito y no se toastea', async () => {
		p2pApi.index.mockResolvedValue({ success: false, status: 400, error: 'Debes completar el KYC para acceder al P2P' })
		const { result } = await renderOffers()
		expect(result.current.requirement).toBe('kyc')
		expect(toast.error).not.toHaveBeenCalled()
	})

	test('un 400 de validación de filtros sigue siendo un fallo de carga', async () => {
		p2pApi.index.mockResolvedValue({ success: false, status: 400, error: "Parámetro 'page' inválido" })
		const { result } = await renderOffers()
		expect(result.current.requirement).toBeNull()
		expect(toast.error).toHaveBeenCalledWith("Parámetro 'page' inválido")
	})
})

describe('pagination', () => {
	test('a full page enables load-more, which appends the next page', async () => {
		p2pApi.index.mockResolvedValue({ success: true, offers: offers(PAGE_SIZE) })
		const { result } = await renderOffers()
		p2pApi.index.mockResolvedValue({ success: true, offers: offers(5, 'p2-') })
		await act(async () => { result.current.handleLoadMore() })
		expect(p2pApi.index).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
		expect(result.current.p2pOffers).toHaveLength(PAGE_SIZE + 5)
	})

	test('a short page means no more results — load-more is a no-op', async () => {
		p2pApi.index.mockResolvedValue({ success: true, offers: offers(3) })
		const { result } = await renderOffers()
		await act(async () => { result.current.handleLoadMore() })
		expect(p2pApi.index).toHaveBeenCalledTimes(1)
	})
})

describe('refresh', () => {
	test('onRefresh replaces the list from page 1 and re-arms pagination', async () => {
		p2pApi.index.mockResolvedValue({ success: true, offers: offers(3) })
		const { result } = await renderOffers()
		p2pApi.index.mockResolvedValue({ success: true, offers: offers(2, 'new-') })
		await act(async () => { result.current.onRefresh() })
		expect(result.current.p2pOffers.map(o => o.uuid)).toEqual(['new-0', 'new-1'])
	})

	test('a quickKey change auto-refreshes page 1 tras el debounce (nunca en el primer render)', async () => {
		jest.useFakeTimers()
		try {
			const { setProps } = await renderOffers()
			expect(p2pApi.index).toHaveBeenCalledTimes(1) // mount only
			await setProps({ quickKey: 'k1' })
			// El refetch NO es inmediato: se agrupa para no agotar el rate limit
			expect(p2pApi.index).toHaveBeenCalledTimes(1)
			await act(async () => { jest.advanceTimersByTime(400) })
			expect(p2pApi.index).toHaveBeenCalledTimes(2)
			expect(p2pApi.index).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
		} finally { jest.useRealTimers() }
	})

	test('cambios de filtro seguidos se agrupan en una sola petición', async () => {
		jest.useFakeTimers()
		try {
			const { setProps } = await renderOffers()
			await setProps({ quickKey: 'k1' })
			await setProps({ quickKey: 'k2' })
			await setProps({ quickKey: 'k3' })
			await act(async () => { jest.advanceTimersByTime(400) })
			// 1 del montaje + 1 sola por los tres cambios
			expect(p2pApi.index).toHaveBeenCalledTimes(2)
		} finally { jest.useRealTimers() }
	})

	test('refreshing with the my filter pushes own offers to the home-screen widget', async () => {
		const mine = offers(2, 'mine-')
		p2pApi.index.mockResolvedValue({ success: true, offers: mine })
		const { result } = await renderOffers({
			apiFilters: { take: PAGE_SIZE, order: 'desc', orderBy: 'updated_at', type: null, my: true },
		})
		await act(async () => { result.current.onRefresh() })
		expect(updateWidgetP2POffers).toHaveBeenCalledWith(mine)
		expect(reloadWidgets).toHaveBeenCalled()
	})

	test('widgets are NOT updated without the my filter', async () => {
		p2pApi.index.mockResolvedValue({ success: true, offers: offers(2) })
		await renderOffers()
		expect(updateWidgetP2POffers).not.toHaveBeenCalled()
	})
})

describe('concurrency', () => {
	test('un refresh que llega con otra petición en vuelo se encola y se relanza', async () => {
		let resolveFirst
		p2pApi.index.mockImplementation(() => new Promise(res => { resolveFirst = res }))
		const { result } = await renderOffers()
		result.current.fetchP2POffers(1, true)
		expect(p2pApi.index).toHaveBeenCalledTimes(1)

		p2pApi.index.mockResolvedValue({ success: true, offers: [] })
		await act(async () => { resolveFirst({ success: true, offers: [] }) })
		// El cambio de filtro no se pierde: la lista no se queda en el anterior
		expect(p2pApi.index).toHaveBeenCalledTimes(2)
	})

	test('un "cargar más" encolado durante un refresh se descarta', async () => {
		let resolveFirst
		p2pApi.index.mockImplementation(() => new Promise(res => { resolveFirst = res }))
		const { result } = await renderOffers()
		// Página 2 pedida mientras la lista se está recargando desde la 1: al
		// terminar apuntaría a un listado que ya no existe, y pegaría la página
		// N+1 detrás de la 1 saltándose las intermedias
		result.current.fetchP2POffers(2)
		expect(p2pApi.index).toHaveBeenCalledTimes(1)

		p2pApi.index.mockResolvedValue({ success: true, offers: [] })
		await act(async () => { resolveFirst({ success: true, offers: [] }) })
		expect(p2pApi.index).toHaveBeenCalledTimes(1)
	})
})
