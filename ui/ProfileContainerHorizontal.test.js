/**
 * Render tests for the compact horizontal user row (avatar + badges +
 * username or P2P trust strip) — node environment with theme, icons and
 * QPAvatar mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPAvatar', () => 'QPAvatar')

import React from 'react'
import { Image } from 'react-native'
import { act, create } from 'react-test-renderer'
import ProfileContainerHorizontal from './ProfileContainerHorizontal'

const USER = { name: 'Yadira', username: 'yadira' }

const renderRow = (user = USER, props = {}) => {
	let tree
	act(() => { tree = create(<ProfileContainerHorizontal user={user} {...props} />) })
	return tree
}

const iconNames = (tree) => tree.root.findAllByType('FontAwesome6').map(i => i.props.name)

test('shows the name and the @username line by default', () => {
	const out = JSON.stringify(renderRow().toJSON())
	expect(out).toContain('Yadira')
	expect(out).toContain('@')
	expect(out).toContain('yadira')
})

test('forwards size and online presence to the avatar', () => {
	const avatar = renderRow(USER, { size: 40, isOnline: true }).root.findByType('QPAvatar')
	expect(avatar.props.size).toBe(40)
	expect(avatar.props.isOnline).toBe(true)
	expect(avatar.props.user).toBe(USER)
})

test('showUsername=false swaps the username for the P2P trust strip', () => {
	const user = {
		...USER,
		phone_verified: true,
		telegram_verified: true,
		rating_avg: 4.5,
		_count: { P2P: 3, P2P_Peer: 2 },
	}
	const tree = renderRow(user, { showUsername: false })
	const out = JSON.stringify(tree.toJSON())
	expect(out).not.toContain('@')
	expect(out).toContain('5') // 3 created + 2 as peer
	expect(out).toContain('4.5')
	expect(iconNames(tree)).toEqual(expect.arrayContaining(['phone', 'telegram', 'repeat', 'star']))
})

test('the trust strip hides operations and rating when they are zero', () => {
	const tree = renderRow(USER, { showUsername: false })
	const names = iconNames(tree)
	expect(names).not.toContain('repeat')
	expect(names).not.toContain('star')
	expect(names).not.toContain('phone')
})

test('KYC, gold and admin badges appear when earned', () => {
	const plain = renderRow()
	expect(plain.root.findAllByType(Image)).toHaveLength(0)
	const decorated = renderRow({ ...USER, kyc: 1, golden_check: 1, role: 'admin' })
	expect(decorated.root.findAllByType(Image)).toHaveLength(2) // blue badge + qvapay logo
	expect(iconNames(decorated)).toContain('crown')
})
