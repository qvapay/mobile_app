import { createContext, use } from 'react'

import useSettingsState from './useSettingsState'

// Create the Settings Context
const SettingsContext = createContext()

/**
 * Provides app-wide user settings (notifications, security, privacy, appearance,
 * language, transactions, p2p, investment, store, sounds, vibration, roundup).
 * A thin shell: state + logic live in the `useSettingsState` hook.
 *
 * Settings are non-secret and persist per category in AsyncStorage; secrets
 * (auth token, biometric creds, app-lock PIN) live in the Keychain instead.
 *
 * @param {{ children: React.ReactNode }} props
 */
export const SettingsProvider = ({ children }) => {

	const value = useSettingsState()

	return (
		<SettingsContext.Provider value={value}>
			{children}
		</SettingsContext.Provider>
	)
}

/**
 * Consumes the settings context. Throws if used outside a `SettingsProvider`.
 *
 * @returns {ReturnType<import('./useSettingsState').default>} `settings`,
 *   `isLoading`, `error`, the mutation helpers (`updateSettings`, `updateSetting`,
 *   `resetSettings`, `importSettings`, `exportSettings`, `clearError`), read
 *   helpers (`getSetting`, `isSettingEnabled`) and per-category shortcuts
 *   (`appearance`, `security`, `sounds`, ...).
 */
export const useSettings = () => {
	const context = use(SettingsContext)
	if (!context) { throw new Error('useSettings must be used within a SettingsProvider') }
	return context
}
