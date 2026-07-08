/**
 * Render tests for QPProduct — store catalog tile with gold-tier pricing.
 * Note: the gold branch interpolates '$' and the amount as separate JSX children,
 * while the regular branch renders one template string ('$10.00').
 * @jest-environment node
 */
jest.mock('react-native-reanimated') // manual mock in /__mocks__/react-native-reanimated.js
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('@d11/react-native-fast-image', () => {
	const MockFastImage = () => null
	MockFastImage.priority = { low: 'low', normal: 'normal', high: 'high' }
	MockFastImage.cacheControl = { immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly' }
	MockFastImage.resizeMode = { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' }
	return { __esModule: true, default: MockFastImage }
})

import { Text, StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPProduct from './QPProduct'
import { useAuth } from '../../auth/AuthContext'
import { createTheme } from '../../theme/ThemeContext'

const theme = createTheme(true)
const MockFastImage = require('@d11/react-native-fast-image').default

beforeEach(() => {
	useAuth.mockReturnValue({ user: { golden_check: false } })
})

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPProduct name='Netflix' price={10} {...props} />) })
	return tree
}

describe('QPProduct', () => {

	test('renders the name and the price formatted to 2 decimals', async () => {
		const tree = await render({ price: 10 })
		const json = JSON.stringify(tree.toJSON())
		expect(json).toContain('Netflix')
		expect(json).toContain('"$10.00"')
	})

	test('gold members with a distinct goldPrice see the regular price struck through', async () => {
		useAuth.mockReturnValue({ user: { golden_check: true } })
		const tree = await render({ price: 10, goldPrice: 8.5 })
		const texts = tree.root.findAllByType(Text)
		const strike = texts.find(t => StyleSheet.flatten(t.props.style).textDecorationLine === 'line-through')
		expect(strike.props.children).toEqual(['$', '10.00'])
		const gold = texts.find(t => StyleSheet.flatten(t.props.style).color === theme.colors.gold)
		expect(gold.props.children).toEqual(['$', '8.50'])
	})

	test('non-gold users never see the gold price', async () => {
		const tree = await render({ price: 10, goldPrice: 8.5 })
		const json = JSON.stringify(tree.toJSON())
		expect(json).toContain('"$10.00"')
		expect(json).not.toContain('8.50')
	})

	test('a goldPrice equal to the regular price collapses to the plain price', async () => {
		useAuth.mockReturnValue({ user: { golden_check: true } })
		const tree = await render({ price: 10, goldPrice: 10 })
		expect(JSON.stringify(tree.toJSON())).toContain('"$10.00"')
		const texts = tree.root.findAllByType(Text)
		expect(texts.some(t => StyleSheet.flatten(t.props.style).textDecorationLine === 'line-through')).toBe(false)
	})

	test('details render joined with a bullet separator', async () => {
		const tree = await render({ details: ['USA', 'Streaming'] })
		expect(JSON.stringify(tree.toJSON())).toContain('USA • Streaming')
	})

	test('artwork resolves through the mediaUrl CDN helper, logo winning over image', async () => {
		const tree = await render({ logo: '/brands/netflix.png', image: 'brands/other.png' })
		const source = tree.root.findByType(MockFastImage).props.source
		expect(source.uri).toBe('https://media.qvapay.com/brands/netflix.png')
		const bare = await render({})
		expect(bare.root.findAllByType(MockFastImage)).toHaveLength(0)
	})

	test('fires onPress through the QPPressable wrapper', async () => {
		const onPress = jest.fn()
		const tree = await render({ onPress })
		const pressable = tree.root.findAll(node => typeof node.type === 'string' && node.props.onResponderRelease !== undefined)[0]
		await act(async () => { pressable.props.onResponderRelease() })
		expect(onPress).toHaveBeenCalledTimes(1)
	})
})
