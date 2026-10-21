/**
 * El footer queda justo encima del teclado. En iOS se mide la vista EN LA VENTANA: el
 * KeyboardAvoidingView de RN usaba el frame relativo al padre y, bajo una cabecera opaca,
 * reservaba el teclado menos la cabecera (el botón quedaba tapado). En Android se reserva
 * el alto del teclado más el inset de abajo (edge-to-edge).
 * @jest-environment node
 */
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))

import React from 'react'
import { Keyboard, LayoutAnimation, Platform, Text, View } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPKeyboardAvoidingView from './QPKeyboardAvoidingView'

// iPhone de 956 pt con una cabecera opaca de 110: la pantalla ocupa de y=110 al fondo
const WINDOW = { y: 110, height: 846 }
const KEYBOARD = { height: 336, screenY: 956 - 336 }

let listeners
let removers
let configureNext

beforeEach(() => {
	listeners = {}
	removers = []
	jest.spyOn(Keyboard, 'addListener').mockImplementation((event, cb) => {
		listeners[event] = cb
		const sub = { remove: jest.fn() }
		removers.push(sub)
		return sub
	})
	configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => { })
})

afterEach(() => { jest.restoreAllMocks() })

const render = (frame = WINDOW) => {
	let tree
	act(() => {
		tree = create(
			<QPKeyboardAvoidingView style={{ flex: 1 }}>
				<Text>CONTENT</Text>
			</QPKeyboardAvoidingView>,
		)
	})
	// El View del preset es un mock de clase: su instancia es lo que recibe el ref
	tree.root.findByType(View).instance.measureInWindow = jest.fn(cb => cb(0, frame.y, 440, frame.height))
	return tree
}

const rootPadding = (tree) => {
	const style = [tree.root.findByType(View).props.style].flat(Infinity).filter(Boolean)
	return Object.assign({}, ...style).paddingBottom ?? 0
}

const show = (extra = {}) => act(() => {
	listeners.keyboardWillChangeFrame({ endCoordinates: KEYBOARD, duration: 250, easing: 'keyboard', ...extra })
})

describe('iOS', () => {
	test('bajo una cabecera reserva TODO lo que tapa el teclado, no el teclado menos la cabecera', () => {
		const tree = render()
		expect(rootPadding(tree)).toBe(0)
		show()
		// 110 + 846 − 620 = 336; el de RN daba 0 + 846 − 620 = 226 y el botón quedaba debajo
		expect(rootPadding(tree)).toBe(336)
	})

	test('a pantalla completa (un Modal) también cuadra', () => {
		const tree = render({ y: 0, height: 956 })
		show()
		expect(rootPadding(tree)).toBe(336)
	})

	test('una vista que no llega al fondo solo reserva la parte tapada', () => {
		const tree = render({ y: 110, height: 700 })
		show()
		expect(rootPadding(tree)).toBe(190)
	})

	test('sigue la curva del teclado y al esconderse suelta el hueco', () => {
		const tree = render()
		show()
		expect(configureNext).toHaveBeenCalledWith({ duration: 250, update: { duration: 250, type: 'keyboard' } })
		act(() => { listeners.keyboardWillHide({ endCoordinates: { height: 0, screenY: 956 }, duration: 250, easing: 'keyboard' }) })
		expect(rootPadding(tree)).toBe(0)
	})

	test('sin duración (teclado físico, cambios instantáneos) no anima', () => {
		render()
		show({ duration: 0, easing: undefined })
		expect(configureNext).not.toHaveBeenCalled()
	})

	test('quita los listeners al desmontar', () => {
		const tree = render()
		act(() => { tree.unmount() })
		expect(removers).toHaveLength(2)
		removers.forEach(sub => expect(sub.remove).toHaveBeenCalled())
	})
})

describe('Android', () => {
	beforeEach(() => { jest.replaceProperty(Platform, 'OS', 'android') })

	test('reserva el alto del teclado más el inset de abajo (edge-to-edge)', () => {
		const tree = render()
		act(() => { listeners.keyboardDidShow({ endCoordinates: { height: 300 } }) })
		expect(rootPadding(tree)).toBe(334)
		act(() => { listeners.keyboardDidHide() })
		expect(rootPadding(tree)).toBe(0)
	})
})
