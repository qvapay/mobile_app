/**
 * Menú del long-press de una mini-app: favorita sí/no, acceso directo solo
 * donde el launcher lo admite y compartir (en iOS, tras cerrarse el Modal).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./MiniAppIcon', () => 'MiniAppIcon')
jest.mock('./useMiniAppFavorites', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('./homeScreenShortcut', () => ({ useCanPinShortcut: jest.fn(), addToHomeScreen: jest.fn() }))
jest.mock('./shareMiniApp', () => ({ shareMiniApp: jest.fn(async () => 'shared') }))

import React from 'react'
import { Modal, Platform } from 'react-native'
import { act, create } from 'react-test-renderer'
import MiniAppActionsSheet from './MiniAppActionsSheet'
import MiniAppMenuRow from './MiniAppMenuRow'
import useMiniAppFavorites from './useMiniAppFavorites'
import { useCanPinShortcut, addToHomeScreen } from './homeScreenShortcut'
import { shareMiniApp } from './shareMiniApp'

const DOMINO = { slug: 'domino', name: 'Dominó', icon: 'apps/d.png', featured: false }

let toggle
const render = (app, { favorites = [], canPin = false } = {}) => {
	toggle = jest.fn()
	useMiniAppFavorites.mockReturnValue({ favorites, isFavorite: slug => favorites.includes(slug), toggle })
	useCanPinShortcut.mockReturnValue(canPin)
	const onClose = jest.fn()
	let tree
	act(() => { tree = create(<MiniAppActionsSheet app={app} onClose={onClose} />) })
	const row = testID => tree.root.findAllByType(MiniAppMenuRow).find(r => r.props.testID === testID)
	return { tree, onClose, row }
}

beforeEach(() => jest.clearAllMocks())

test('cerrado sin mini-app', () => {
	const { tree } = render(null)
	expect(tree.root.findByType(Modal).props.visible).toBe(false)
})

test('marcar como favorita cierra el menú', () => {
	const { tree, onClose, row } = render(DOMINO)
	expect(tree.root.findByType(Modal).props.visible).toBe(true)
	expect(row('miniapp-action-favorite').props.label).toBe('Añadir a favoritas')
	act(() => { row('miniapp-action-favorite').props.onPress() })
	expect(toggle).toHaveBeenCalledWith(DOMINO)
	expect(onClose).toHaveBeenCalled()
})

test('si ya es favorita, ofrece quitarla', () => {
	const { row } = render(DOMINO, { favorites: ['domino'] })
	expect(row('miniapp-action-favorite').props.label).toBe('Quitar de favoritas')
	expect(row('miniapp-action-favorite').props.icon).toBe('star')
})

test('«Añadir a la pantalla de inicio» solo donde se puede anclar', () => {
	expect(render(DOMINO).row('miniapp-action-pin')).toBeUndefined()
	const { row, onClose } = render(DOMINO, { canPin: true })
	act(() => { row('miniapp-action-pin').props.onPress() })
	expect(onClose).toHaveBeenCalled()
	expect(addToHomeScreen).toHaveBeenCalledWith(DOMINO, expect.any(Function))
})

test('en iOS compartir espera a que el Modal se cierre', () => {
	expect(Platform.OS).toBe('ios')
	const { tree, row, onClose } = render(DOMINO)
	act(() => { row('miniapp-action-share').props.onPress() })
	expect(onClose).toHaveBeenCalled()
	expect(shareMiniApp).not.toHaveBeenCalled()
	act(() => { tree.root.findByType(Modal).props.onDismiss() })
	expect(shareMiniApp).toHaveBeenCalledWith(DOMINO, expect.any(Function))
})

test('al abrirla con otra mini-app pinta la nueva', () => {
	const { tree } = render(DOMINO)
	const other = { ...DOMINO, slug: 'parchis', name: 'Parchís' }
	act(() => { tree.update(<MiniAppActionsSheet app={other} onClose={jest.fn()} />) })
	expect(tree.root.findByType('MiniAppIcon').props.app.slug).toBe('parchis')
})
