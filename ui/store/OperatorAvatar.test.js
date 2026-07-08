/**
 * Render tests for the operator/brand avatar — node environment with the
 * theme and FastImage mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@d11/react-native-fast-image', () => {
	const FastImage = () => null
	FastImage.priority = { normal: 'normal' }
	FastImage.cacheControl = { immutable: 'immutable' }
	FastImage.resizeMode = { contain: 'contain' }
	return FastImage
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import FastImage from '@d11/react-native-fast-image'
import OperatorAvatar from './OperatorAvatar'

const renderAvatar = (props = {}) => {
	let tree
	act(() => { tree = create(<OperatorAvatar brand='Claro' {...props} />) })
	return tree
}

const wrapStyle = (tree) => Object.assign({}, ...[].concat(tree.toJSON().props.style))

test('renders the CDN logo through the mediaUrl helper (leading slash normalized)', () => {
	const tree = renderAvatar({ logoUrl: '/operators/claro-com.png' })
	const image = tree.root.findByType(FastImage)
	expect(image.props.source.uri).toBe('https://media.qvapay.com/operators/claro-com.png')
	expect(image.props.source.cache).toBe('immutable')
})

test('without a logo it falls back to the uppercased first letter', () => {
	const tree = renderAvatar({ brand: 'claro' })
	expect(tree.root.findAllByType(FastImage)).toHaveLength(0)
	expect(JSON.stringify(tree.toJSON())).toContain('"C"')
})

test('an empty brand falls back to "?"', () => {
	expect(JSON.stringify(renderAvatar({ brand: '' }).toJSON())).toContain('"?"')
})

test('named sizes map to px with a proportional radius; unknown sizes use md', () => {
	expect(wrapStyle(renderAvatar({ size: 'sm' }))).toMatchObject({ width: 32, borderRadius: 8 })
	expect(wrapStyle(renderAvatar({ size: 'lg' }))).toMatchObject({ width: 64, borderRadius: 16 })
	expect(wrapStyle(renderAvatar({ size: 'nope' }))).toMatchObject({ width: 44, borderRadius: 11 })
})

test('bgColor overrides the theme elevation default', () => {
	expect(wrapStyle(renderAvatar({ bgColor: 'transparent' })).backgroundColor).toBe('transparent')
	expect(wrapStyle(renderAvatar()).backgroundColor).toBe('#9DA3B4')
})
