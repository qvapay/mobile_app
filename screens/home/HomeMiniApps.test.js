/**
 * Fila de mini-apps del Home: favoritas primero, luego destacadas hasta seis,
 * cada icono abre la mini-app y mantenerlo pulsado abre su menú, «Ver todas»
 * abre el catálogo, sin apps no ocupa nada, y las favoritas se publican como
 * accesos rápidos del icono de la app.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../ui/particles/QPSectionHeader', () => 'QPSectionHeader')
jest.mock('../miniapps/MiniAppIcon', () => 'MiniAppIcon')
jest.mock('../miniapps/miniappsQueries', () => ({ useMiniAppsList: jest.fn() }))
jest.mock('../miniapps/MiniAppActionsSheet', () => 'MiniAppActionsSheet')
jest.mock('../miniapps/useMiniAppFavorites', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('../../helpers/miniAppShortcuts', () => ({ setMiniAppQuickActions: jest.fn() }))
jest.mock('react-native-haptic-feedback', () => ({ __esModule: true, default: { trigger: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import HomeMiniApps from './HomeMiniApps'
import { useMiniAppsList } from '../miniapps/miniappsQueries'
import useMiniAppFavorites from '../miniapps/useMiniAppFavorites'
import { setMiniAppQuickActions } from '../../helpers/miniAppShortcuts'
import { ROUTES } from '../../routes'

const app = (slug, extra = {}) => ({ slug, name: slug, icon: null, featured: false, ...extra })

beforeEach(() => {
	jest.clearAllMocks()
	useMiniAppFavorites.mockReturnValue({ favorites: [], ready: true, isFavorite: () => false, toggle: jest.fn() })
})

const render = (data, favorites = [], { ready = true } = {}) => {
	useMiniAppsList.mockReturnValue({ data })
	useMiniAppFavorites.mockReturnValue({ favorites, ready, isFavorite: slug => favorites.includes(slug), toggle: jest.fn() })
	const navigation = { navigate: jest.fn() }
	const onSeeAll = jest.fn()
	let tree
	act(() => { tree = create(<HomeMiniApps navigation={navigation} onSeeAll={onSeeAll} />) })
	return { tree, navigation, onSeeAll }
}

test('destacadas primero, seis como mucho, con icono y nombre', () => {
	const apps = [app('a'), app('b'), app('c'), app('d'), app('e'), app('f', { featured: true }), app('g', { featured: true })]
	const { tree } = render(apps)
	const icons = tree.root.findAllByType('MiniAppIcon')
	expect(icons.map(icon => icon.props.app.slug)).toEqual(['f', 'g', 'a', 'b', 'c', 'd'])
	expect(icons[0].props.size).toBe(56)
	expect(tree.root.findByType('QPSectionHeader').props.title).toBe('Mini-apps')
	expect(JSON.stringify(tree.toJSON())).toContain('"f"')
})

test('tocar una abre el host con slug, nombre e icono', () => {
	const { tree, navigation } = render([app('domino', { name: 'Dominó', icon: 'apps/d.png' })])
	act(() => { tree.root.findByProps({ testID: 'home-miniapp-domino' }).props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.MINIAPP_HOST, { slug: 'domino', name: 'Dominó', icon: 'apps/d.png' })
})

test('«Ver todas» llama a onSeeAll', () => {
	const { tree, onSeeAll } = render([app('a')])
	act(() => { tree.root.findByType('QPSectionHeader').props.onPress() })
	expect(onSeeAll).toHaveBeenCalled()
})

test('sin apps, cargando, con error o solo borradores no ocupa nada', () => {
	expect(render(undefined).tree.toJSON()).toBeNull()
	expect(render([]).tree.toJSON()).toBeNull()
	expect(render([app('x', { preview: true, featured: true })]).tree.toJSON()).toBeNull()
})

test('las favoritas van delante de las destacadas', () => {
	const apps = [app('a'), app('b', { featured: true }), app('c')]
	const { tree } = render(apps, ['c'])
	expect(tree.root.findAllByType('MiniAppIcon').map(icon => icon.props.app.slug)).toEqual(['c', 'b', 'a'])
})

test('mantener pulsada una abre su menú, y cerrarlo lo quita', () => {
	const { tree } = render([app('domino', { name: 'Dominó' })])
	const sheet = () => tree.root.findByType('MiniAppActionsSheet')
	expect(sheet().props.app).toBeNull()
	act(() => { tree.root.findByProps({ testID: 'home-miniapp-domino' }).props.onLongPress() })
	expect(sheet().props.app.slug).toBe('domino')
	act(() => { sheet().props.onClose() })
	expect(sheet().props.app).toBeNull()
})

test('publica las favoritas como accesos rápidos del icono de la app', () => {
	render([app('a', { icon: 'apps/a.png' }), app('b')], ['a'])
	expect(setMiniAppQuickActions).toHaveBeenLastCalledWith([{ slug: 'a', name: 'a', icon: 'apps/a.png' }])
})

test('sin favoritas los accesos rápidos quedan vacíos; sin directorio no se tocan', () => {
	render([app('a', { featured: true })])
	expect(setMiniAppQuickActions).toHaveBeenLastCalledWith([])
	setMiniAppQuickActions.mockClear()
	render(undefined, ['a'])
	expect(setMiniAppQuickActions).not.toHaveBeenCalled()
})

test('hasta leer las favoritas del disco no toca los accesos rápidos', () => {
	render([app('a', { featured: true })], [], { ready: false })
	expect(setMiniAppQuickActions).not.toHaveBeenCalled()
})
