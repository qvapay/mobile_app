/**
 * Tarjeta de invitación a probar una mini-app sin publicar: quién invita, el
 * aviso de que QvaPay no la ha revisado, y los dos botones con una sola
 * respuesta en vuelo.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true), isDark: true }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./MiniAppIcon', () => 'MiniAppIcon')
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')

import React from 'react'
import { ActivityIndicator, Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import MiniAppInviteCard from './MiniAppInviteCard'

const INVITE = {
	slug: 'mi-tienda', name: 'Mi Tienda', tagline: null, icon: 'apps/t.png', category: 'shopping',
	merchant: { name: 'Tienda SA', logo: null },
	invited_by: { username: 'pepe', name: 'Pepe', image: null },
	created_at: '2026-11-11T12:00:00.000Z',
}

const render = (props = {}) => {
	const onAccept = jest.fn()
	const onDecline = jest.fn()
	let tree
	act(() => {
		tree = create(<MiniAppInviteCard invite={INVITE} answering={null} disabled={false} onAccept={onAccept} onDecline={onDecline} {...props} />)
	})
	const texts = () => tree.root.findAllByType(Text).map(node => [].concat(node.props.children).join(''))
	const accept = () => tree.root.findByType('QPButton')
	const decline = () => tree.root.findByProps({ testID: 'miniapp-invite-decline-mi-tienda' })
	return { tree, onAccept, onDecline, texts, accept, decline }
}

test('dice quién invita y avisa antes de entrar de que no está revisada ni cobra', () => {
	const { tree, texts } = render()
	expect(tree.root.findByProps({ testID: 'miniapp-invite-mi-tienda' })).toBeDefined()
	expect(tree.root.findByType('MiniAppIcon').props.app).toBe(INVITE)
	expect(texts()).toEqual(expect.arrayContaining([
		'Mi Tienda',
		'@pepe te invita a probarla antes de publicarla',
		'QvaPay aún no la ha revisado. Dentro no se puede pagar, y nunca escribas ahí tu contraseña de QvaPay.',
	]))
})

test('sin quien invita, la frase genérica', () => {
	let tree
	act(() => { tree = create(<MiniAppInviteCard invite={{ ...INVITE, invited_by: null }} answering={null} disabled={false} onAccept={jest.fn()} onDecline={jest.fn()} />) })
	const texts = tree.root.findAllByType(Text).map(node => [].concat(node.props.children).join(''))
	expect(texts).toContain('Te invitaron a probarla antes de publicarla')
})

test('«Probar» acepta y «Rechazar» rechaza', () => {
	const { onAccept, onDecline, accept, decline } = render()
	expect(accept().props.title).toBe('Probar')
	expect(accept().props.disabled).toBe(false)
	expect(decline().props.disabled).toBe(false)
	act(() => { accept().props.onPress() })
	expect(onAccept).toHaveBeenCalledTimes(1)
	act(() => { decline().props.onPress() })
	expect(onDecline).toHaveBeenCalledTimes(1)
})

test('aceptando: «Probar» cargando y «Rechazar» apagado', () => {
	const { accept, decline } = render({ answering: 'accept', disabled: true })
	expect(accept().props.loading).toBe(true)
	expect(accept().props.disabled).toBe(false)
	expect(decline().props.disabled).toBe(true)
})

test('rechazando: «Rechazar» cargando y «Probar» apagado', () => {
	const { tree, accept, decline } = render({ answering: 'decline', disabled: true })
	expect(decline().findByType(ActivityIndicator)).toBeDefined()
	expect(accept().props.loading).toBe(false)
	expect(accept().props.disabled).toBe(true)
	expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Rechazar')).toBe(false)
})

test('con otra invitación en vuelo, ninguno de los dos responde', () => {
	const { accept, decline } = render({ disabled: true })
	expect(accept().props.disabled).toBe(true)
	expect(accept().props.loading).toBe(false)
	expect(decline().props.disabled).toBe(true)
})
