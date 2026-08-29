/**
 * Render tests for the tabs' TopBar identity block (avatar + name + badges +
 * @username), including the avatar-only variant used by P2P — node environment
 * with theme, icons and QPAvatar mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPAvatar', () => 'QPAvatar')

import React from 'react'
import { StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import HeaderIdentity from './HeaderIdentity'

const USER = { name: 'Erich', username: 'erich', kyc: 1, golden_check: 0, role: 'user' }

const render = (props = {}) => {
	let tree
	act(() => { tree = create(<HeaderIdentity user={USER} onPress={() => { }} {...props} />) })
	return tree
}

const avatar = (tree) => tree.root.findByType('QPAvatar')
const boxHeight = (tree) => StyleSheet.flatten(tree.toJSON().props.style).height

test('shows the name and the @username', () => {
	const out = JSON.stringify(render().toJSON())
	expect(out).toContain('Erich')
	expect(out).toContain('erich')
})

test('avatarOnly hides the text but keeps the same avatar size', () => {
	const full = render()
	const compact = render({ avatarOnly: true })
	// El nombre viaja también dentro del prop `user` del avatar: se mira el texto pintado
	expect(compact.root.findAllByType('Text')).toHaveLength(0)
	expect(avatar(compact).props.size).toBe(avatar(full).props.size)
})

test('the avatar keeps its size on the native (liquid glass) variant', () => {
	expect(avatar(render({ native: true })).props.size).toBe(avatar(render()).props.size)
})

// El texto NO puede mandar en la altura: si la mandara, el avatar saltaría unos
// píxeles al pasar a P2P (que solo pinta el avatar)
test('the box height is the same with and without the text', () => {
	expect(boxHeight(render({ avatarOnly: true }))).toBe(boxHeight(render()))
	expect(boxHeight(render({ avatarOnly: true, native: true }))).toBe(boxHeight(render({ native: true })))
})

test('renders the crown only for gold users', () => {
	const crowns = (tree) => tree.root.findAllByType('FontAwesome6').filter(i => i.props.name === 'crown')
	expect(crowns(render())).toHaveLength(0)
	expect(crowns(render({ user: { ...USER, golden_check: 1 } }))).toHaveLength(1)
})
