/**
 * QPAppLogo: logo del comercio por el CDN en squircle, glifo de tienda sin logo.
 * @jest-environment node
 */
import { StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'

jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@d11/react-native-fast-image', () => {
	const MockFastImage = () => null
	MockFastImage.priority = { low: 'low', normal: 'normal', high: 'high' }
	MockFastImage.cacheControl = { immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly' }
	MockFastImage.resizeMode = { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' }
	return { __esModule: true, default: MockFastImage }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import QPAppLogo from './QPAppLogo'

const MockFastImage = require('@d11/react-native-fast-image').default

const render = (props) => {
	let tree
	act(() => { tree = create(<QPAppLogo {...props} />) })
	return tree
}

test('resuelve el logo relativo contra el CDN y lo cachea como inmutable', () => {
	const image = render({ app: { name: 'La Tienda', logo: 'apps/t.png' } }).root.findByType(MockFastImage)
	expect(image.props.source).toEqual({ uri: 'https://media.qvapay.com/apps/t.png', priority: 'normal', cache: 'immutable' })
	expect(image.props.resizeMode).toBe('cover')
})

test('normaliza la barra inicial y deja pasar una URL absoluta', () => {
	expect(render({ app: { name: 'x', logo: '/apps/t.png' } }).root.findByType(MockFastImage).props.source.uri).toBe('https://media.qvapay.com/apps/t.png')
	expect(render({ app: { name: 'x', logo: 'https://cdn.example.com/l.png' } }).root.findByType(MockFastImage).props.source.uri).toBe('https://cdn.example.com/l.png')
})

test('sin logo pinta el glifo de tienda y ninguna imagen', () => {
	const tree = render({ app: { name: 'Sin logo' } })
	expect(tree.root.findAllByType(MockFastImage)).toHaveLength(0)
	expect(tree.root.findByType('FontAwesome6').props.name).toBe('store')
	expect(render({ app: null }).root.findByType('FontAwesome6').props.name).toBe('store')
})

test('es un squircle proporcional al tamaño', () => {
	const tree = render({ app: { name: 'x', logo: 'apps/t.png' }, size: 40 })
	const clip = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'x')[0]
	expect(StyleSheet.flatten(clip.props.style)).toMatchObject({ width: 40, height: 40, borderRadius: 11, borderCurve: 'continuous', overflow: 'hidden' })
})
