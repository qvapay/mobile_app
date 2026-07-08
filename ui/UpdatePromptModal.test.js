/**
 * Render tests for the "new version available" modal — node environment with
 * theme, icons, buttons and versionCheck mocked (see keypadAmount.test.js).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPButton', () => 'QPButton')
jest.mock('../helpers/versionCheck', () => ({
	openStore: jest.fn(),
	markPromptShown: jest.fn(),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { openStore, markPromptShown } from '../helpers/versionCheck'
import UpdatePromptModal from './UpdatePromptModal'

const renderModal = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<UpdatePromptModal
				visible
				currentVersion='1.8.5'
				latestVersion='1.9.0'
				storeUrl='https://apps.apple.com/app/qvapay'
				onDismiss={props.onDismiss || jest.fn()}
				{...props}
			/>
		)
	})
	return tree
}

const buttonByTitle = (tree, title) =>
	tree.root.findAllByType('QPButton').find(b => b.props.title === title)

beforeEach(() => {
	jest.clearAllMocks()
	markPromptShown.mockResolvedValue()
	openStore.mockResolvedValue()
})

test('shows both versions in the copy', () => {
	const out = JSON.stringify(renderModal().toJSON())
	expect(out).toContain('Nueva versión disponible')
	expect(out).toContain('1.9.0')
	expect(out).toContain('1.8.5')
})

test('uses the standard centered-card overlay pattern', () => {
	const tree = renderModal()
	const modal = tree.root.findByProps({ transparent: true })
	expect(modal.props.animationType).toBe('fade')
	expect(modal.props.statusBarTranslucent).toBe(true)
})

test('"Actualizar ahora" starts the cooldown, opens the store and dismisses', async () => {
	const onDismiss = jest.fn()
	const tree = renderModal({ onDismiss })
	await act(async () => { await buttonByTitle(tree, 'Actualizar ahora').props.onPress() })
	expect(markPromptShown).toHaveBeenCalled()
	expect(openStore).toHaveBeenCalledWith('https://apps.apple.com/app/qvapay')
	expect(onDismiss).toHaveBeenCalled()
})

test('"Ahora no" also starts the cooldown but never opens the store', async () => {
	const onDismiss = jest.fn()
	const tree = renderModal({ onDismiss })
	await act(async () => { await buttonByTitle(tree, 'Ahora no').props.onPress() })
	expect(markPromptShown).toHaveBeenCalled()
	expect(openStore).not.toHaveBeenCalled()
	expect(onDismiss).toHaveBeenCalled()
})

test('the Android back button dismisses through the same cooldown path', async () => {
	const onDismiss = jest.fn()
	const tree = renderModal({ onDismiss })
	const modal = tree.root.findByProps({ transparent: true })
	await act(async () => { await modal.props.onRequestClose() })
	expect(markPromptShown).toHaveBeenCalled()
	expect(onDismiss).toHaveBeenCalled()
})
