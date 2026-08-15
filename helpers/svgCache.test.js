/**
 * Behavior tests de la caché de SVGs remotos (svgCache): hit síncrono de
 * memoria, read-through desde AsyncStorage, dedup de fetches en vuelo,
 * validación del payload (sin <svg> no se cachea) y errores de red —
 * node environment con AsyncStorage y fetch mockeados.
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
	__esModule: true,
	default: { getItem: jest.fn(), setItem: jest.fn() },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import { getCachedSvgSync, loadSvg, clearSvgMemory } from './svgCache'

const URI = 'https://cdn.example.com/logo.svg'

beforeEach(() => {
	clearSvgMemory()
	AsyncStorage.getItem.mockReset().mockResolvedValue(null)
	AsyncStorage.setItem.mockReset().mockResolvedValue()
	global.fetch = jest.fn().mockResolvedValue({ text: async () => '<svg>fresh</svg>' })
})

test('un fetch exitoso puebla memoria y AsyncStorage; el sync hit queda disponible', async () => {
	expect(getCachedSvgSync(URI)).toBe(null)
	const xml = await loadSvg(URI)
	expect(xml).toBe('<svg>fresh</svg>')
	expect(getCachedSvgSync(URI)).toBe('<svg>fresh</svg>')
	expect(AsyncStorage.setItem).toHaveBeenCalledWith(`svg_cache_uri_${URI}`, '<svg>fresh</svg>')
})

test('con memoria caliente no vuelve a tocar storage ni red', async () => {
	await loadSvg(URI)
	AsyncStorage.getItem.mockClear()
	global.fetch.mockClear()
	const xml = await loadSvg(URI)
	expect(xml).toBe('<svg>fresh</svg>')
	expect(AsyncStorage.getItem).not.toHaveBeenCalled()
	expect(global.fetch).not.toHaveBeenCalled()
})

test('read-through: un hit de AsyncStorage llena la memoria sin fetch', async () => {
	AsyncStorage.getItem.mockResolvedValue('<svg>stored</svg>')
	const xml = await loadSvg(URI, 'svg_cache_custom')
	expect(AsyncStorage.getItem).toHaveBeenCalledWith('svg_cache_custom')
	expect(xml).toBe('<svg>stored</svg>')
	expect(global.fetch).not.toHaveBeenCalled()
	expect(getCachedSvgSync(URI)).toBe('<svg>stored</svg>')
})

test('dedup: n llamadas concurrentes al mismo URL comparten un solo fetch', async () => {
	const results = await Promise.all([loadSvg(URI), loadSvg(URI), loadSvg(URI)])
	expect(results).toEqual(['<svg>fresh</svg>', '<svg>fresh</svg>', '<svg>fresh</svg>'])
	expect(global.fetch).toHaveBeenCalledTimes(1)
})

test('un payload sin <svg> resuelve null y NO se cachea (reintento posible)', async () => {
	global.fetch = jest.fn().mockResolvedValue({ text: async () => '<html>404</html>' })
	expect(await loadSvg(URI)).toBe(null)
	expect(AsyncStorage.setItem).not.toHaveBeenCalled()
	expect(getCachedSvgSync(URI)).toBe(null)
	// El siguiente intento vuelve a la red (no quedó promesa en vuelo zombie)
	global.fetch = jest.fn().mockResolvedValue({ text: async () => '<svg>ok</svg>' })
	expect(await loadSvg(URI)).toBe('<svg>ok</svg>')
})

test('un error de red resuelve null sin romper', async () => {
	global.fetch = jest.fn().mockRejectedValue(new Error('offline'))
	expect(await loadSvg(URI)).toBe(null)
	expect(getCachedSvgSync(URI)).toBe(null)
})
