import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './settingsConstants'
import type { Settings } from './settingsConstants'

// Vista "ancha" para los accesos dinámicos por clave: la forma estricta la
// da `Settings`; este cast local permite indexar por string sin perderla.
const KEYS = STORAGE_KEYS as Record<string, string>

/**
 * Loads every settings category from its own AsyncStorage key in parallel.
 * Missing or unparsable categories come back as `null` so `mergeWithDefaults`
 * can fill them in; a total storage failure resolves to `{}` (all defaults).
 *
 * @returns Map of category name → stored object or `null`.
 */
const loadAllSettings = async (): Promise<Record<string, unknown>> => {
	try {
		const [
			notifications,
			security,
			privacy,
			appearance,
			language,
			transactions,
			p2p,
			investment,
			store,
			sounds,
			vibration,
			roundup
		] = await Promise.all([
			AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS),
			AsyncStorage.getItem(STORAGE_KEYS.SECURITY),
			AsyncStorage.getItem(STORAGE_KEYS.PRIVACY),
			AsyncStorage.getItem(STORAGE_KEYS.APPEARANCE),
			AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE),
			AsyncStorage.getItem(STORAGE_KEYS.TRANSACTION_HISTORY),
			AsyncStorage.getItem(STORAGE_KEYS.P2P_SETTINGS),
			AsyncStorage.getItem(STORAGE_KEYS.INVESTMENT_SETTINGS),
			AsyncStorage.getItem(STORAGE_KEYS.STORE_SETTINGS),
			AsyncStorage.getItem(STORAGE_KEYS.SOUNDS),
			AsyncStorage.getItem(STORAGE_KEYS.VIBRATION),
			AsyncStorage.getItem(STORAGE_KEYS.ROUNDUP_SETTINGS)
		])

		return {
			notifications: notifications ? JSON.parse(notifications) : null,
			security: security ? JSON.parse(security) : null,
			privacy: privacy ? JSON.parse(privacy) : null,
			appearance: appearance ? JSON.parse(appearance) : null,
			language: language ? JSON.parse(language) : null,
			transactions: transactions ? JSON.parse(transactions) : null,
			p2p: p2p ? JSON.parse(p2p) : null,
			investment: investment ? JSON.parse(investment) : null,
			store: store ? JSON.parse(store) : null,
			sounds: sounds ? JSON.parse(sounds) : null,
			vibration: vibration ? JSON.parse(vibration) : null,
			roundup: roundup ? JSON.parse(roundup) : null
		}

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
 * `settingsConstants.STORAGE_KEYS`), loaded once on mount and merged over
 * `DEFAULT_SETTINGS`. Writes are optimistic — state updates first, then storage.
 *
 * Gotcha: writes resolve their key via `STORAGE_KEYS[category.toUpperCase()]`.
 * That only matches categories whose constant is named exactly like them
 * (NOTIFICATIONS, SECURITY, PRIVACY, APPEARANCE, LANGUAGE, SOUNDS, VIBRATION);
 * the rest (`transactions`, `p2p`, `investment`, `store`, `roundup`) fall back
 * to the shared `SETTINGS` key, which `loadAllSettings` does not read — so those
 * categories currently don't survive an app restart.
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
	 * category to its AsyncStorage key (see the storage-key gotcha above).
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
				KEYS[category.toUpperCase()] || STORAGE_KEYS.SETTINGS,
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
				KEYS[category.toUpperCase()] || STORAGE_KEYS.SETTINGS,
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
					KEYS[category.toUpperCase()] || STORAGE_KEYS.SETTINGS,
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

			// Save all settings to storage
			await Promise.all([
				AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(mergedSettings.notifications)),
				AsyncStorage.setItem(STORAGE_KEYS.SECURITY, JSON.stringify(mergedSettings.security)),
				AsyncStorage.setItem(STORAGE_KEYS.PRIVACY, JSON.stringify(mergedSettings.privacy)),
				AsyncStorage.setItem(STORAGE_KEYS.APPEARANCE, JSON.stringify(mergedSettings.appearance)),
				AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, JSON.stringify(mergedSettings.language)),
				AsyncStorage.setItem(STORAGE_KEYS.TRANSACTION_HISTORY, JSON.stringify(mergedSettings.transactions)),
				AsyncStorage.setItem(STORAGE_KEYS.P2P_SETTINGS, JSON.stringify(mergedSettings.p2p)),
				AsyncStorage.setItem(STORAGE_KEYS.INVESTMENT_SETTINGS, JSON.stringify(mergedSettings.investment)),
				AsyncStorage.setItem(STORAGE_KEYS.STORE_SETTINGS, JSON.stringify(mergedSettings.store)),
				AsyncStorage.setItem(STORAGE_KEYS.SOUNDS, JSON.stringify(mergedSettings.sounds)),
				AsyncStorage.setItem(STORAGE_KEYS.VIBRATION, JSON.stringify(mergedSettings.vibration)),
				AsyncStorage.setItem(STORAGE_KEYS.ROUNDUP_SETTINGS, JSON.stringify(mergedSettings.roundup))
			])

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
