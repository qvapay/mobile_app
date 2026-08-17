/**
 * Tests del estilo memoizado de `contentContainerStyle`.
 *
 * Lo que se fija aquí no son los números, sino la IDENTIDAD del objeto: el
 * motivo de existir del hook es que el estilo no cambie de referencia en cada
 * render. Un test que solo comprobara los valores pasaría igual con la versión
 * anterior, que creaba un objeto nuevo cada vez.
 * @jest-environment node
 */
let mockInsets = { top: 0, bottom: 34, left: 0, right: 0 }
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => mockInsets,
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import useContentPadding from './useContentPadding'

const renderHook = (...args) => {
	const result = { current: null, renders: 0 }
	const Harness = () => {
		result.current = useContentPadding(...args)
		result.renders++
		return null
	}
	let tree
	act(() => { tree = create(<Harness />) })
	result.rerender = () => act(() => { tree.update(<Harness />) })
	return result
}

beforeEach(() => { mockInsets = { top: 0, bottom: 34, left: 0, right: 0 } })

describe('valores', () => {
	test('suma el inset inferior al margen propio de la pantalla', () => {
		expect(renderHook(30).current).toEqual({ paddingBottom: 64 })
	})

	test('sin argumentos devuelve solo el inset', () => {
		expect(renderHook().current).toEqual({ paddingBottom: 34 })
	})

	test('el paddingTop solo aparece si se pide', () => {
		expect(renderHook(30).current.paddingTop).toBeUndefined()
		expect(renderHook(30, 8).current).toEqual({ paddingBottom: 64, paddingTop: 8 })
	})

	test('un inset de 0 (Android sin barra de gestos) no rompe la suma', () => {
		mockInsets = { top: 0, bottom: 0, left: 0, right: 0 }
		expect(renderHook(24).current).toEqual({ paddingBottom: 24 })
	})
})

describe('estabilidad', () => {
	test('devuelve EL MISMO objeto mientras el inset no cambie', () => {
		const hook = renderHook(30)
		const first = hook.current
		hook.rerender()
		hook.rerender()
		expect(hook.renders).toBeGreaterThan(1)
		expect(hook.current).toBe(first) // identidad, no igualdad
	})

	test('devuelve un objeto nuevo cuando cambia el inset (rotación)', () => {
		const hook = renderHook(30)
		const first = hook.current
		mockInsets = { top: 0, bottom: 0, left: 0, right: 0 }
		hook.rerender()
		expect(hook.current).not.toBe(first)
		expect(hook.current).toEqual({ paddingBottom: 30 })
	})
})
