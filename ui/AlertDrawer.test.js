/**
 * Render tests for the morphing alert drawer (persistent pill button that
 * morphs into the confirm button of an expanding card, Family-app style) —
 * node environment with theme, reanimated (manual mock), icons and
 * QPPressable mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native-reanimated') // manual mock in /__mocks__/react-native-reanimated.js
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPPressable', () => 'QPPressable')

import React from 'react'
import { act, create } from 'react-test-renderer'
import AlertDrawer from './AlertDrawer'

const baseProps = {
	buttonLabel: 'Cerrar sesión',
	title: 'Cerrar sesión',
	description: '¿Estás seguro?',
	onConfirm: jest.fn(),
}

const render = (props = {}) => {
	let tree
	act(() => { tree = create(<AlertDrawer {...baseProps} {...props} />) })
	return tree
}

// Pressables in render order: [0] close ✕ (variant opacity), [1] cancel pill,
// [2] the persistent trigger/confirm button (last — floats above the card).
const pressables = (tree) => tree.root.findAllByType('QPPressable')
const closeButton = (tree) => pressables(tree).find(p => p.props.variant === 'opacity')
const confirmButton = (tree) => pressables(tree)[pressables(tree).length - 1]
const cancelButton = (tree) => pressables(tree).find(p => p !== closeButton(tree) && p !== confirmButton(tree))

const cardLayer = (tree) => tree.root.findAll(n => n.props.accessibilityElementsHidden !== undefined)[0]

const expand = async (tree) => {
	await act(async () => { await confirmButton(tree).props.onPress() })
}

test('renders collapsed as a pill with the button label and hidden card content', () => {
	const tree = render()
	expect(JSON.stringify(tree.toJSON())).toContain('Cerrar sesión')
	expect(cardLayer(tree).props.pointerEvents).toBe('none')
	expect(cardLayer(tree).props.accessibilityElementsHidden).toBe(true)
})

test('pressing the pill awaits onBeforeExpand, reveals the card and does not confirm', async () => {
	const onBeforeExpand = jest.fn()
	const onConfirm = jest.fn()
	const tree = render({ onBeforeExpand, onConfirm })
	await expand(tree)
	expect(onBeforeExpand).toHaveBeenCalledTimes(1)
	expect(onConfirm).not.toHaveBeenCalled()
	expect(cardLayer(tree).props.pointerEvents).toBe('auto')
	expect(cardLayer(tree).props.accessibilityElementsHidden).toBe(false)
})

test('expanded card shows title, description, cancel pill and ✕', async () => {
	const tree = render({ cancelLabel: 'Cancelar' })
	await expand(tree)
	const out = JSON.stringify(tree.toJSON())
	expect(out).toContain('¿Estás seguro?')
	expect(out).toContain('Cancelar')
	expect(pressables(tree)).toHaveLength(3) // ✕ + cancel + persistent button
})

test('pressing the morphed button while expanded confirms and collapses', async () => {
	const onConfirm = jest.fn()
	const tree = render({ onConfirm })
	await expand(tree)
	await act(async () => { await confirmButton(tree).props.onPress() })
	expect(onConfirm).toHaveBeenCalledTimes(1)
	expect(cardLayer(tree).props.pointerEvents).toBe('none')
})

test('a different confirmLabel crossfades in over the persistent button', async () => {
	const tree = render({ confirmLabel: 'Eliminar todo' })
	await expand(tree)
	const out = JSON.stringify(tree.toJSON())
	expect(out).toContain('Cerrar sesión')
	expect(out).toContain('Eliminar todo')
})

test('the cancel pill collapses and fires onCancel when provided', async () => {
	const onCancel = jest.fn()
	const onConfirm = jest.fn()
	const tree = render({ onCancel, onConfirm })
	await expand(tree)
	act(() => { cancelButton(tree).props.onPress() })
	expect(onCancel).toHaveBeenCalledTimes(1)
	expect(onConfirm).not.toHaveBeenCalled()
	expect(cardLayer(tree).props.pointerEvents).toBe('none')
})

test('the cancel pill without onCancel just collapses', async () => {
	const tree = render()
	await expand(tree)
	act(() => { cancelButton(tree).props.onPress() })
	expect(cardLayer(tree).props.pointerEvents).toBe('none')
})

test('the ✕ button dismisses without firing onConfirm or onCancel', async () => {
	const onConfirm = jest.fn()
	const onCancel = jest.fn()
	const tree = render({ onConfirm, onCancel })
	await expand(tree)
	act(() => { closeButton(tree).props.onPress() })
	expect(onConfirm).not.toHaveBeenCalled()
	expect(onCancel).not.toHaveBeenCalled()
	expect(cardLayer(tree).props.pointerEvents).toBe('none')
})
