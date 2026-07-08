/**
 * Render tests for TransactionSticker — the animated sticker chip that renders
 * the CDN .gif sibling of the persisted `:sticker:<name>.webm` wire format.
 * @jest-environment node
 */
jest.mock('@d11/react-native-fast-image', () => {
	const MockFastImage = () => null
	MockFastImage.priority = { low: 'low', normal: 'normal', high: 'high' }
	MockFastImage.cacheControl = { immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly' }
	MockFastImage.resizeMode = { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' }
	return { __esModule: true, default: MockFastImage }
})

import { StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import TransactionSticker from './TransactionSticker'

const MockFastImage = require('@d11/react-native-fast-image').default

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<TransactionSticker {...props} />) })
	return tree
}

describe('TransactionSticker', () => {

	test('renders nothing without a sticker name', async () => {
		const tree = await render({})
		expect(tree.toJSON()).toBeNull()
	})

	test('renders the .gif sibling of the .webm wire name from the qvi CDN', async () => {
		const tree = await render({ name: 'lol.webm' })
		const source = tree.root.findByType(MockFastImage).props.source
		expect(source.uri).toBe('https://media.qvapay.com/qvi/lol.gif')
		expect(source.cache).toBe(MockFastImage.cacheControl.immutable)
	})

	test('keys out the gif black background with a screen blend on the wrapper', async () => {
		const tree = await render({ name: 'joy.webm' })
		const wrapper = StyleSheet.flatten(tree.toJSON().props.style)
		expect(wrapper.mixBlendMode).toBe('screen')
		expect(wrapper.overflow).toBe('hidden')
	})

	test('defaults to a 48px square and honors a custom size', async () => {
		const def = await render({ name: 'joy.webm' })
		expect(StyleSheet.flatten(def.toJSON().props.style)).toMatchObject({ width: 48, height: 48 })
		const custom = await render({ name: 'joy.webm', size: 28 })
		expect(StyleSheet.flatten(custom.toJSON().props.style)).toMatchObject({ width: 28, height: 28 })
		expect(StyleSheet.flatten(custom.root.findByType(MockFastImage).props.style)).toMatchObject({ width: 28, height: 28 })
	})

	test('merges a custom style override on the wrapper', async () => {
		const tree = await render({ name: 'joy.webm', style: { marginRight: 8 } })
		expect(StyleSheet.flatten(tree.toJSON().props.style).marginRight).toBe(8)
	})
})
