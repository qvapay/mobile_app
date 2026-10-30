/**
 * Unit tests for the settings state hook, rendered with react-test-renderer —
 * node environment with AsyncStorage mocked (see keypadAmount.test.js for why).
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
import useSettingsState from './useSettingsState'
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './settingsConstants'

// Minimal hook harness: renders the hook inside a throwaway component and
// exposes its latest return value through `result.current`.
const renderHook = async () => {
	const result = { current: null }
	const Harness = () => {
		result.current = useSettingsState()
		return null
	}
	let root
	await act(async () => { root = create(React.createElement(Harness)) })
	return { result, root }
}

beforeEach(() => {
	jest.clearAllMocks()
	AsyncStorage.getItem.mockResolvedValue(null)
	AsyncStorage.setItem.mockResolvedValue()
	AsyncStorage.removeItem.mockResolvedValue()
})

describe('initialization', () => {
	test('empty storage yields the defaults with loading finished', async () => {
		const { result } = await renderHook()
		expect(result.current.isLoading).toBe(false)
		expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
	})

	test('stored categories merge OVER defaults without wiping missing keys', async () => {
		AsyncStorage.getItem.mockImplementation(async (key) => {
			if (key === STORAGE_KEYS.APPEARANCE) { return JSON.stringify({ theme: 'light' }) }
			return null
		})
		const { result } = await renderHook()
		expect(result.current.appearance.theme).toBe('light')
		// keys not present in storage keep their defaults
		expect(result.current.appearance.fontSize).toBe('medium')
		expect(result.current.appearance.firstTime).toBe(true)
		expect(result.current.security).toEqual(DEFAULT_SETTINGS.security)
	})

	test('a total storage failure falls back to defaults instead of crashing', async () => {
		AsyncStorage.getItem.mockRejectedValue(new Error('storage dead'))
		const { result } = await renderHook()
		expect(result.current.isLoading).toBe(false)
		expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
	})
})

describe('updateSetting / updateSettings', () => {
	test('updateSetting merges one key and persists the category to its own storage key', async () => {
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.updateSetting('appearance', 'theme', 'light') })
		expect(outcome).toEqual({ success: true })
		expect(result.current.appearance.theme).toBe('light')
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			STORAGE_KEYS.APPEARANCE,
			JSON.stringify({ ...DEFAULT_SETTINGS.appearance, theme: 'light' })
		)
	})

	test('updateSettings merges several values into one category', async () => {
		const { result } = await renderHook()
		await act(async () => {
			await result.current.updateSettings('security', { biometricsEnabled: true, autoLockTimeout: 1 })
		})
		expect(result.current.security.biometricsEnabled).toBe(true)
		expect(result.current.security.autoLockTimeout).toBe(1)
		expect(result.current.security.loginNotifications).toBe(true) // untouched
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.SECURITY, expect.any(String))
	})

	test('every category survives a restart (it is written to the key the next launch reads)', async () => {
		// AsyncStorage en memoria: lo que escribe una instancia lo lee la siguiente
		const disk = new Map()
		AsyncStorage.getItem.mockImplementation(async (key) => disk.get(key) ?? null)
		AsyncStorage.setItem.mockImplementation(async (key, value) => { disk.set(key, value) })

		const categories = Object.keys(DEFAULT_SETTINGS)
		const first = await renderHook()
		for (const category of categories) {
			await act(async () => { await first.result.current.updateSetting(category, 'probe', category) })
		}
		// Regresión: `transactions`, `p2p`, `investment`, `store` y `roundup` caían aquí
		expect(disk.has(STORAGE_KEYS.SETTINGS)).toBe(false)

		const second = await renderHook()
		for (const category of categories) {
			expect(second.result.current.settings[category].probe).toBe(category)
		}
	})

	test('roundup keeps the user choice across a restart', async () => {
		const disk = new Map()
		AsyncStorage.getItem.mockImplementation(async (key) => disk.get(key) ?? null)
		AsyncStorage.setItem.mockImplementation(async (key, value) => { disk.set(key, value) })

		const first = await renderHook()
		await act(async () => { await first.result.current.updateSettings('roundup', { enabled: true, destination: 'savings' }) })
		const second = await renderHook()
		expect(second.result.current.roundup).toEqual({ enabled: true, destination: 'savings' })
	})

	test('a persistence failure reports the error but keeps the optimistic state', async () => {
		AsyncStorage.setItem.mockRejectedValue(new Error('disk full'))
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.updateSetting('appearance', 'theme', 'light') })
		expect(outcome).toEqual({ success: false, error: 'disk full' })
		expect(result.current.error).toBe('Failed to update setting')
		expect(result.current.appearance.theme).toBe('light') // optimistic update stands
	})
})

describe('resetSettings', () => {
	test('resetting one category writes its defaults back to storage', async () => {
		AsyncStorage.getItem.mockImplementation(async (key) =>
			key === STORAGE_KEYS.APPEARANCE ? JSON.stringify({ theme: 'light' }) : null
		)
		const { result } = await renderHook()
		expect(result.current.appearance.theme).toBe('light')
		await act(async () => { await result.current.resetSettings('appearance') })
		expect(result.current.appearance.theme).toBe('dark')
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			STORAGE_KEYS.APPEARANCE,
			JSON.stringify(DEFAULT_SETTINGS.appearance)
		)
	})

	test('resetting a category without a same-named constant writes to its own key', async () => {
		const { result } = await renderHook()
		await act(async () => { await result.current.resetSettings('roundup') })
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			STORAGE_KEYS.ROUNDUP_SETTINGS,
			JSON.stringify(DEFAULT_SETTINGS.roundup)
		)
	})

	test('resetting everything clears every storage key and restores all defaults', async () => {
		const { result } = await renderHook()
		await act(async () => { await result.current.resetSettings() })
		expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
		for (const key of Object.values(STORAGE_KEYS)) {
			expect(AsyncStorage.removeItem).toHaveBeenCalledWith(key)
		}
	})
})

describe('export / import', () => {
	test('exportSettings wraps the current settings in a versioned payload', async () => {
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.exportSettings() })
		expect(outcome.success).toBe(true)
		expect(outcome.data.version).toBe('1.0')
		expect(typeof outcome.data.timestamp).toBe('string')
		expect(outcome.data.settings).toEqual(DEFAULT_SETTINGS)
	})

	test('importSettings validates the payload', async () => {
		const { result } = await renderHook()
		let outcome
		await act(async () => { outcome = await result.current.importSettings(null) })
		expect(outcome).toEqual({ success: false, error: 'Invalid settings data' })
		expect(result.current.error).toBe('Failed to import settings')
	})

	test('importSettings merges over defaults and persists every category', async () => {
		const { result } = await renderHook()
		const payload = { settings: { appearance: { theme: 'light' }, p2p: { enabled: false } } }
		let outcome
		await act(async () => { outcome = await result.current.importSettings(payload) })
		expect(outcome).toEqual({ success: true })
		expect(result.current.appearance.theme).toBe('light')
		expect(result.current.p2p.enabled).toBe(false)
		// Todas las categorías, un setItem cada una (`crypto` incluida: antes faltaba)
		expect(AsyncStorage.setItem).toHaveBeenCalledTimes(Object.keys(DEFAULT_SETTINGS).length)
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.P2P_SETTINGS, expect.any(String))
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.CRYPTO, expect.any(String))
	})

	test('export → import round-trips the settings', async () => {
		const first = await renderHook()
		await act(async () => { await first.result.current.updateSetting('appearance', 'theme', 'light') })
		let exported
		await act(async () => { exported = await first.result.current.exportSettings() })

		const second = await renderHook()
		await act(async () => { await second.result.current.importSettings(exported.data) })
		expect(second.result.current.appearance.theme).toBe('light')
	})
})

describe('getSetting / isSettingEnabled', () => {
	test('getSetting reads with a fallback and never throws', async () => {
		const { result } = await renderHook()
		expect(result.current.getSetting('appearance', 'theme')).toBe('dark')
		expect(result.current.getSetting('appearance', 'missing', 'x')).toBe('x')
		expect(result.current.getSetting('nope', 'nothing', 42)).toBe(42)
	})

	test('isSettingEnabled defaults to false', async () => {
		const { result } = await renderHook()
		expect(result.current.isSettingEnabled('notifications', 'pushEnabled')).toBe(true)
		expect(result.current.isSettingEnabled('notifications', 'missing')).toBe(false)
	})

	test('clearError wipes the error state', async () => {
		AsyncStorage.setItem.mockRejectedValue(new Error('x'))
		const { result } = await renderHook()
		await act(async () => { await result.current.updateSetting('appearance', 'theme', 'light') })
		expect(result.current.error).not.toBeNull()
		await act(async () => { result.current.clearError() })
		expect(result.current.error).toBeNull()
	})
})
