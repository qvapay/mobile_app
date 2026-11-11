/**
 * Catálogo de mini-apps: las invitaciones de prueba van arriba (aceptar abre
 * la mini-app), cada sin publicar lleva su etiqueta según quién la ve, y
 * tirar para refrescar relee directorio e invitaciones.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true), isDark: true }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('react-native-linear-gradient', () => 'LinearGradient')
jest.mock('@d11/react-native-fast-image', () => 'FastImage')
jest.mock('react-native-haptic-feedback', () => ({ trigger: jest.fn() }))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn() } }))
// Lista plana: cabecera, filas y pie, para poder mirar dentro
jest.mock('@shopify/flash-list', () => {
	const React = require('react')
	return {
		FlashList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent }) => React.createElement(
			React.Fragment, null,
			ListHeaderComponent,
			...(data ?? []).map(item => React.createElement(React.Fragment, { key: item.slug }, renderItem({ item }))),
			data?.length ? null : ListEmptyComponent,
			ListFooterComponent,
		),
	}
})
jest.mock('../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../ui/particles/QPLoader', () => 'QPLoader')
const mockRefresh = { onRefresh: null }
jest.mock('../../ui/QPRefreshIndicator', () => ({ createHiddenRefreshControl: (refreshing, onRefresh) => { mockRefresh.onRefresh = onRefresh; return null } }))
jest.mock('../../hooks/useContentPadding', () => () => ({}))
jest.mock('./MiniAppIcon', () => 'MiniAppIcon')
jest.mock('./MiniAppActionsSheet', () => 'MiniAppActionsSheet')
jest.mock('./MiniAppInviteCard', () => 'MiniAppInviteCard')
jest.mock('./useMiniAppFavorites', () => ({ __esModule: true, default: () => ({ favorites: [], isFavorite: () => false }) }))
jest.mock('./useMiniAppTesting', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('./miniappsQueries', () => ({ useMiniAppsList: jest.fn(), useMiniAppInvites: jest.fn() }))

import React from 'react'
import { Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import MiniApps from './MiniApps'
import useMiniAppTesting from './useMiniAppTesting'
import { useMiniAppsList, useMiniAppInvites } from './miniappsQueries'

const INVITE = (slug, name = slug) => ({ slug, name, icon: `apps/${slug}.png`, tagline: null, category: 'shopping', merchant: null, invited_by: { username: 'pepe' }, created_at: '2026-11-11T12:00:00.000Z' })
const APP = (slug, extra = {}) => ({ slug, name: slug, icon: null, tagline: null, category: 'tools', featured: false, merchant: null, ...extra })

let answer
let navigation
let refetchList
let refetchInvites

const render = ({ apps = [APP('live')], invites, pending = null } = {}) => {
	refetchList = jest.fn(async () => ({}))
	refetchInvites = jest.fn(async () => ({}))
	useMiniAppsList.mockReturnValue({ data: apps, isPending: false, isError: false, error: null, refetch: refetchList })
	useMiniAppInvites.mockReturnValue({ data: invites, refetch: refetchInvites })
	useMiniAppTesting.mockReturnValue({ answer, pending })
	navigation = { navigate: jest.fn() }
	let tree
	act(() => { tree = create(<MiniApps navigation={navigation} route={{ key: 'MiniApps', name: 'MiniApps' }} />) })
	const texts = () => tree.root.findAllByType(Text).map(node => [].concat(node.props.children).join(''))
	const cards = () => tree.root.findAllByType('MiniAppInviteCard')
	return { tree, texts, cards }
}

beforeEach(() => {
	jest.clearAllMocks()
	answer = jest.fn(async () => true)
})

describe('invitaciones de prueba', () => {

	test('sin invitaciones (o un qpweb sin la ruta) no hay sección', () => {
		for (const invites of [undefined, []]) {
			const { texts, cards } = render({ invites })
			expect(cards()).toHaveLength(0)
			expect(texts()).not.toContain('Invitaciones de prueba')
		}
	})

	test('una tarjeta por invitación, arriba del catálogo', () => {
		const { texts, cards } = render({ invites: [INVITE('shop'), INVITE('game')] })
		expect(texts()[0]).toBe('Invitaciones de prueba')
		expect(cards().map(card => card.props.invite.slug)).toEqual(['shop', 'game'])
		expect(cards().every(card => card.props.answering === null && card.props.disabled === false)).toBe(true)
	})

	test('aceptar la abre en el host', async () => {
		const { cards } = render({ invites: [INVITE('shop', 'Mi Tienda')] })
		await act(async () => { cards()[0].props.onAccept() })
		expect(answer).toHaveBeenCalledWith(INVITE('shop', 'Mi Tienda'), true)
		expect(navigation.navigate).toHaveBeenCalledWith('MiniAppHost', { slug: 'shop', name: 'Mi Tienda', icon: 'apps/shop.png' })
	})

	test('si aceptar falla, no abre nada', async () => {
		answer = jest.fn(async () => false)
		const { cards } = render({ invites: [INVITE('shop')] })
		await act(async () => { cards()[0].props.onAccept() })
		expect(navigation.navigate).not.toHaveBeenCalled()
	})

	test('rechazar no abre nada', async () => {
		const { cards } = render({ invites: [INVITE('shop')] })
		await act(async () => { cards()[0].props.onDecline() })
		expect(answer).toHaveBeenCalledWith(INVITE('shop'), false)
		expect(navigation.navigate).not.toHaveBeenCalled()
	})

	test('con una respuesta en vuelo: su tarjeta cargando y todas apagadas', () => {
		const { cards } = render({ invites: [INVITE('shop'), INVITE('game')], pending: { slug: 'game', accept: false } })
		expect(cards().map(card => card.props.answering)).toEqual([null, 'decline'])
		expect(cards().every(card => card.props.disabled)).toBe(true)
	})

	test('tirar para refrescar relee el directorio y las invitaciones', async () => {
		render({ invites: [] })
		await act(async () => { await mockRefresh.onRefresh() })
		expect(refetchList).toHaveBeenCalled()
		expect(refetchInvites).toHaveBeenCalled()
	})
})

describe('etiqueta de las sin publicar', () => {

	test('«Vista previa» para el dueño (también sin preview_role), «En prueba» para el tester, nada si está publicada', () => {
		const { texts } = render({
			apps: [
				APP('mine', { preview: true, preview_role: 'owner' }),
				APP('legacy', { preview: true }),
				APP('invited', { preview: true, preview_role: 'tester' }),
				APP('live'),
			],
		})
		const all = texts()
		expect(all.filter(text => text === 'Vista previa')).toHaveLength(2)
		expect(all.filter(text => text === 'En prueba')).toHaveLength(1)
	})
})
