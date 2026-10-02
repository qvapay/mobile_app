import { Appearance } from 'react-native'
import { useTextStyles, useContainerStyles } from './themeUtils'
import { createContext, use, useEffect, useState, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { createTheme, fontScaleMap } from './themeTokens'
import type { Theme, ThemeMode } from './themeTokens'

export type { Theme, ThemeMode } from './themeTokens'

export type ThemeContextValue = {
	theme: Theme
	isDark: boolean
	themeMode: ThemeMode
	fontSizeKey: string
	accentKey: string
	toggleTheme: () => void
	setThemeMode: (mode: ThemeMode) => Promise<void>
	setFontSize: (size: string) => Promise<void>
	setAccentColor: (accentId: string) => Promise<void>
	styles: {
		text: ReturnType<typeof useTextStyles>
		container: ReturnType<typeof useContainerStyles>
	}
}

/** Subset de SettingsContext que este provider consume (App.tsx lo cablea). */
type ThemeSettings = { appearance?: { theme?: ThemeMode, fontSize?: string, accentColor?: string } } | null

type UpdateSettingsFn = ((category: string, values: Record<string, unknown>) => Promise<unknown> | void) | null

type ThemeProviderProps = {
	children: ReactNode
	settings?: ThemeSettings
	updateSettings?: UpdateSettingsFn
	accentAllowed?: boolean
}

// Create context
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// Get current font scale from key
const getFontScale = (key: string) => (fontScaleMap as Record<string, number>)[key] || 1.0

/**
 * Provides the app theme (light / dark / auto) and memoized shared styles.
 *
 * - Mode + font size come from `settings.appearance` and are written back
 *   through `updateSettings('appearance', ...)` when changed here (App.tsx
 *   wires this up as `ThemeProviderWithSettings`). Persistence itself lives
 *   in SettingsContext (AsyncStorage) — this provider holds no storage.
 * - Subscribes to the system `Appearance` listener, but only reacts to it
 *   while in 'auto' mode.
 * - The context value is memoized and includes `styles.text` /
 *   `styles.container` (StyleSheets rebuilt only when the theme object changes).
 *
 * @param props.settings - Settings object from SettingsContext.
 * @param props.updateSettings - Setter used to persist appearance changes.
 * @param props.accentAllowed - Whether the custom accent may be applied
 *   (GOLD entitlement). When false the theme silently falls back to the brand accent
 *   without touching the persisted setting, so the choice survives a GOLD renewal.
 */
export const ThemeProvider = ({ children, settings = null, updateSettings = null, accentAllowed = true }: ThemeProviderProps) => {

	// Get theme mode from settings or default to dark
	const initialThemeMode = settings?.appearance?.theme || 'dark'
	const initialFontSize = settings?.appearance?.fontSize || 'medium'
	const initialAccent = settings?.appearance?.accentColor || 'default'
	const [themeMode, setThemeMode] = useState<ThemeMode>(initialThemeMode)
	const [fontSizeKey, setFontSizeKey] = useState(initialFontSize)
	const [accentKey, setAccentKey] = useState(initialAccent)
	const [isDark, setIsDark] = useState(initialThemeMode === 'dark' || (initialThemeMode === 'auto' && Appearance.getColorScheme() === 'dark'))
	const [theme, setTheme] = useState(createTheme(isDark, getFontScale(initialFontSize), accentAllowed ? initialAccent : 'default'))

	// Memoized styles at context level
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	// Update theme based on mode and system appearance
	const updateTheme = (mode: ThemeMode, fKey: string = fontSizeKey, accent: string = accentKey) => {

		let shouldBeDark = false
		if (mode === 'auto') {
			shouldBeDark = Appearance.getColorScheme() === 'dark'
		} else if (mode === 'dark') {
			shouldBeDark = true
		} else if (mode === 'light') {
			shouldBeDark = false
		}

		setIsDark(shouldBeDark)
		setTheme(createTheme(shouldBeDark, getFontScale(fKey), accentAllowed ? accent : 'default'))
	}

	// Sync with settings when they change
	useEffect(() => {
		if (settings?.appearance?.theme && settings.appearance.theme !== themeMode) {
			setThemeMode(settings.appearance.theme)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [settings?.appearance?.theme])

	// Sync fontSize from settings
	useEffect(() => {
		const newFontSize = settings?.appearance?.fontSize || 'medium'
		if (newFontSize !== fontSizeKey) {
			setFontSizeKey(newFontSize)
			updateTheme(themeMode, newFontSize)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [settings?.appearance?.fontSize])

	// Sync accent from settings
	useEffect(() => {
		const newAccent = settings?.appearance?.accentColor || 'default'
		if (newAccent !== accentKey) {
			setAccentKey(newAccent)
			updateTheme(themeMode, fontSizeKey, newAccent)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [settings?.appearance?.accentColor])

	useEffect(() => {

		// Initial theme setup; also re-resolves the accent when the GOLD
		// entitlement (accentAllowed) flips, e.g. after the profile refreshes
		updateTheme(themeMode)

		// Listen for system appearance changes (only when in auto mode)
		const subscription = Appearance.addChangeListener(({ colorScheme }) => {
			if (themeMode === 'auto') {
				const newIsDark = colorScheme === 'dark'
				setIsDark(newIsDark)
				setTheme(createTheme(newIsDark, getFontScale(fontSizeKey), accentAllowed ? accentKey : 'default'))
			}
		})

		return () => subscription?.remove()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [themeMode, fontSizeKey, accentKey, accentAllowed])

	// Keep a ref to updateSettings so the memoized context value never uses a stale closure
	// (la escritura va en un efecto: el cuerpo del render debe ser puro y sus
	// únicos lectores son handlers de evento, siempre posteriores al commit)
	const updateSettingsRef = useRef(updateSettings)
	useEffect(() => { updateSettingsRef.current = updateSettings })

	const changeThemeMode = async (mode: ThemeMode) => {

		setThemeMode(mode)
		updateTheme(mode)

		// Update settings if updateSettings function is provided
		if (updateSettingsRef.current) {
			await updateSettingsRef.current('appearance', { theme: mode })
		}
	}

	const toggleTheme = () => {
		const newMode = isDark ? 'light' : 'dark'
		changeThemeMode(newMode)
	}

	const changeFontSize = async (size: string) => {
		setFontSizeKey(size)
		updateTheme(themeMode, size)
		if (updateSettingsRef.current) {
			await updateSettingsRef.current('appearance', { fontSize: size })
		}
	}

	const changeAccentColor = async (accentId: string) => {
		setAccentKey(accentId)
		updateTheme(themeMode, fontSizeKey, accentId)
		if (updateSettingsRef.current) {
			await updateSettingsRef.current('appearance', { accentColor: accentId })
		}
	}

	// Memoized context value to prevent unnecessary re-renders
	const contextValue = useMemo(() => ({
		theme,
		isDark,
		themeMode,
		fontSizeKey,
		accentKey,
		toggleTheme,
		setThemeMode: changeThemeMode,
		setFontSize: changeFontSize,
		setAccentColor: changeAccentColor,
		styles: {
			text: textStyles,
			container: containerStyles
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}), [theme, isDark, themeMode, fontSizeKey, accentKey, textStyles, containerStyles])

	return (
		<ThemeContext.Provider value={contextValue}>
			{children}
		</ThemeContext.Provider>
	)
}

/**
 * Consumes the theme context. Throws if used outside a `ThemeProvider`.
 *
 * @returns El valor del contexto (`ThemeContextValue`).
 */
export const useTheme = (): ThemeContextValue => {
	const context = use(ThemeContext)
	if (!context) { throw new Error('useTheme must be used within a ThemeProvider') }
	return context
}
