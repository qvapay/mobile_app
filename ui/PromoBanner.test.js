/**
 * Render tests for the Home promo banner — node environment with reanimated
 * and FastImage mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native-reanimated', () => {
	const { View } = require('react-native')
	return {
		__esModule: true,
		default: { View },
		useSharedValue: (v) => ({ value: v }),
		useAnimatedStyle: () => ({}),
		withTiming: (v) => v,
		withDelay: (_d, v) => v,
		Easing: { out: () => undefined, ease: undefined },
	}
})
jest.mock('@d11/react-native-fast-image', () => {
	const FastImage = () => null
	FastImage.cacheControl = { web: 'web' }
	FastImage.resizeMode = { contain: 'contain' }
	return FastImage
})
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: { ...createTheme(true), mode: 'dark' } }) }
})

import React from 'react'
import { Linking } from 'react-native'
import { act, create } from 'react-test-renderer'
import FastImage from '@d11/react-native-fast-image'
import PromoBanner from './PromoBanner'

const renderBanner = (promo) => {
	let tree
	act(() => { tree = create(<PromoBanner promo={promo} />) })
	return tree
}

beforeEach(() => {
	jest.restoreAllMocks()
	jest.spyOn(Linking, 'openURL').mockResolvedValue()
})

test('renders nothing until a promo with text arrives', () => {
	expect(renderBanner(undefined).toJSON()).toBeNull()
	expect(renderBanner({}).toJSON()).toBeNull()
	expect(renderBanner({ text: '' }).toJSON()).toBeNull()
})

test('shows the promo title and optional description', () => {
	const out = JSON.stringify(renderBanner({ text: 'Gana 5%', description: 'Solo esta semana' }).toJSON())
	expect(out).toContain('Gana 5%')
	expect(out).toContain('Solo esta semana')
	const noDesc = JSON.stringify(renderBanner({ text: 'Gana 5%' }).toJSON())
	expect(noDesc).not.toContain('Solo esta semana')
})

test('renders the logo through FastImage only when provided', () => {
	const withLogo = renderBanner({ text: 'Promo', logo: 'https://cdn/x.png' })
	expect(withLogo.root.findAllByType(FastImage)).toHaveLength(1)
	const noLogo = renderBanner({ text: 'Promo' })
	expect(noLogo.root.findAllByType(FastImage)).toHaveLength(0)
})

test('tapping opens the promo URL externally; without URL it is inert', () => {
	const findPressable = (root) => root.find(node => typeof node.props.onPress === 'function')
	const tree = renderBanner({ text: 'Promo', url: 'https://qvapay.com/promo' })
	act(() => { findPressable(tree.root).props.onPress() })
	expect(Linking.openURL).toHaveBeenCalledWith('https://qvapay.com/promo')

	Linking.openURL.mockClear()
	const noUrl = renderBanner({ text: 'Promo' })
	act(() => { findPressable(noUrl.root).props.onPress() })
	expect(Linking.openURL).not.toHaveBeenCalled()
})
