/**
 * Unit tests for the P2P offers list hook (fetch, refresh, pagination) — node
 * environment with the APIs, widget bridge and toasts mocked
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../../api/p2pApi', () => ({ p2pApi: { index: jest.fn() } }))
jest.mock('../../api/coinsApi', () => ({ __esModule: true, default: { index: jest.fn() } }))
jest.mock('../../helpers/widgetBridge', () => ({
	updateWidgetP2POffers: jest.fn(),
	reloadWidgets: jest.fn(),
}))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('../../helpers/dataCache', () => ({
	CACHE_KEYS: { P2P_OFFERS: 'p2p_offers', P2P_COINS: 'p2p_coins' },
	readCache: jest.fn(async () => null),
	writeCache: jest.fn(),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { p2pApi } from '../../api/p2pApi'
import coinsApi from '../../api/coinsApi'
import { updateWidgetP2POffers, reloadWidgets } from '../../helpers/widgetBridge'
import { toast } from 'sonner-native'
import useP2POffers from './useP2POffers'

const PAGE_SIZE = 30
const offers = (count, prefix = 'o') => Array.from({ length: count }, (_, i) => ({ uuid: `${prefix}${i}` }))

const renderOffers = async (props = {}) => {
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
	await act(async () => { create(<Harness />) })
	return { result, setProps: (patch) => act(async () => { setProps(patch) }) }
}

beforeEach(() => {
	jest.clearAllMocks()
	p2pApi.index.mockResolvedValue({ success: true, offers: [] })
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

	test('a quickKey change auto-refreshes page 1 (but not on first render)', async () => {
		const { setProps } = await renderOffers()
		expect(p2pApi.index).toHaveBeenCalledTimes(1) // mount only
		await setProps({ quickKey: 'k1' })
		expect(p2pApi.index).toHaveBeenCalledTimes(2)
		expect(p2pApi.index).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
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
	test('concurrent fetches are dropped, not queued', async () => {
		let resolveFirst
		p2pApi.index.mockImplementation(() => new Promise(res => { resolveFirst = res }))
		const { result } = await renderOffers()
		// mount fetch still in flight — these must be ignored
		result.current.fetchP2POffers(1, true)
		result.current.fetchP2POffers(2)
		expect(p2pApi.index).toHaveBeenCalledTimes(1)
		await act(async () => { resolveFirst({ success: true, offers: [] }) })
	})
})
