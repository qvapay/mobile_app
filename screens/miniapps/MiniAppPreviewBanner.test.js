/**
 * Aviso fijo del host para una mini-app sin publicar: al dueño le recuerda
 * que es su vista previa; al tester le advierte que QvaPay no la ha revisado.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true), isDark: true }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { Text, View } from 'react-native'
import { act, create } from 'react-test-renderer'
import MiniAppPreviewBanner from './MiniAppPreviewBanner'

const render = role => {
	let tree
	act(() => { tree = create(<MiniAppPreviewBanner role={role} />) })
	const banner = tree.root.findAllByType(View).find(node => node.props.testID === 'miniapp-preview-banner')
	// El texto de fuera lleva dentro el título (otro Text) y el cuerpo
	const outer = tree.root.findAllByType(Text)[0]
	const flatten = children => [].concat(children).map(child => typeof child === 'string' ? child : flatten(child?.props?.children)).join('')
	return { banner, text: flatten(outer.props.children) }
}

test('al tester: versión de prueba y que nunca escriba su contraseña', () => {
	const { banner, text } = render('tester')
	expect(banner.props.accessibilityRole).toBe('alert')
	expect(text).toBe('Versión de prueba · QvaPay aún no la ha revisado. Nunca escribas aquí tu contraseña de QvaPay.')
})

test('al dueño: su vista previa, que no cobra', () => {
	const { banner, text } = render('owner')
	expect(banner).toBeDefined()
	expect(text).toBe('Vista previa · Solo la ven tú y tus testers. No cobra hasta que se publique.')
})
