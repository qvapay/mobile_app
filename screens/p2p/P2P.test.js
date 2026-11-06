/**
 * Mercado P2P: lo que los enlaces (CoinDetail, «Ver todas» del depósito Vía P2P, deep
 * links) le piden al listado. Pantalla real con `useP2PFilters` real; se mira con qué
 * filtros se pide `GET /p2p/index`.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: { uuid: 'me', p2p_enabled: 1, kyc: 1, phone_verified: 1, telegram_id: '1' } }) }))
jest.mock('../../ui/P2POfferItem', () => ({ __esModule: true, default: 'P2POfferItem', P2POfferItemSkeleton: 'P2POfferItemSkeleton' }))
jest.mock('../../ui/QPCoinPicker', () => 'QPCoinPicker')
jest.mock('../../ui/particles/QPSwitch', () => 'QPSwitch')
jest.mock('./P2PRequirementsGate', () => 'P2PRequirementsGate')
jest.mock('./P2PFilterBar', () => 'P2PFilterBar')
jest.mock('./P2PFiltersModal', () => 'P2PFiltersModal')
jest.mock('./P2PMarketModal', () => 'P2PMarketModal')
jest.mock('./P2PHeaderMenu', () => 'P2PHeaderMenu')
jest.mock('../../ui/HeaderIdentity', () => 'HeaderIdentity')
jest.mock('../../hooks/useTabBarClearance', () => ({ __esModule: true, default: () => 0 }))
jest.mock('../../hooks/useTabScrollToTop', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('./P2PPromotedSlot', () => 'P2PPromotedSlot')
jest.mock('./p2pQueries', () => ({ useP2PPromoQuery: () => ({ data: null }) }))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }))
jest.mock('../../ui/QPRefreshIndicator', () => ({ createHiddenRefreshControl: () => null }))
jest.mock('../../hooks/OnlineStatusContext', () => ({ useOnlineStatus: () => ({ trackUsers: jest.fn(), untrackUsers: jest.fn() }) }))
jest.mock('../../ui/BottomBarContext', () => ({ useBottomBar: () => ({ bottomBarVisible: { value: 1 } }) }))
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }))
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: 'AnimatedView' },
	useSharedValue: (value) => ({ value }),
	useAnimatedStyle: () => ({}),
	withTiming: (value) => value,
	interpolate: () => 0,
}))
let mockApiFilters = null
jest.mock('./useP2POffers', () => ({
	__esModule: true,
	default: ({ apiFilters }) => {
		mockApiFilters = apiFilters
		return { p2pOffers: [], promoted: null, isLoading: false, error: null, requirement: null, refreshing: false, availableCoins: [], loadingCoins: false, marketAverages: {}, onRefresh: jest.fn(), handleLoadMore: jest.fn() }
	},
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import P2P from './P2P'

const navigation = { navigate: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()) }
const screen = (params) => <P2P navigation={navigation} route={{ key: 'p2p', name: 'P2P', params }} />
const open = async (params) => {
	let tree
	await act(async () => { tree = create(screen(params)) })
	return tree
}
const followLink = (tree, params) => act(async () => { tree.update(screen(params)) })
const badges = (tree) => tree.root.findByType('P2PFilterBar').props.activeFilterBadges.map(badge => badge.key)
const setFilter = (tree, field, value) => act(async () => { tree.root.findByType('P2PFiltersModal').props.setFilter(field, value) })

// «Ver todas» de una moneda en la que la tesorería tiene ofertas
const TREASURY_LINK = { coin: 'ETECSA', coinName: 'ETECSA', type: 'sell', sort: 'best_rate', peer: 'skymind', key: 1 }

describe('links to the market', () => {
	test('a link with a peer lists only that merchant and says so', async () => {
		const tree = await open(TREASURY_LINK)
		expect(mockApiFilters).toMatchObject({ coin: 'ETECSA', type: 'sell', orderBy: 'best_rate', peer: 'skymind' })
		expect(badges(tree)).toEqual(['peer'])
	})

	test.each([
		['«Ver todas» of a coin the treasury does not sell', { coin: 'BANK_MLC', coinName: 'MLC', type: 'sell', sort: 'best_rate', key: 2 }, 'BANK_MLC'],
		['CoinDetail', { coin: 'USDT', coinName: 'USDT' }, 'USDT'],
		['the same coin from CoinDetail', { coin: 'ETECSA', coinName: 'ETECSA' }, 'ETECSA'],
	])('a later link without a peer drops the previous one: %s', async (_, link, coin) => {
		const tree = await open(TREASURY_LINK)
		await followLink(tree, link)
		expect(mockApiFilters.coin).toBe(coin)
		expect(mockApiFilters).not.toHaveProperty('peer')
		expect(badges(tree)).toEqual([])
	})

	test('a later link with another peer replaces it', async () => {
		const tree = await open(TREASURY_LINK)
		await followLink(tree, { coin: 'BANK_CUP', peer: 'otro', key: 2 })
		expect(mockApiFilters).toMatchObject({ coin: 'BANK_CUP', peer: 'otro' })
	})

	test('entering the tab with no params leaves everything as it was', async () => {
		const tree = await open(TREASURY_LINK)
		await followLink(tree, undefined)
		expect(mockApiFilters).toMatchObject({ coin: 'ETECSA', peer: 'skymind' })
		expect(badges(tree)).toEqual(['peer'])
	})

	test('a link clears what was set on the Index and applies what it brings', async () => {
		const tree = await open(undefined)
		await setFilter(tree, 'opAmount', '50')
		await setFilter(tree, 'ratioMin', '300')
		await setFilter(tree, 'ratioMax', '400')
		await setFilter(tree, 'onlyVip', true)
		await setFilter(tree, 'sortIndex', 1)
		expect(badges(tree)).toEqual(['opAmount', 'ratioMin', 'ratioMax', 'onlyVip'])

		await followLink(tree, { coin: 'USDT', offer_type: 'buy' })
		expect(mockApiFilters).toEqual({ take: 30, order: 'desc', orderBy: 'updated_at', type: 'buy', coin: 'USDT' })
		expect(badges(tree)).toEqual([])
	})

	test('a link that only picks the side also clears the rest', async () => {
		const tree = await open(TREASURY_LINK)
		await followLink(tree, { offer_type: 'buy' })
		expect(mockApiFilters).toEqual({ take: 30, order: 'desc', orderBy: 'updated_at', type: 'buy' })
		expect(badges(tree)).toEqual([])
	})

	test('in My offers a link changes nothing, and leaving it does not apply it late', async () => {
		const tree = await open(undefined)
		await setFilter(tree, 'showMine', true)
		await setFilter(tree, 'opAmount', '50')
		const mine = mockApiFilters
		expect(mine).toMatchObject({ my: true, min: 50 })

		await followLink(tree, { coin: 'USDT', offer_type: 'buy', peer: 'skymind', sort: 'best_rate' })
		expect(mockApiFilters).toEqual(mine)

		await setFilter(tree, 'showMine', false)
		expect(mockApiFilters).not.toHaveProperty('coin')
		expect(mockApiFilters).not.toHaveProperty('peer')
		expect(mockApiFilters).toMatchObject({ type: 'sell', min: 50 })
	})
})
