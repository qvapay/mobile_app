/**
 * Hoja de moderación: menú ⋯ → formulario de reporte (motivo obligatorio) o confirmación
 * de bloqueo/desbloqueo, todo dentro de UNA sola Modal.
 * @jest-environment node
 */
jest.mock('../../ui/particles/QPAvatar', () => 'QPAvatar')
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../ui/QPKeyboardAvoidingView', () => 'QPKeyboardAvoidingView')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
// El Modal de RN como host plano: el mock del preset no pinta nada con visible=false y la puerta necesita verlo
jest.mock('react-native/Libraries/Modal/Modal', () => ({ __esModule: true, default: 'Modal' }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'
import P2PUserModerationSheet from './P2PUserModerationSheet'

const theme = createTheme(true)
const PEER = { uuid: 'p', username: 'peer', name: 'Peer' }

let trees = []

const render = (target, props = {}) => {
	const handlers = { onClose: jest.fn(), onReport: jest.fn(), onBlock: jest.fn(), onUnblock: jest.fn(), ...props }
	let tree
	act(() => {
		tree = create(<P2PUserModerationSheet target={target} blocked={false} busy={false} {...handlers} theme={theme} textStyles={createTextStyles(theme)} containerStyles={createContainerStyles(theme)} />)
	})
	trees.push(tree)
	return { tree, handlers }
}

// La puerta del Modal arma un temporizador de respaldo: desmontar lo limpia y jest cierra el proceso
afterEach(() => {
	for (const tree of trees) act(() => tree.unmount())
	trees = []
})

const text = (tree) => JSON.stringify(tree.toJSON())
// El Pressable (composite) y no el View host que pinta debajo con el mismo testID
const byTestID = (tree, id) => tree.root.findAll(n => n.props.testID === id && typeof n.type !== 'string')[0]
const button = (tree) => tree.root.findByType('QPButton')

test('cerrada no pinta nada', () => {
	const { tree } = render(null)
	expect(tree.toJSON()).toBeNull()
})

test('menú: reportar y bloquear; con el usuario ya bloqueado ofrece desbloquear', () => {
	const { tree } = render({ user: PEER, view: 'menu' })
	expect(text(tree)).toContain('"@","peer"')
	expect(text(tree)).toContain('Reportar usuario')
	expect(text(tree)).toContain('Bloquear usuario')
	const { tree: blocked } = render({ user: PEER, view: 'menu' }, { blocked: true })
	expect(text(blocked)).toContain('Desbloquear usuario')
	expect(text(blocked)).not.toContain('Bloquear usuario')
})

test('menú → reportar: el motivo es obligatorio y el envío lleva motivo + detalles', () => {
	const { tree, handlers } = render({ user: PEER, view: 'menu' })
	act(() => { byTestID(tree, 'moderation-report').props.onPress() })
	expect(text(tree)).toContain('Reportar a @peer')
	expect(button(tree).props.disabled).toBe(true)
	act(() => { tree.root.find(n => n.props.testID === 'moderation-reason-scam').props.onPress() })
	expect(button(tree).props.disabled).toBe(false)
	act(() => { tree.root.findByType('QPInput').props.onChangeText('me pidió pagar fuera') })
	act(() => { button(tree).props.onPress() })
	expect(handlers.onReport).toHaveBeenCalledWith({ reason: 'scam', description: 'me pidió pagar fuera' })
})

test('menú → bloquear: confirmación en rojo que llama a onBlock', () => {
	const { tree, handlers } = render({ user: PEER, view: 'menu' })
	act(() => { byTestID(tree, 'moderation-block').props.onPress() })
	expect(text(tree)).toContain('¿Bloquear a @peer?')
	expect(button(tree).props.title).toBe('Bloquear')
	act(() => { button(tree).props.onPress() })
	expect(handlers.onBlock).toHaveBeenCalled()
})

test('abierta directamente en desbloquear (banner del perfil) llama a onUnblock', () => {
	const { tree, handlers } = render({ user: PEER, view: 'unblock' })
	expect(text(tree)).toContain('¿Desbloquear a @peer?')
	act(() => { button(tree).props.onPress() })
	expect(handlers.onUnblock).toHaveBeenCalled()
})

test('ocupada: el botón carga y cancelar no cierra', () => {
	const { tree, handlers } = render({ user: PEER, view: 'block' }, { busy: true })
	expect(button(tree).props.loading).toBe(true)
	act(() => { tree.root.findByType('QPPressable').props.onPress() })
	expect(handlers.onClose).not.toHaveBeenCalled()
})
