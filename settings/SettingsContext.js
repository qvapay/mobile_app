import { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Create the Settings Context
const SettingsContext = createContext()

// Storage keys for settings
const STORAGE_KEYS = {
    SETTINGS: 'app_settings',
    NOTIFICATIONS: 'notification_settings',
    SECURITY: 'security_settings',
    PRIVACY: 'privacy_settings',
    APPEARANCE: 'appearance_settings',
    LANGUAGE: 'language_settings',
    CURRENCY: 'currency_settings',
    BIOMETRICS: 'biometrics_settings',
    SOUNDS: 'sound_settings',
    VIBRATION: 'vibration_settings',
    AUTO_LOCK: 'auto_lock_settings',
    TRANSACTION_HISTORY: 'transaction_history_settings',
    P2P_SETTINGS: 'p2p_settings',
    INVESTMENT_SETTINGS: 'investment_settings',
    STORE_SETTINGS: 'store_settings',
    ROUNDUP_SETTINGS: 'roundup_settings'
}

// Default settings
const DEFAULT_SETTINGS = {
    // Notification settings
    notifications: {
        pushEnabled: true,
        emailEnabled: true,
        smsEnabled: false,
        transactionAlerts: true,
        securityAlerts: true,
        promotionalAlerts: false,
        soundEnabled: true,
        vibrationEnabled: true,
        quietHours: {
            enabled: false,
            startTime: '22:00',
            endTime: '08:00'
        }
    },

    // Security settings
    security: {
        biometricsEnabled: false,
        pinEnabled: true,
        autoLockTimeout: 5, // minutes
        requirePinForTransactions: true,
        requirePinForSettings: false,
        sessionTimeout: 30, // minutes
        twoFactorEnabled: false,
        loginNotifications: true,
        suspiciousActivityAlerts: true
    },

    // Privacy settings
    privacy: {
        profileVisibility: 'public', // public, friends, private
        showBalance: true,
        showTransactionHistory: true,
        allowFriendRequests: true,
        shareAnalytics: true,
        shareCrashReports: true,
        dataRetention: '30days' // 30days, 90days, 1year, forever
    },

    // Appearance settings
    appearance: {
        theme: 'dark', // light, dark, auto
        fontSize: 'medium', // small, medium, large, extraLarge
        reduceMotion: false,
        highContrast: false,
        boldText: false,
        firstTime: true,
        bottomBarLabels: false
    },

    // Language and localization
    language: {
        currentLanguage: 'es',
        region: 'ES',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '12h', // 12h, 24h
        currency: 'QUSD',
        numberFormat: 'es-ES'
    },

    // Transaction settings
    transactions: {
        defaultCurrency: 'QUSD',
        showFees: true,
        confirmLargeTransactions: true,
        largeTransactionThreshold: 100,
        autoSaveReceipts: true,
        transactionHistoryLimit: 100
    },

    // P2P settings
    p2p: {
        enabled: true,
        autoAccept: false,
        requireVerification: true,
        maxTransactionLimit: 1000,
        showOnlineStatus: true,
        allowAnonymous: false
    },

    // Investment settings
    investment: {
        riskTolerance: 'moderate', // conservative, moderate, aggressive
        autoInvest: false,
        investmentAlerts: true,
        portfolioVisibility: 'private'
    },

    // Store settings
    store: {
        showPrices: true,
        defaultCategory: 'all',
        sortBy: 'popularity', // popularity, price, rating, newest
        filterByRating: 0,
        showOutOfStock: false
    },

    // Roundup (micro pagos) settings
    roundup: {
        enabled: false,
        destination: null, // 'savings' or 'donations'
    },

    // Sound and haptic settings
    sounds: {
        enabled: true,
        volume: 0.7,
        transactionSound: true,
        notificationSound: true,
        errorSound: true,
        successSound: true
    },

    // Vibration settings
    vibration: {
        enabled: true,
        intensity: 'medium', // light, medium, strong
        transactionVibration: true,
        notificationVibration: true,
        errorVibration: true,
        successVibration: true
    }
}

// Settings Provider Component
export const SettingsProvider = ({ children }) => {

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

        } catch (error) {
            setError('Failed to load settings')
            // Use default settings if loading fails
            setSettings(DEFAULT_SETTINGS)
        } finally {
            setIsLoading(false)
        }
    }

    // Load all settings from storage
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

        } catch (error) { return {} }
    }

    // Merge stored settings with defaults
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

    // Update a specific setting category
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

        } catch (error) {
            setError('Failed to update settings')
            return { success: false, error: error.message }
        }
    }

    // Update a specific setting within a category
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

        } catch (error) {
            setError('Failed to update setting')
            return { success: false, error: error.message }
        }
    }

    // Reset settings to defaults
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

        } catch (error) {
            setError('Failed to reset settings')
            return { success: false, error: error.message }
        }
    }

    // Export settings
    const exportSettings = async () => {

        try {

            const settingsData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                settings: settings
            }

            return { success: true, data: settingsData }
        } catch (error) {
            setError('Failed to export settings')
            return { success: false, error: error.message }
        }
    }

    // Import settings
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

        } catch (error) {
            setError('Failed to import settings')
            return { success: false, error: error.message }
        }
    }

    // Clear error
    const clearError = () => { setError(null) }

    // Get setting value with fallback
    const getSetting = (category, key, defaultValue = null) => {
        try {
            return settings[category]?.[key] ?? defaultValue
        } catch (error) {
            // error getting setting
            return defaultValue
        }
    }

    // Check if a setting is enabled
    const isSettingEnabled = (category, key) => { return getSetting(category, key, false) }

    // Context value
    const value = {

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

// Export constants for external use
export { STORAGE_KEYS, DEFAULT_SETTINGS }
