/**
 * AsyncStorage keys — one per settings category, so each category is read,
 * written and reset independently (granular persistence). `SETTINGS` is the
 * generic fallback key used when a category has no dedicated constant.
 * These hold non-secret preferences only; secrets live in the Keychain.
 */
export const STORAGE_KEYS = {
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

/**
 * Default value for every settings category. Stored settings are merged OVER
 * this object on load, so adding a new key here is enough to roll it out to
 * existing installs. Notable defaults: dark theme, auto language (follows the
 * device), QUSD currency, `appearance.firstTime: true` (gates onboarding).
 */
export const DEFAULT_SETTINGS = {
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
		autoLockTimeout: 5, // minutes
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
		theme: 'dark' as 'light' | 'dark' | 'auto',
		fontSize: 'medium', // small, medium, large, extraLarge
		accentColor: 'default', // id from ACCENT_COLORS (theme/ThemeContext.js) — applied only for GOLD users
		appIcon: 'default', // id from APP_ICONS (helpers/appIcon.js) — applied only for GOLD users
		reduceMotion: false,
		highContrast: false,
		boldText: false,
		firstTime: true,
		bottomBarLabels: false
	},

	// Language and localization — currentLanguage: 'auto' | 'es' | 'en' | 'pt'
	// ('auto' sigue el idioma del dispositivo; settings/LanguageSync.jsx lo
	// aplica al singleton de i18next en runtime)
	language: {
		currentLanguage: 'auto' as 'auto' | 'es' | 'en' | 'pt',
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
		destination: null as 'savings' | 'donations' | null,
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

/** Forma completa de los ajustes (derivada del catálogo de defaults). */
export type Settings = typeof DEFAULT_SETTINGS

/** Nombre de categoría de ajustes ('notifications' | 'security' | ...). */
export type SettingsCategory = keyof Settings
