/**
 * Render tests for the contacts pre-permission disclosure modal (the house
 * centered-card pattern) — node environment with theme, icons and QPButton
 * mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPButton', () => 'QPButton')

import React from 'react'
import { Linking } from 'react-native'
import { act, create } from 'react-test-renderer'
import ContactsDisclosureModal from './ContactsDisclosureModal'

const renderModal = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<ContactsDisclosureModal
				visible
				onAccept={props.onAccept || jest.fn()}
				onDecline={props.onDecline || jest.fn()}
				{...props}
			/>
		)
	})
	return tree
}

const buttonByTitle = (tree, title) =>
	tree.root.findAllByType('QPButton').find(b => b.props.title === title)

beforeEach(() => {
	jest.restoreAllMocks()
	jest.spyOn(Linking, 'openURL').mockResolvedValue()
})

test('explains the contacts upload before the OS permission prompt', () => {
	const out = JSON.stringify(renderModal().toJSON())
	expect(out).toContain('Acceso a tus contactos')
	expect(out).toContain('no se comparten con terceros')
})

test('uses the standard centered-card overlay pattern', () => {
	const modal = renderModal().root.findByProps({ transparent: true })
	expect(modal.props.animationType).toBe('fade')
})

test('accept and decline buttons fire their callbacks', () => {
	const onAccept = jest.fn()
	const onDecline = jest.fn()
	const tree = renderModal({ onAccept, onDecline })
	act(() => { buttonByTitle(tree, 'Aceptar y continuar').props.onPress() })
	expect(onAccept).toHaveBeenCalled()
	act(() => { buttonByTitle(tree, 'No, gracias').props.onPress() })
	expect(onDecline).toHaveBeenCalled()
})

test('the Android back button counts as a decline', () => {
	const onDecline = jest.fn()
	const tree = renderModal({ onDecline })
	act(() => { tree.root.findByProps({ transparent: true }).props.onRequestClose() })
	expect(onDecline).toHaveBeenCalled()
})

test('the privacy link opens the policy in the browser', () => {
	const tree = renderModal()
	const link = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.type !== 'QPButton')[0]
	act(() => { link.props.onPress() })
	expect(Linking.openURL).toHaveBeenCalledWith('https://qvapay.com/privacy')
})
