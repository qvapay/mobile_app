/**
 * Render tests for QPAvatar — CDN/fallback source, VIP halo and presence dot.
 * @jest-environment node
 */
import { StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'

jest.mock('react-native-reanimated') // manual mock in /__mocks__/react-native-reanimated.js
jest.mock('@d11/react-native-fast-image', () => {
	const MockFastImage = () => null
	MockFastImage.priority = { low: 'low', normal: 'normal', high: 'high' }
	MockFastImage.cacheControl = { immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly' }
	MockFastImage.resizeMode = { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' }
	return { __esModule: true, default: MockFastImage }
})
jest.mock('react-native-svg', () => {
	const MockSvg = () => null
	const MockPath = () => null
	return { __esModule: true, default: MockSvg, Svg: MockSvg, Path: MockPath, SvgXml: () => null, SvgUri: () => null }
})

import QPAvatar from './QPAvatar'

const MockFastImage = require('@d11/react-native-fast-image').default
const MockSvg = require('react-native-svg').default
const LOCAL_FALLBACK = require('../../assets/images/ui/logo-qvapay.png')

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPAvatar {...props} />) })
	return tree
}

const findOnlineDot = (tree) => tree.root.findAll(node => {
	if (typeof node.type !== 'string' || !node.props.style) return false
	return StyleSheet.flatten(node.props.style).backgroundColor === '#22c55e'
})

describe('QPAvatar', () => {

	test('falls back to the local logo when the user has no image', async () => {
		const tree = await render({ user: {} })
		expect(tree.root.findByType(MockFastImage).props.source).toBe(LOCAL_FALLBACK)
	})

	test('loads the user image from the media CDN', async () => {
		const tree = await render({ user: { image: 'avatars/erich.jpg' } })
		const source = tree.root.findByType(MockFastImage).props.source
		expect(source.uri).toBe('https://media.qvapay.com/avatars/erich.jpg')
		expect(source.cache).toBe(MockFastImage.cacheControl.immutable)
	})

	test('renders the rotating halo only for VIP users', async () => {
		const vip = await render({ user: { vip: true } })
		expect(vip.root.findAllByType(MockSvg)).toHaveLength(1)
		const regular = await render({ user: { vip: false } })
		expect(regular.root.findAllByType(MockSvg)).toHaveLength(0)
	})

	test('shows the green presence dot when online and the avatar is large enough', async () => {
		const online = await render({ user: {}, isOnline: true, size: 32 })
		expect(findOnlineDot(online).length).toBeGreaterThan(0)
		const offline = await render({ user: {}, isOnline: false, size: 32 })
		expect(findOnlineDot(offline)).toHaveLength(0)
	})

	test('hides the presence dot below 24px — it would read as noise', async () => {
		const tiny = await render({ user: {}, isOnline: true, size: 20 })
		expect(findOnlineDot(tiny)).toHaveLength(0)
	})
})
