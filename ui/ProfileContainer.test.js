/**
 * Render tests for the full profile header (cover + avatar + badges + P2P
 * stats card) — node environment with theme, safe-area, FastImage, gradient,
 * icons and QPAvatar mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))
jest.mock('@d11/react-native-fast-image', () => {
	const FastImage = () => null
	FastImage.priority = { high: 'high' }
	FastImage.cacheControl = { immutable: 'immutable' }
	FastImage.resizeMode = { cover: 'cover' }
	return FastImage
})
jest.mock('react-native-linear-gradient', () => 'LinearGradient')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPAvatar', () => 'QPAvatar')

import React from 'react'
import { Image } from 'react-native'
import { act, create } from 'react-test-renderer'
import FastImage from '@d11/react-native-fast-image'
import ProfileContainer from './ProfileContainer'

const USER = {
	name: 'Erich',
	username: 'erich',
	cover_photo_url: null,
	p2p_completed_count: 12,
	p2p_average_rating: 4.66,
	trustscore: 87,
}

const renderProfile = (user = USER, props = {}) => {
	let tree
	act(() => { tree = create(<ProfileContainer user={user} {...props} />) })
	return tree
}

const penIcons = (tree) =>
	tree.root.findAllByType('FontAwesome6').filter(i => i.props.name === 'pen')

test('shows the name, @username and the P2P stats card', () => {
	const out = JSON.stringify(renderProfile().toJSON())
	expect(out).toContain('Erich')
	expect(out).toContain('@')
	expect(out).toContain('erich')
	expect(out).toContain('12')
	expect(out).toContain('4.7') // rating rendered with one decimal
	expect(out).toContain('87')
	expect(out).toContain('Operaciones')
	expect(out).toContain('TrustScore')
})

test('stats fall back to zeros for a bare user', () => {
	const out = JSON.stringify(renderProfile({ name: 'Nuevo', username: 'nuevo' }).toJSON())
	expect(out).toContain('0.0')
	expect(out).toContain('Rating')
})

test('renders the cover via FastImage only when a cover photo exists', () => {
	const withCover = renderProfile({ ...USER, cover_photo_url: 'https://qvapay.com/cover.jpg' })
	const cover = withCover.root.findByType(FastImage)
	expect(cover.props.source.uri).toBe('https://qvapay.com/cover.jpg')

	const withoutCover = renderProfile()
	expect(withoutCover.root.findAllByType(FastImage)).toHaveLength(0)
	expect(withoutCover.root.findAllByType('FontAwesome6').some(i => i.props.name === 'image')).toBe(true)
})

test('edit pencils only render when their callbacks are passed', () => {
	expect(penIcons(renderProfile())).toHaveLength(0)
	const onEditAvatar = jest.fn()
	const onEditCover = jest.fn()
	const tree = renderProfile(USER, { onEditAvatar, onEditCover })
	expect(penIcons(tree)).toHaveLength(2)
	const coverButton = tree.root.findAll(n => n.props.onPress === onEditCover)[0]
	act(() => { coverButton.props.onPress() })
	expect(onEditCover).toHaveBeenCalled()
})

test('KYC, gold and admin badges appear next to the name when earned', () => {
	const plain = renderProfile()
	expect(plain.root.findAllByType(Image)).toHaveLength(0)
	expect(plain.root.findAllByType('FontAwesome6').some(i => i.props.name === 'crown')).toBe(false)

	const decorated = renderProfile({ ...USER, kyc: 1, golden_check: 1, role: 'admin' })
	expect(decorated.root.findAllByType(Image)).toHaveLength(2) // blue badge + qvapay logo
	expect(decorated.root.findAllByType('FontAwesome6').some(i => i.props.name === 'crown')).toBe(true)
})
