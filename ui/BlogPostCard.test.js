/**
 * Render tests for the Home blog post card — node environment with theme,
 * FastImage and icons mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@d11/react-native-fast-image', () => {
	const FastImage = () => null
	FastImage.cacheControl = { immutable: 'immutable', web: 'web' }
	FastImage.resizeMode = { cover: 'cover', contain: 'contain' }
	return FastImage
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { Linking } from 'react-native'
import { act, create } from 'react-test-renderer'
import BlogPostCard from './BlogPostCard'

const post = {
	title: 'QvaPay lanza nueva función',
	excerpt: '<p>Ahora puedes <strong>ahorrar</strong> con Roundup.</p>',
	link: 'https://blog.qvapay.com/roundup',
	date: '2026-07-01T10:00:00',
	author: 'QvaPay',
	featuredImage: 'https://blog.qvapay.com/img.jpg',
}

const renderCard = (props = {}) => {
	let tree
	act(() => {
		tree = create(<BlogPostCard post={post} index={0} totalItems={3} iPad={false} {...props} />)
	})
	return tree
}

beforeEach(() => {
	jest.restoreAllMocks()
	jest.spyOn(Linking, 'openURL').mockResolvedValue()
})

test('renders the title, author and the HTML-stripped excerpt', () => {
	const out = JSON.stringify(renderCard().toJSON())
	expect(out).toContain('QvaPay lanza nueva función')
	expect(out).toContain('Ahora puedes ahorrar con Roundup.')
	expect(out).not.toContain('<p>')
	expect(out).not.toContain('strong')
})

test('formats the date in long Spanish locale', () => {
	const out = JSON.stringify(renderCard().toJSON())
	expect(out).toMatch(/1 de julio de 2026/)
})

test('tapping the card opens the post in the external browser', async () => {
	const tree = renderCard()
	const pressable = tree.root.find(node => typeof node.props.onPress === 'function')
	await act(async () => { await pressable.props.onPress() })
	expect(Linking.openURL).toHaveBeenCalledWith('https://blog.qvapay.com/roundup')
})

test('a failed open is swallowed silently', async () => {
	Linking.openURL.mockRejectedValue(new Error('no browser'))
	const tree = renderCard()
	const pressable = tree.root.find(node => typeof node.props.onPress === 'function')
	await act(async () => { await pressable.props.onPress() })
})

test('only the last phone card drops its bottom margin', () => {
	const middle = renderCard({ index: 0, totalItems: 3 }).toJSON()
	expect(JSON.stringify(middle.props.style)).toContain('"marginBottom":12')
	const last = renderCard({ index: 2, totalItems: 3 }).toJSON()
	expect(JSON.stringify(last.props.style)).toContain('"marginBottom":0')
})

test('iPad layout computes a two-up width and no bottom margin', () => {
	const card = renderCard({ iPad: true }).toJSON()
	const style = JSON.stringify(card.props.style)
	expect(style).toContain('"marginBottom":0')
	expect(style).toContain('"width"')
})
