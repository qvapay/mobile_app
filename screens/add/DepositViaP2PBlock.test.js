/**
 * Bloque «Vía P2P» del depósito: ofertas de tesorería con requisitos ✓/✗ según el
 * propio perfil, mercado con la promocionada primera, vacío, y el gate de acceso al
 * P2P (local o del servidor) que no pide nada. El enlace abre el mercado filtrado.
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
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('./addQueries', () => ({ useViaP2PShowcaseQuery: jest.fn(), viaP2PShowcaseKey: (tick) => ['add', 'via-p2p', tick] }))
jest.mock('../p2p/p2pQueries', () => ({ useP2pMarketAveragesQuery: () => ({ data: { ETECSA: { average: 300 } } }) }))
jest.mock('../p2p/usePeerProfile', () => ({ usePeerProfile: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../../auth/AuthContext'
import { useViaP2PShowcaseQuery } from './addQueries'
import { usePeerProfile } from '../p2p/usePeerProfile'
import DepositViaP2PBlock from './DepositViaP2PBlock'

const { theme } = jest.requireMock('../../theme/ThemeContext').useTheme()
const ETECSA = { tick: 'ETECSA', name: 'Saldo ETECSA', enabled_in: 0 }
// Perfil con acceso completo al P2P (los 4 gates), cuenta de hace 60 días
const FULL_USER = { uuid: 'me', p2p_enabled: 1, kyc: 1, phone_verified: 1, telegram_id: '1', createdAt: '2026-09-04T00:00:00Z', trustscore: 0 }
const offer = (uuid, extra = {}) => ({ uuid, coin: 'ETECSA', type: 'sell', requirements: { min_completed: 10, min_rating: 4, min_account_days: 30 }, ...extra })

let clients = []
const render = () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	const navigation = { navigate: jest.fn() }
	let tree
	act(() => { tree = create(<QueryClientProvider client={client}><DepositViaP2PBlock coin={ETECSA} navigation={navigation} /></QueryClientProvider>) })
	return { tree, navigation, client }
}
const text = (tree) => JSON.stringify(tree.toJSON())
const byId = (tree, id) => tree.root.findAll(n => n.props.testID === id && typeof n.type === 'string')

beforeEach(() => {
	jest.clearAllMocks()
	useAuth.mockReturnValue({ user: FULL_USER })
	usePeerProfile.mockReturnValue({ data: null })
	useViaP2PShowcaseQuery.mockReturnValue({ data: undefined, isPending: false, error: null })
})
afterEach(() => {
	for (const client of clients) { client.clear(); client.unmount() }
	clients = []
})

test('tesorería: las ofertas con la celda del mercado, los requisitos con ✓/✗ y «aún no cumples»', () => {
	useViaP2PShowcaseQuery.mockReturnValue({ data: { source: 'treasury', offers: [offer('t1'), offer('t2')], promotedUuid: null }, isPending: false, error: null })
	// 12 operaciones y rating 4.6, pero cuenta de 60 días… y 30 exigidos: cumple todo
	usePeerProfile.mockReturnValue({ data: { user: { createdAt: '2026-09-04T00:00:00Z' }, stats: { completedP2P: 3, averageRating: 4.6 } } })
	const { tree } = render()
	expect(useViaP2PShowcaseQuery).toHaveBeenCalledWith('ETECSA', { enabled: true, vip: false })
	// Solo con requisitos que contrastar se pide el perfil propio
	expect(usePeerProfile).toHaveBeenLastCalledWith('me')
	const items = tree.root.findAllByType('P2POfferItem')
	expect(items.map(i => [i.props.offer.uuid, i.props.promoted])).toEqual([['t1', false], ['t2', false]])
	expect(items[0].props.marketAverage).toEqual({ average: 300 })
	expect(byId(tree, 'via-p2p-requirement-min_completed-missing')).toHaveLength(1)
	expect(byId(tree, 'via-p2p-requirement-min_rating-met')).toHaveLength(1)
	expect(byId(tree, 'via-p2p-requirement-min_account_days-met')).toHaveLength(1)
	expect(text(tree)).toContain('Aún no cumples: 10+ operaciones completadas. Puedes verlas, pero no tomarlas todavía.')
	expect(text(tree)).toContain('tesorería de QvaPay (@skymind): recargas el número que indica la oferta')
})

test('sin perfil aún, los chips van neutros y no se afirma nada', () => {
	useViaP2PShowcaseQuery.mockReturnValue({ data: { source: 'treasury', offers: [offer('t1')], promotedUuid: null }, isPending: false, error: null })
	const { tree } = render()
	expect(byId(tree, 'via-p2p-requirement-min_completed-unknown')).toHaveLength(1)
	expect(byId(tree, 'via-p2p-not-met')).toHaveLength(0)
})

test('«ver todas» con tesorería abre el mercado en Comprar, por mejor tasa y solo @skymind', () => {
	useViaP2PShowcaseQuery.mockReturnValue({ data: { source: 'treasury', offers: [offer('t1')], promotedUuid: null }, isPending: false, error: null })
	const { tree, navigation } = render()
	act(() => { byId(tree, 'via-p2p-see-all')[0].props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith('MainStack', { screen: 'P2P', params: expect.objectContaining({ coin: 'ETECSA', coinName: 'Saldo ETECSA', type: 'sell', sort: 'best_rate', peer: 'skymind', key: expect.any(Number) }) })
})

test('mercado: la promocionada lleva su chip, sin chips de requisitos, y el enlace va sin peer', () => {
	useViaP2PShowcaseQuery.mockReturnValue({ data: { source: 'market', offers: [offer('p1'), offer('m1')], promotedUuid: 'p1' }, isPending: false, error: null })
	const { tree, navigation } = render()
	expect(tree.root.findAllByType('P2POfferItem').map(i => [i.props.offer.uuid, i.props.promoted])).toEqual([['p1', true], ['m1', false]])
	expect(byId(tree, 'via-p2p-requirement-min_completed-unknown')).toHaveLength(0)
	expect(usePeerProfile).toHaveBeenLastCalledWith('')
	expect(text(tree)).toContain('la tesorería de QvaPay no tiene ofertas abiertas en Saldo ETECSA')
	act(() => { byId(tree, 'via-p2p-see-all')[0].props.onPress() })
	expect(navigation.navigate.mock.calls[0][1].params.peer).toBeUndefined()
})

test('sin ofertas en ninguna fuente: estado vacío y el enlace al mercado', () => {
	useViaP2PShowcaseQuery.mockReturnValue({ data: { source: 'market', offers: [], promotedUuid: null }, isPending: false, error: null })
	const { tree } = render()
	expect(byId(tree, 'via-p2p-empty')).toHaveLength(1)
	expect(tree.root.findAllByType('P2POfferItem')).toHaveLength(0)
})

test('cargando: esqueletos de la celda', () => {
	useViaP2PShowcaseQuery.mockReturnValue({ data: undefined, isPending: true, error: null })
	const { tree } = render()
	expect(tree.root.findAllByType('P2POfferItemSkeleton')).toHaveLength(2)
})

test('sin acceso al P2P no se pide nada: se dice qué falta y el enlace lleva a completarlo', () => {
	useAuth.mockReturnValue({ user: { ...FULL_USER, telegram_id: null } })
	const { tree } = render()
	expect(useViaP2PShowcaseQuery).toHaveBeenCalledWith('ETECSA', { enabled: false, vip: false })
	expect(byId(tree, 'via-p2p-gate')).toHaveLength(1)
	expect(text(tree)).toContain('Completar los requisitos del P2P')
})

test('un 400 del servidor por requisito de acceso (perfil local desfasado) es el mismo gate', () => {
	const error = new Error('Necesitas KYC para usar el P2P'); error.status = 400
	useViaP2PShowcaseQuery.mockReturnValue({ data: undefined, isPending: false, error })
	const { tree } = render()
	expect(byId(tree, 'via-p2p-gate')).toHaveLength(1)
})

test('un VIP pide el escaparate con vip=true (ve también las only_vip)', () => {
	useAuth.mockReturnValue({ user: { ...FULL_USER, vip: 1 } })
	render()
	expect(useViaP2PShowcaseQuery).toHaveBeenCalledWith('ETECSA', { enabled: true, vip: true })
})

test('al recuperar el foco (vuelta del detalle) se revalida; el primer foco no', () => {
	useViaP2PShowcaseQuery.mockReturnValue({ data: { source: 'market', offers: [], promotedUuid: null }, isPending: false, error: null })
	const { client } = render()
	const invalidate = jest.spyOn(client, 'invalidateQueries')
	const onFocus = useFocusEffect.mock.calls[0][0]
	act(() => { onFocus() })
	expect(invalidate).not.toHaveBeenCalled()
	act(() => { onFocus() })
	expect(invalidate).toHaveBeenCalledWith({ queryKey: ['add', 'via-p2p', 'ETECSA'] })
})

test('mientras carga, «Ver todas» espera: aún no se sabe si lleva a la tesorería o al mercado', () => {
	useViaP2PShowcaseQuery.mockReturnValue({ data: undefined, isPending: true, error: null })
	const { tree } = render()
	const link = byId(tree, 'via-p2p-see-all')[0]
	expect(link.props.disabled).toBe(true)
	expect(link.findByType('FontAwesome6').props.color).toBe(theme.colors.secondaryText)
})

test('con las ofertas ya cargadas, «Ver todas» se puede tocar', () => {
	useViaP2PShowcaseQuery.mockReturnValue({ data: { source: 'treasury', offers: [offer('t1')], promotedUuid: null }, isPending: false, error: null })
	const { tree } = render()
	const link = byId(tree, 'via-p2p-see-all')[0]
	expect(link.props.disabled).toBe(false)
	expect(link.findByType('FontAwesome6').props.color).toBe(theme.colors.primary)
})

test('sin acceso al P2P el enlace sigue activo aunque la query esté parada: lleva a completar el perfil', () => {
	useAuth.mockReturnValue({ user: { ...FULL_USER, kyc: 0 } })
	useViaP2PShowcaseQuery.mockReturnValue({ data: undefined, isPending: true, error: null })
	const { tree } = render()
	expect(byId(tree, 'via-p2p-see-all')[0].props.disabled).toBe(false)
})
