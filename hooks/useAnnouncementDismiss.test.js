/**
 * Unit tests for the announcement dismissal gating — node environment with
 * AsyncStorage mocked (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import useAnnouncementDismiss, { dismissKey, isDismissalActive } from './useAnnouncementDismiss'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-08-28T12:00:00.000Z').getTime()

const renderDismiss = async (id, dismissDays) => {
	const result = { current: null }
	const Harness = ({ announcementId, days }) => {
		result.current = useAnnouncementDismiss(announcementId, days)
		return null
	}
	let tree
	await act(async () => { tree = create(<Harness announcementId={id} days={dismissDays} />) })
	return { result, tree, Harness }
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers({ now: NOW })
	AsyncStorage.getItem.mockResolvedValue(null)
	AsyncStorage.setItem.mockResolvedValue()
	AsyncStorage.removeItem.mockResolvedValue()
})
afterEach(() => { jest.useRealTimers() })

describe('isDismissalActive', () => {

	test('sin descarte previo el aviso se ve', () => {
		expect(isDismissalActive(null, 10, NOW)).toBe(false)
	})

	test('dismiss_days 0 esconde el aviso para siempre', () => {
		expect(isDismissalActive(NOW - 365 * DAY_MS, 0, NOW)).toBe(true)
	})

	test('dentro de la ventana sigue oculto; pasada, reaparece', () => {
		expect(isDismissalActive(NOW - 3 * DAY_MS, 10, NOW)).toBe(true)
		expect(isDismissalActive(NOW - 11 * DAY_MS, 10, NOW)).toBe(false)
	})
})

describe('useAnnouncementDismiss', () => {

	test('sin aviso no consulta el almacenamiento y no se pinta nada', async () => {
		const { result } = await renderDismiss(null, 10)
		expect(AsyncStorage.getItem).not.toHaveBeenCalled()
		expect(result.current.visible).toBe(false)
	})

	test('un aviso nunca descartado se muestra', async () => {
		const { result } = await renderDismiss('42', 10)
		expect(AsyncStorage.getItem).toHaveBeenCalledWith('announcement_dismissed_42')
		expect(result.current.visible).toBe(true)
	})

	test('un descarte vigente lo mantiene oculto', async () => {
		AsyncStorage.getItem.mockResolvedValue(String(NOW - 2 * DAY_MS))
		const { result } = await renderDismiss('42', 10)
		expect(result.current.visible).toBe(false)
	})

	test('un descarte caducado reaparece y se limpia la clave muerta', async () => {
		AsyncStorage.getItem.mockResolvedValue(String(NOW - 20 * DAY_MS))
		const { result } = await renderDismiss('42', 10)
		expect(AsyncStorage.removeItem).toHaveBeenCalledWith('announcement_dismissed_42')
		expect(result.current.visible).toBe(true)
	})

	test('descartar oculta al instante y persiste la marca de tiempo', async () => {
		const { result } = await renderDismiss('42', 10)
		await act(async () => { result.current.dismiss() })
		expect(result.current.visible).toBe(false)
		expect(AsyncStorage.setItem).toHaveBeenCalledWith('announcement_dismissed_42', String(NOW))
	})

	test('la clave cuelga del id: un aviso NUEVO se muestra aunque el anterior estuviera descartado', async () => {
		// El aviso 42 quedó descartado para siempre; llega el 43
		AsyncStorage.getItem.mockImplementation(async key => (key === dismissKey('42') ? String(NOW) : null))
		const { result } = await renderDismiss('43', 0)
		expect(result.current.visible).toBe(true)
	})

	test('si el almacenamiento falla se muestra: mejor repetir un aviso que tragárselo', async () => {
		AsyncStorage.getItem.mockRejectedValue(new Error('storage unavailable'))
		const { result } = await renderDismiss('42', 10)
		expect(result.current.visible).toBe(true)
	})
})
