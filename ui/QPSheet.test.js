/**
 * Una hoja con `avoidKeyboard` sube con el teclado en las DOS plataformas. Antes envolvía su
 * contenido en el `KeyboardAvoidingView` de RN con `behavior` solo en iOS: en Android (edge-
 * to-edge: la ventana no se encoge) no hacía nada, y el PIN del swap saldo → QUSD y el del
 * pago de una mini-app se tecleaban debajo del teclado.
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))
jest.mock('react-native-reanimated', () => {
	const { View } = require('react-native')
	return { __esModule: true, default: { View } }
})
jest.mock('./sheetConfig', () => ({ SHEET_ENTERING: undefined, SHEET_MAX_RATIO: 0.92 }))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform, Text, View } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPSheet from './QPSheet'

const VEIL = 'rgba(0,0,0,0.55)'

let listeners
let tree

beforeEach(() => {
	listeners = {}
	jest.spyOn(Keyboard, 'addListener').mockImplementation((event, cb) => {
		listeners[event] = cb
		return { remove: jest.fn() }
	})
	jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => { })
})

afterEach(() => {
	act(() => { tree.unmount() })
	jest.restoreAllMocks()
})

const render = (props = {}) => {
	act(() => {
		tree = create(
			<QPSheet visible title="Revisa tu swap" onClose={jest.fn()} {...props}>
				<Text>PIN</Text>
			</QPSheet>,
		)
	})
}

const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
// Los nodos nativos tal como quedan pintados: un Pressable y su View no cuentan dos veces
const hostNodes = (node, out = []) => {
	if (!node || typeof node === 'string') { return out }
	if (Array.isArray(node)) { node.forEach(child => hostNodes(child, out)); return out }
	out.push(node)
	return hostNodes(node.children, out)
}
const painted = () => hostNodes(tree.toJSON())
const bottomPaddings = () => painted().map(node => flat(node.props.style).paddingBottom).filter(value => value !== undefined)
const veils = () => painted().filter(node => flat(node.props.style).backgroundColor === VEIL).length

describe('Android', () => {
	beforeEach(() => { jest.replaceProperty(Platform, 'OS', 'android') })

	test('con avoidKeyboard deja al teclado su alto más el inset de abajo, y lo suelta al cerrarse', () => {
		render({ avoidKeyboard: true })
		// Solo el margen inferior de la propia hoja
		expect(bottomPaddings()).toEqual([34])
		act(() => { listeners.keyboardDidShow({ endCoordinates: { height: 300 } }) })
		expect(bottomPaddings()).toEqual([334, 34])
		act(() => { listeners.keyboardDidHide() })
		expect(bottomPaddings()).toEqual([34])
	})

	test('sin avoidKeyboard ni escucha el teclado ni se mueve', () => {
		render()
		expect(Keyboard.addListener).not.toHaveBeenCalled()
		expect(bottomPaddings()).toEqual([34])
	})
})

describe('iOS', () => {
	test('con avoidKeyboard reserva lo que tapa el teclado, medido en la ventana', () => {
		render({ avoidKeyboard: true })
		const avoider = tree.root.findAllByType(View).find(view => flat(view.props.style).backgroundColor === VEIL)
		avoider.instance.measureInWindow = jest.fn(cb => cb(0, 0, 440, 956))
		act(() => { listeners.keyboardWillChangeFrame({ endCoordinates: { height: 336, screenY: 620 }, duration: 250, easing: 'keyboard' }) })
		expect(bottomPaddings()).toEqual([336, 34])
		act(() => { listeners.keyboardWillHide({ endCoordinates: { height: 0, screenY: 956 }, duration: 250, easing: 'keyboard' }) })
		expect(bottomPaddings()).toEqual([34])
	})
})

test('no usa el KeyboardAvoidingView de RN, que sin `behavior` no hace nada en Android', () => {
	render({ avoidKeyboard: true })
	expect(tree.root.findAllByType(KeyboardAvoidingView)).toHaveLength(0)
})

test('el velo se pinta una sola vez, con o sin avoidKeyboard', () => {
	render()
	expect(veils()).toBe(1)
	act(() => { tree.unmount() })
	render({ avoidKeyboard: true })
	expect(veils()).toBe(1)
})
