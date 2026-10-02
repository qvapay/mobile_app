/**
 * Tests del bloqueo de capturas en las pantallas de la frase secreta.
 *
 * El módulo falso imita la forma REAL de un TurboModule en la nueva
 * arquitectura: los métodos viven en el prototipo, no como propiedades
 * propias. Con esa forma, el default export de react-native-screenshot-prevent
 * (`{ ...nativeModule }`) se quedaba sin `enabled` y el bloqueo nunca se
 * activaba en producción — un stub con métodos propios no lo habría detectado.
 * @jest-environment node
 */
const mockEnabled = jest.fn()
let mockModule = null
jest.mock('react-native', () => ({
	TurboModuleRegistry: { get: () => mockModule },
	NativeModules: {},
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import useSecureScreen from './useSecureScreen'

const turboModuleLike = () => Object.create({ enabled: mockEnabled })

const renderHook = active => {
	const Harness = ({ on }) => { useSecureScreen(on); return null }
	let tree
	act(() => { tree = create(<Harness on={active} />) })
	return {
		update: on => act(() => { tree.update(<Harness on={on} />) }),
		unmount: () => act(() => { tree.unmount() }),
	}
}

beforeEach(() => {
	mockEnabled.mockClear()
	mockModule = turboModuleLike()
})

test('el spread de un TurboModule pierde sus métodos (el bug de la librería)', () => {
	expect({ ...turboModuleLike() }.enabled).toBeUndefined()
})

test('activo: enciende el bloqueo en el módulo nativo', () => {
	renderHook(true)
	expect(mockEnabled).toHaveBeenCalledWith(true)
})

test('al desmontar la pantalla lo apaga', () => {
	const hook = renderHook(true)
	hook.unmount()
	expect(mockEnabled).toHaveBeenLastCalledWith(false)
})

test('al ocultar la frase lo apaga, y al revelarla de nuevo lo vuelve a encender', () => {
	const hook = renderHook(true)
	hook.update(false)
	expect(mockEnabled).toHaveBeenLastCalledWith(false)
	hook.update(true)
	expect(mockEnabled).toHaveBeenLastCalledWith(true)
	hook.unmount()
})

test('inactivo: no toca el módulo', () => {
	renderHook(false).unmount()
	expect(mockEnabled).not.toHaveBeenCalled()
})

test('sin módulo nativo no revienta', () => {
	mockModule = null
	const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
	expect(() => renderHook(true).unmount()).not.toThrow()
	warn.mockRestore()
})
