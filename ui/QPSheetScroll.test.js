/**
 * El contenido de una hoja que termina en el PIN: cuando el teclado encoge la hoja, el scroll
 * va al final para que las cajas y el botón queden a la vista. Sin teclado no se mueve.
 * @jest-environment node
 */
import React from 'react'
import { Keyboard, Platform, ScrollView, Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPSheetScroll from './QPSheetScroll'

let listeners
let tree
let scrollToEnd

beforeEach(() => {
	listeners = {}
	jest.spyOn(Keyboard, 'addListener').mockImplementation((event, cb) => {
		listeners[event] = cb
		return { remove: jest.fn() }
	})
})

afterEach(() => {
	act(() => { tree.unmount() })
	jest.restoreAllMocks()
})

const render = () => {
	act(() => {
		tree = create(
			<QPSheetScroll contentContainerStyle={{ gap: 10 }}>
				<Text>PIN</Text>
			</QPSheetScroll>,
		)
	})
	scrollToEnd = jest.fn()
	// El ScrollView del preset es un mock de clase: su instancia es lo que recibe el ref
	tree.root.findByType(ScrollView).instance.scrollToEnd = scrollToEnd
}

// El alto del scroll cambia (la hoja sube y se encoge, o vuelve a su tamaño)
const resize = () => act(() => {
	tree.root.findByType(ScrollView).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 280 } } })
})

test('sin teclado, un cambio de alto no mueve el scroll', () => {
	render()
	resize()
	expect(scrollToEnd).not.toHaveBeenCalled()
})

test('iOS: cuando el teclado encoge la hoja, el scroll va al final', () => {
	render()
	act(() => { listeners.keyboardWillShow({ endCoordinates: { height: 336 } }) })
	// El aviso del teclado solo no basta: hasta que el alto nuevo está puesto no hay a dónde ir
	expect(scrollToEnd).not.toHaveBeenCalled()
	resize()
	expect(scrollToEnd).toHaveBeenCalledWith({ animated: true })
})

test('al cerrarse el teclado deja de mover el scroll', () => {
	render()
	act(() => { listeners.keyboardWillShow({ endCoordinates: { height: 336 } }) })
	resize()
	act(() => { listeners.keyboardWillHide() })
	resize()
	expect(scrollToEnd).toHaveBeenCalledTimes(1)
})

test('Android: igual, con los eventos que da esa plataforma', () => {
	jest.replaceProperty(Platform, 'OS', 'android')
	render()
	act(() => { listeners.keyboardDidShow({ endCoordinates: { height: 300 } }) })
	resize()
	expect(scrollToEnd).toHaveBeenCalledWith({ animated: true })
})

test('un toque en un botón con el teclado abierto no se pierde en cerrarlo', () => {
	render()
	expect(tree.root.findByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled')
	expect(tree.root.findByType(ScrollView).props.contentContainerStyle).toEqual({ gap: 10 })
})
