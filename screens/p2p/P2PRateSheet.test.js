/**
 * Hoja de valoración: crear (en blanco) y editar (precargada, con su plazo y "Guardar
 * cambios" solo si algo cambió).
 * @jest-environment node
 */
jest.mock('../../ui/particles/QPAvatar', () => 'QPAvatar')
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../ui/particles/QPRate', () => 'QPRate')
jest.mock('../../ui/QPKeyboardAvoidingView', () => 'QPKeyboardAvoidingView')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
// El Modal de RN como host plano: el mock del preset no pinta nada con visible=false y la puerta necesita verlo
jest.mock('react-native/Libraries/Modal/Modal', () => ({ __esModule: true, default: 'Modal' }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'
import P2PRateSheet from './P2PRateSheet'

const theme = createTheme(true)
const base = { order: null, counterparty: { uuid: 'p', username: 'peer' }, amount: '10.00', receive: '4000', coinName: 'CUP', rated: false, initialRating: 0 }

const render = (target, onSubmit = jest.fn()) => {
	let tree
	act(() => {
		tree = create(<P2PRateSheet target={target} loading={false} onClose={jest.fn()} onSubmit={onSubmit} theme={theme} textStyles={createTextStyles(theme)} containerStyles={createContainerStyles(theme)} />)
	})
	return tree
}

const text = (tree) => JSON.stringify(tree.toJSON())
const saveButton = (tree) => tree.root.findByType('QPButton')

test('crear: en blanco, "Calificar ahora" espera a las estrellas', () => {
	const tree = render({ ...base, mode: 'create', mine: null })
	expect(text(tree)).toContain('Operación completada')
	expect(saveButton(tree).props.title).toBe('Calificar ahora')
	expect(saveButton(tree).props.disabled).toBe(true)
	act(() => { tree.root.findByType('QPRate').props.onRate(4) })
	expect(saveButton(tree).props.disabled).toBe(false)
})

test('crear tocando una estrella vacía: la hoja abre con esa puntuación marcada', () => {
	const tree = render({ ...base, mode: 'create', mine: null, initialRating: 4 })
	expect(tree.root.findByType('QPRate').props.value).toBe(4)
	expect(saveButton(tree).props.disabled).toBe(false)
})

test('editar: precargada con mi valoración, con el plazo y "Guardar cambios" solo si algo cambió', () => {
	const onSubmit = jest.fn()
	const mine = { rating: 4, comment: 'ok', tags: ['rapido'], editableUntil: '2026-10-22T18:04:11.000Z' }
	const tree = render({ ...base, rated: true, mode: 'edit', mine }, onSubmit)
	expect(text(tree)).toContain('Cambiar tu valoración')
	expect(text(tree)).toContain('Puedes cambiarla hasta el')
	expect(tree.root.findByType('QPRate').props.value).toBe(4)
	expect(tree.root.findByType('QPInput').props.value).toBe('ok')
	expect(saveButton(tree).props.title).toBe('Guardar cambios')
	expect(saveButton(tree).props.disabled).toBe(true)

	act(() => { tree.root.findByType('QPRate').props.onRate(5) })
	expect(saveButton(tree).props.disabled).toBe(false)
	act(() => { saveButton(tree).props.onPress() })
	expect(onSubmit).toHaveBeenCalledWith({ rating: 5, tags: ['rapido'], comment: 'ok' })
	expect(text(tree)).toContain('Cancelar')
})

test('sin trato no pinta nada', () => {
	expect(render(null).toJSON()).toBeNull()
})

describe('puerta del Modal (iOS)', () => {
	const modal = (tree) => tree.root.findByType('Modal')
	const update = (tree, target) => act(() => {
		tree.update(<P2PRateSheet target={target} loading={false} onClose={jest.fn()} onSubmit={jest.fn()} theme={theme} textStyles={createTextStyles(theme)} containerStyles={createContainerStyles(theme)} />)
	})

	test('cerrar antes de onShow mantiene la tarjeta hasta que la presentación termina y UIKit confirma el dismiss', () => {
		const tree = render({ ...base, mode: 'create', mine: null })
		update(tree, null)
		expect(modal(tree).props.visible).toBe(true)
		act(() => { modal(tree).props.onShow() })
		expect(modal(tree).props.visible).toBe(false)
		expect(text(tree)).toContain('Operación completada')
		act(() => { modal(tree).props.onDismiss() })
		expect(tree.toJSON()).toBeNull()
	})

	test('cada apertura nueva arranca en blanco', () => {
		const tree = render({ ...base, mode: 'create', mine: null })
		act(() => { modal(tree).props.onShow() })
		act(() => { tree.root.findByType('QPRate').props.onRate(3) })
		update(tree, null)
		act(() => { modal(tree).props.onDismiss() })
		update(tree, { ...base, mode: 'create', mine: null })
		expect(modal(tree).props.visible).toBe(true)
		expect(tree.root.findByType('QPRate').props.value).toBe(0)
	})
})
