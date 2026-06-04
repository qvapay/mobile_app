import { createContext, useContext } from 'react'

import useSettingsState from './useSettingsState'

// Create the Settings Context
const SettingsContext = createContext()

// Settings Provider Component — state + logic live in the useSettingsState hook
export const SettingsProvider = ({ children }) => {

	const value = useSettingsState()

	return (
		<SettingsContext.Provider value={value}>
			{children}
		</SettingsContext.Provider>
	)
}

// Custom hook to use the settings context
export const useSettings = () => {
	const context = useContext(SettingsContext)
	if (!context) { throw new Error('useSettings must be used within a SettingsProvider') }
	return context
}
