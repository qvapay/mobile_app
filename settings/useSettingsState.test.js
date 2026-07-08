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

	test('KNOWN GOTCHA: categories without a same-named constant fall back to the shared SETTINGS key, which loadAllSettings never reads (they do not survive a restart)', async () => {
		const { result } = await renderHook()
		await act(async () => { await result.current.updateSetting('transactions', 'showFees', false) })
		// STORAGE_KEYS.TRANSACTIONS does not exist (the constant is TRANSACTION_HISTORY),
		// so the write lands on the generic fallback key.
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.SETTINGS, expect.any(String))
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
		// 12 categories, one setItem each
		expect(AsyncStorage.setItem).toHaveBeenCalledTimes(12)
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.P2P_SETTINGS, expect.any(String))
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
