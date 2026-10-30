import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { STORAGE_KEYS, DEFAULT_SETTINGS, CATEGORY_STORAGE_KEYS } from './settingsConstants'
import type { Settings } from './settingsConstants'

/** Categorías con su clave de AsyncStorage (la misma tabla para leer y para escribir). */
const CATEGORY_ENTRIES = Object.entries(CATEGORY_STORAGE_KEYS)

/**
 * Clave de AsyncStorage de una categoría. Una categoría desconocida cae en la
 * genérica `SETTINGS`, que la carga no lee (no existe en `DEFAULT_SETTINGS`).
 *
 * @param category - Category name, e.g. 'roundup'.
 * @returns Storage key.
 */
const storageKeyFor = (category: string): string => (CATEGORY_STORAGE_KEYS as Record<string, string>)[category] ?? STORAGE_KEYS.SETTINGS

/**
 * Loads every settings category from its own AsyncStorage key in parallel.
 * Missing or unparsable categories come back as `null` so `mergeWithDefaults`
 * can fill them in; a total storage failure resolves to `{}` (all defaults).
 *
 * @returns Map of category name → stored object or `null`.
 */
const loadAllSettings = async (): Promise<Record<string, unknown>> => {
	try {
		const stored = await Promise.all(CATEGORY_ENTRIES.map(([, key]) => AsyncStorage.getItem(key)))
		return Object.fromEntries(CATEGORY_ENTRIES.map(([category], i) => [category, stored[i] ? JSON.parse(stored[i]) : null]))
	} catch (err) { return {} }
}

/**
 * Merges stored settings over `DEFAULT_SETTINGS`, category by category, so
 * new keys added in app updates get their defaults without wiping user choices.
 *
 * @param storedSettings - Output of `loadAllSettings` (or an import payload).
 * @returns Complete settings object with every category populated.
 */
const mergeWithDefaults = (storedSettings: Record<string, unknown>): Settings => {
	const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS }
	Object.keys(storedSettings).forEach(category => {
		if (storedSettings[category]) {
			merged[category] = {
				...(merged[category] as object),
				...(storedSettings[category] as object)
			}
		}
	})
	return merged as Settings
}

/**
 * Owns the settings state + all read/write/reset/import/export logic.
 * Lives in a hook (not the provider component) per the "lift logic into hooks" pattern.
 *
 * Persistence: granular AsyncStorage keys, one per category (see
 * `settingsConstants.CATEGORY_STORAGE_KEYS`, shared by every read and write
 * path), loaded once on mount and merged over `DEFAULT_SETTINGS`. Writes are
 * optimistic — state updates first, then storage.
 *
 * @returns {{
 *   settings: Object,
 *   isLoading: boolean,
 *   error: string|null,
 *   updateSettings: (category: string, newSettings: Object) => Promise<{ success: boolean, error?: string }>,
 *   updateSetting: Function,
 *   resetSettings: Function,
 *   exportSettings: Function,
 *   importSettings: Function,
 *   clearError: Function,
 *   getSetting: Function,
 *   isSettingEnabled: Function,
 * }} Plus one convenience getter per category (`notifications`, `security`, ...).
 */
export default function useSettingsState() {

	// State for settings
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// Initialize settings on app start
	useEffect(() => {
		initializeSettings()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Initialize settings from storage
	const initializeSettings = async () => {
		try {
			setIsLoading(true)
			setError(null)

			// Load all settings from storage
			const storedSettings = await loadAllSettings()

			// Merge with defaults for any missing settings
			const mergedSettings = mergeWithDefaults(storedSettings)

			setSettings(mergedSettings)

		} catch (err) {
			setError('Failed to load settings')
			// Use default settings if loading fails
			setSettings(DEFAULT_SETTINGS)
		} finally {
			setIsLoading(false)
		}
	}

	/**
	 * Merges several values into one settings category and persists that
	 * category to its AsyncStorage key.
	 *
	 * @param category - Category name, e.g. 'appearance'.
	 * @param newSettings - Partial category object to merge in.
	 * @returns `{ success, error? }`
	 */
	const updateSettings = async (category: string, newSettings: Record<string, unknown>) => {

		try {

			setError(null)

			// Update state
			const updatedSettings = {
				...settings,
				[category]: {
					...(settings as Record<string, unknown>)[category] as object,
					...newSettings
				}
			} as Settings

			setSettings(updatedSettings)

			// Save to storage
			await AsyncStorage.setItem(
				storageKeyFor(category),
				JSON.stringify((updatedSettings as Record<string, unknown>)[category])
			)

			return { success: true }

		} catch (e) {
			const err = e as { message?: string }
			setError('Failed to update settings')
			return { success: false, error: err.message }
		}
	}

	/**
	 * Sets a single key within a category and persists the whole category.
	 *
	 * @param category - Category name, e.g. 'security'.
	 * @param key - Setting key within the category, e.g. 'autoLockTimeout'.
	 * @param value - New value.
	 * @returns `{ success, error? }`
	 */
	const updateSetting = async (category: string, key: string, value: unknown) => {

		try {

			setError(null)

			// Update state
			const updatedSettings = {
				...settings,
				[category]: {
					...(settings as Record<string, unknown>)[category] as object,
					[key]: value
				}
			} as Settings

			setSettings(updatedSettings)

			// Save to storage
			await AsyncStorage.setItem(
				storageKeyFor(category),
				JSON.stringify((updatedSettings as Record<string, unknown>)[category])
			)

			return { success: true }

		} catch (e) {
			const err = e as { message?: string }
			setError('Failed to update setting')
			return { success: false, error: err.message }
		}
	}

	/**
	 * Resets one category (writes its defaults to storage) or, with no argument,
	 * ALL settings — clearing every `STORAGE_KEYS` entry from AsyncStorage.
	 *
	 * @param category - Category to reset, or null/omitted for everything.
	 * @returns `{ success, error? }`
	 */
	const resetSettings = async (category: string | null = null) => {

		try {

			setError(null)

			if (category) {
				// Reset specific category
				const updatedSettings = {
					...settings,
					[category]: (DEFAULT_SETTINGS as Record<string, unknown>)[category]
				} as Settings

				setSettings(updatedSettings)

				await AsyncStorage.setItem(
					storageKeyFor(category),
					JSON.stringify((DEFAULT_SETTINGS as Record<string, unknown>)[category])
				)
			} else {
				// Reset all settings
				setSettings(DEFAULT_SETTINGS)

				// Clear all settings from storage
				await Promise.all(
					Object.values(STORAGE_KEYS).map(key =>
						AsyncStorage.removeItem(key)
					)
				)
			}

			return { success: true }

		} catch (e) {
			const err = e as { message?: string }
			setError('Failed to reset settings')
			return { success: false, error: err.message }
		}
	}

	/**
	 * Exports the current settings as a versioned, timestamped payload
	 * (`{ version, timestamp, settings }`) suitable for `importSettings`.
	 *
	 * @returns {Promise<{ success: boolean, data?: Object, error?: string }>}
	 */
	const exportSettings = async () => {

		try {

			const settingsData = {
				version: '1.0',
				timestamp: new Date().toISOString(),
				settings: settings
			}

			return { success: true, data: settingsData }
		} catch (e) {
			const err = e as { message?: string }
			setError('Failed to export settings')
			return { success: false, error: err.message }
		}
	}

	/**
	 * Imports a payload produced by `exportSettings`: validates it, merges it
	 * over the defaults, and persists every category to its own storage key.
	 *
	 * @param settingsData - Export payload to restore.
	 * @returns `{ success, error? }`
	 */
	const importSettings = async (settingsData: { settings: Record<string, unknown> } | null | undefined) => {

		try {

			setError(null)

			// Validate settings data
			if (!settingsData || !settingsData.settings) {
				throw new Error('Invalid settings data')
			}

			// Merge imported settings with defaults
			const mergedSettings = mergeWithDefaults(settingsData.settings)

			setSettings(mergedSettings)

			// Save all settings to storage (todas las categorías: antes faltaba `crypto`)
			await Promise.all(CATEGORY_ENTRIES.map(([category, key]) =>
				AsyncStorage.setItem(key, JSON.stringify((mergedSettings as Record<string, unknown>)[category]))
			))

			return { success: true }

		} catch (e) {
			const err = e as { message?: string }
			setError('Failed to import settings')
			return { success: false, error: err.message }
		}
	}

	// Clear error
	const clearError = () => { setError(null) }

	/**
	 * Reads a single setting with a fallback, never throwing.
	 *
	 * @param category - Category name.
	 * @param key - Setting key within the category.
	 * @param defaultValue - Returned when the value is missing/nullish.
	 * @returns The stored value or `defaultValue`.
	 */
	const getSetting = (category: string, key: string, defaultValue: unknown = null): unknown => {
		try {
			return (settings as Record<string, Record<string, unknown> | undefined>)[category]?.[key] ?? defaultValue
		} catch (err) {
			// error getting setting
			return defaultValue
		}
	}

	/**
	 * Boolean shorthand for `getSetting(category, key, false)`.
	 *
	 * @param category - Category name.
	 * @param key - Setting key within the category.
	 * @returns Si el ajuste está activo (los valores de estos toggles son booleanos).
	 */
	const isSettingEnabled = (category: string, key: string) => { return getSetting(category, key, false) as boolean }

	return {

		// State
		settings,
		isLoading,
		error,

		// Functions
		updateSettings,
		updateSetting,
		resetSettings,
		exportSettings,
		importSettings,
		clearError,
		getSetting,
		isSettingEnabled,

		// Convenience getters for common settings
		notifications: settings.notifications,
		security: settings.security,
		privacy: settings.privacy,
		appearance: settings.appearance,
		language: settings.language,
		transactions: settings.transactions,
		p2p: settings.p2p,
		investment: settings.investment,
		store: settings.store,
		sounds: settings.sounds,
		vibration: settings.vibration,
		roundup: settings.roundup
	}
}
