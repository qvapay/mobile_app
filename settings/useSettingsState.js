import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './settingsConstants'

/**
 * Loads every settings category from its own AsyncStorage key in parallel.
 * Missing or unparsable categories come back as `null` so `mergeWithDefaults`
 * can fill them in; a total storage failure resolves to `{}` (all defaults).
 *
 * @returns {Promise<Object>} Map of category name → stored object or `null`.
 */
const loadAllSettings = async () => {
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
 * @param {Object} storedSettings - Output of `loadAllSettings` (or an import payload).
 * @returns {Object} Complete settings object with every category populated.
 */
const mergeWithDefaults = (storedSettings) => {
	const merged = { ...DEFAULT_SETTINGS }
	Object.keys(storedSettings).forEach(category => {
		if (storedSettings[category]) {
			merged[category] = {
				...merged[category],
				...storedSettings[category]
			}
		}
	})
	return merged
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
 *   updateSettings: Function,
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
	const [settings, setSettings] = useState(DEFAULT_SETTINGS)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState(null)

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
	 * @param {string} category - Category name, e.g. 'appearance'.
	 * @param {Object} newSettings - Partial category object to merge in.
	 * @returns {Promise<{ success: boolean, error?: string }>}
	 */
	const updateSettings = async (category, newSettings) => {

		try {

			setError(null)

			// Update state
			const updatedSettings = {
				...settings,
				[category]: {
					...settings[category],
					...newSettings
				}
			}

			setSettings(updatedSettings)

			// Save to storage
			await AsyncStorage.setItem(
				STORAGE_KEYS[category.toUpperCase()] || STORAGE_KEYS.SETTINGS,
				JSON.stringify(updatedSettings[category])
			)

			return { success: true }

		} catch (err) {
			setError('Failed to update settings')
			return { success: false, error: err.message }
		}
	}

	/**
	 * Sets a single key within a category and persists the whole category.
	 *
	 * @param {string} category - Category name, e.g. 'security'.
	 * @param {string} key - Setting key within the category, e.g. 'autoLockTimeout'.
	 * @param {*} value - New value.
	 * @returns {Promise<{ success: boolean, error?: string }>}
	 */
	const updateSetting = async (category, key, value) => {

		try {

			setError(null)

			// Update state
			const updatedSettings = {
				...settings,
				[category]: {
					...settings[category],
					[key]: value
				}
			}

			setSettings(updatedSettings)

			// Save to storage
			await AsyncStorage.setItem(
				STORAGE_KEYS[category.toUpperCase()] || STORAGE_KEYS.SETTINGS,
				JSON.stringify(updatedSettings[category])
			)

			return { success: true }

		} catch (err) {
			setError('Failed to update setting')
			return { success: false, error: err.message }
		}
	}

	/**
	 * Resets one category (writes its defaults to storage) or, with no argument,
	 * ALL settings — clearing every `STORAGE_KEYS` entry from AsyncStorage.
	 *
	 * @param {string|null} [category] - Category to reset, or null/omitted for everything.
	 * @returns {Promise<{ success: boolean, error?: string }>}
	 */
	const resetSettings = async (category = null) => {

		try {

			setError(null)

			if (category) {
				// Reset specific category
				const updatedSettings = {
					...settings,
					[category]: DEFAULT_SETTINGS[category]
				}

				setSettings(updatedSettings)

				await AsyncStorage.setItem(
					STORAGE_KEYS[category.toUpperCase()] || STORAGE_KEYS.SETTINGS,
					JSON.stringify(DEFAULT_SETTINGS[category])
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

		} catch (err) {
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
		} catch (err) {
			setError('Failed to export settings')
			return { success: false, error: err.message }
		}
	}

	/**
	 * Imports a payload produced by `exportSettings`: validates it, merges it
	 * over the defaults, and persists every category to its own storage key.
	 *
	 * @param {{ settings: Object }} settingsData - Export payload to restore.
	 * @returns {Promise<{ success: boolean, error?: string }>}
	 */
	const importSettings = async (settingsData) => {

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

		} catch (err) {
			setError('Failed to import settings')
			return { success: false, error: err.message }
		}
	}

	// Clear error
	const clearError = () => { setError(null) }

	/**
	 * Reads a single setting with a fallback, never throwing.
	 *
	 * @param {string} category - Category name.
	 * @param {string} key - Setting key within the category.
	 * @param {*} [defaultValue=null] - Returned when the value is missing/nullish.
	 * @returns {*} The stored value or `defaultValue`.
	 */
	const getSetting = (category, key, defaultValue = null) => {
		try {
			return settings[category]?.[key] ?? defaultValue
		} catch (err) {
			// error getting setting
			return defaultValue
		}
	}

	/**
	 * Boolean shorthand for `getSetting(category, key, false)`.
	 *
	 * @param {string} category - Category name.
	 * @param {string} key - Setting key within the category.
	 * @returns {boolean}
	 */
	const isSettingEnabled = (category, key) => { return getSetting(category, key, false) }

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
