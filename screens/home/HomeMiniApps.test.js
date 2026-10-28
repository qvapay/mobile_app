/**
 * Fila de mini-apps del Home: seis como mucho, destacadas primero, cada icono abre
 * la mini-app, «Ver todas» abre el catálogo y sin apps no ocupa nada.
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

import React from 'react'
import { act, create } from 'react-test-renderer'
import HomeMiniApps from './HomeMiniApps'
import { useMiniAppsList } from '../miniapps/miniappsQueries'
import { ROUTES } from '../../routes'

const app = (slug, extra = {}) => ({ slug, name: slug, icon: null, featured: false, ...extra })

const render = (data) => {
	useMiniAppsList.mockReturnValue({ data })
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
