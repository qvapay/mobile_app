/**
 * Escaparate «Vía P2P» con la query real: al cambiar de moneda, el bloque nunca enseña
 * las ofertas de la anterior. La composición y los estados del bloque se prueban en
 * depositViaP2P.test.js y DepositViaP2PBlock.test.js.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../ui/P2POfferItem', () => ({ __esModule: true, default: 'P2POfferItem', P2POfferItemSkeleton: 'P2POfferItemSkeleton' }))
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }))
jest.mock('../../auth/AuthContext', () => ({
	useAuth: () => ({ user: { uuid: 'me', p2p_enabled: 1, kyc: 1, phone_verified: 1, telegram_id: '1', created_at: '2026-09-04T00:00:00Z', trustscore: 0 } }),
}))
jest.mock('../p2p/p2pQueries', () => ({ useP2pMarketAveragesQuery: () => ({ data: {} }) }))
jest.mock('../p2p/usePeerProfile', () => ({ usePeerProfile: () => ({ data: null }) }))
jest.mock('../../api/p2pApi', () => ({ p2pApi: { index: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { p2pApi } from '../../api/p2pApi'
import DepositViaP2PBlock from './DepositViaP2PBlock'

const ETECSA = { tick: 'ETECSA', name: 'ETECSA', enabled_in: 0 }
const MLC = { tick: 'BANK_MLC', name: 'MLC', enabled_in: 0 }
const offersOf = (coin) => ({ success: true, offers: [{ uuid: `${coin}-1`, coin, type: 'sell' }] })

let client
const block = (coin) => <QueryClientProvider client={client}><DepositViaP2PBlock coin={coin} navigation={{ navigate: jest.fn() }} /></QueryClientProvider>
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
const shownOffers = (tree) => tree.root.findAllByType('P2POfferItem').map(item => item.props.offer.coin)

beforeEach(() => {
	jest.clearAllMocks()
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	p2pApi.index.mockImplementation(async ({ coin }) => offersOf(coin))
})
afterEach(() => {
	client.clear()
	client.unmount()
})

test('switching coin shows the skeleton until its own offers arrive, never the previous ones', async () => {
	let tree
	await act(async () => { tree = create(block(ETECSA)) })
	await settle()
	expect(shownOffers(tree)).toEqual(['ETECSA'])

	const answers = []
	p2pApi.index.mockImplementation(({ coin }) => new Promise((resolve) => { answers.push(() => resolve(offersOf(coin))) }))
	await act(async () => { tree.update(block(MLC)) })
	await settle()
	expect(answers).toHaveLength(2) // tesorería y mercado de MLC
	expect(shownOffers(tree)).toEqual([])
	expect(tree.root.findAllByType('P2POfferItemSkeleton').length).toBeGreaterThan(0)

	await act(async () => { answers.forEach(answer => answer()) })
	await settle()
	expect(shownOffers(tree)).toEqual(['BANK_MLC'])
	expect(tree.root.findAllByType('P2POfferItemSkeleton')).toHaveLength(0)
})

test('coming back to a coin shows its own offers right away, without asking again', async () => {
	let tree
	await act(async () => { tree = create(block(ETECSA)) })
	await settle()
	await act(async () => { tree.update(block(MLC)) })
	await settle()
	p2pApi.index.mockClear()
	await act(async () => { tree.update(block(ETECSA)) })
	expect(shownOffers(tree)).toEqual(['ETECSA'])
	await settle()
	expect(p2pApi.index).not.toHaveBeenCalled() // dentro de los 30 s de frescura
})

test('a refresh of the same coin keeps its offers on screen', async () => {
	let tree
	await act(async () => { tree = create(block(ETECSA)) })
	await settle()
	p2pApi.index.mockImplementation(() => new Promise(() => {}))
	await act(async () => { client.invalidateQueries({ queryKey: ['add', 'via-p2p', 'ETECSA'] }) })
	await settle()
	expect(shownOffers(tree)).toEqual(['ETECSA'])
})
