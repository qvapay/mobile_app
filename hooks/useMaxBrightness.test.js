/**
 * Tests del brillo al máximo en las pantallas con QR (useMaxBrightness): sube
 * con foco + activo, restaura al desmontar, al perder el foco o al ocultar el
 * QR, y no revienta sin módulo nativo. El módulo falso tiene los métodos en el
 * prototipo, como un TurboModule real (ver useSecureScreen.test.js).
 * @jest-environment node
 */
const mockBoost = jest.fn(() => Promise.resolve(true))
const mockRestore = jest.fn(() => Promise.resolve(true))
let mockModule = null
let mockFocused = true
jest.mock('react-native', () => ({
	TurboModuleRegistry: { get: () => mockModule },
	NativeModules: {},
}))
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import useMaxBrightness from './useMaxBrightness'

const turboModuleLike = () => Object.create({ boost: mockBoost, restore: mockRestore })

const renderHook = active => {
	const Harness = ({ on }) => { useMaxBrightness(on); return null }
	let tree
	act(() => { tree = create(<Harness on={active} />) })
	return {
		update: on => act(() => { tree.update(<Harness on={on} />) }),
		unmount: () => act(() => { tree.unmount() }),
	}
}

beforeEach(() => {
	mockBoost.mockClear()
	mockRestore.mockClear()
	mockModule = turboModuleLike()
	mockFocused = true
})

test('con foco y activo sube el brillo', () => {
	renderHook(true)
	expect(mockBoost).toHaveBeenCalledTimes(1)
	expect(mockRestore).not.toHaveBeenCalled()
})

test('por defecto está activo', () => {
	const Harness = () => { useMaxBrightness(); return null }
	act(() => { create(<Harness />) })
	expect(mockBoost).toHaveBeenCalledTimes(1)
})

test('al desmontar la pantalla lo restaura', () => {
	renderHook(true).unmount()
	expect(mockRestore).toHaveBeenCalledTimes(1)
})

test('al ocultar el QR lo restaura y al enseñarlo de nuevo lo vuelve a subir', () => {
	const hook = renderHook(true)
	hook.update(false)
	expect(mockRestore).toHaveBeenCalledTimes(1)
	hook.update(true)
	expect(mockBoost).toHaveBeenCalledTimes(2)
	hook.unmount()
})

test('sin foco (otra pantalla encima) no sube, y al recuperar el foco sí', () => {
	mockFocused = false
	const hook = renderHook(true)
	expect(mockBoost).not.toHaveBeenCalled()
	mockFocused = true
	hook.update(true)
	expect(mockBoost).toHaveBeenCalledTimes(1)
	mockFocused = false
	hook.update(true)
	expect(mockRestore).toHaveBeenCalledTimes(1)
	hook.unmount()
})

test('inactivo: no toca el módulo', () => {
	renderHook(false).unmount()
	expect(mockBoost).not.toHaveBeenCalled()
	expect(mockRestore).not.toHaveBeenCalled()
})

test('sin módulo nativo no revienta', () => {
	mockModule = null
	const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
	expect(() => renderHook(true).unmount()).not.toThrow()
	warn.mockRestore()
})

test('un fallo del nativo se traga (promesa rechazada)', async () => {
	mockBoost.mockImplementationOnce(() => Promise.reject(new Error('x')))
	const hook = renderHook(true)
	await act(async () => { await Promise.resolve() })
	hook.unmount()
})
