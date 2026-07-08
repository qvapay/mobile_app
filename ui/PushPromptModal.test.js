/**
 * Render tests for the push-notifications soft prompt modal — node environment
 * with theme, icons and QPButton mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPButton', () => 'QPButton')

import React from 'react'
import { act, create } from 'react-test-renderer'
import PushPromptModal from './PushPromptModal'

const renderModal = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<PushPromptModal
				visible
				onAccept={props.onAccept || jest.fn()}
				onDismiss={props.onDismiss || jest.fn()}
				{...props}
			/>
		)
	})
	return tree
}

const buttonByTitle = (tree, title) =>
	tree.root.findAllByType('QPButton').find(b => b.props.title === title)

test('sells the value of notifications before the native dialog', () => {
	const out = JSON.stringify(renderModal().toJSON())
	expect(out).toContain('No te pierdas ningún pago')
	expect(out).toContain('Activa las notificaciones')
})

test('uses the standard centered-card overlay pattern with a bell icon', () => {
	const tree = renderModal()
	const modal = tree.root.findByProps({ transparent: true })
	expect(modal.props.animationType).toBe('fade')
	expect(tree.root.findAllByType('FontAwesome6').some(i => i.props.name === 'bell')).toBe(true)
})

test('"Activar notificaciones" proceeds to the native permission request', () => {
	const onAccept = jest.fn()
	const tree = renderModal({ onAccept })
	act(() => { buttonByTitle(tree, 'Activar notificaciones').props.onPress() })
	expect(onAccept).toHaveBeenCalled()
})

test('"Ahora no" and the Android back button both dismiss', () => {
	const onDismiss = jest.fn()
	const tree = renderModal({ onDismiss })
	act(() => { buttonByTitle(tree, 'Ahora no').props.onPress() })
	act(() => { tree.root.findByProps({ transparent: true }).props.onRequestClose() })
	expect(onDismiss).toHaveBeenCalledTimes(2)
})
