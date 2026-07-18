import { Appearance } from 'react-native'
import { useTextStyles, useContainerStyles } from './themeUtils'
import { createContext, use, useEffect, useState, useMemo, useRef } from 'react'

// Curated accent palette (GOLD-only customization). Every color must hold
// white button text and read as a tint on both #0E0E1C and #FFFFFF, and must
// not collide with the semantic success/danger colors.
export const ACCENT_COLORS = [
    { id: 'default', name: 'QvaPay', color: '#6759EF' },
    { id: 'violet', name: 'Violeta', color: '#9B51E0' },
    { id: 'ocean', name: 'Océano', color: '#2F80ED' },
    { id: 'turquoise', name: 'Turquesa', color: '#06B6D4' },
    { id: 'emerald', name: 'Esmeralda', color: '#10B981' },
    { id: 'gold', name: 'Dorado', color: '#E6A817' },
    { id: 'orange', name: 'Naranja', color: '#EA580C' },
    { id: 'pink', name: 'Rosa', color: '#E84393' },
    { id: 'graphite', name: 'Grafito', color: '#64748B' },
]

// Resolve an accent id to its hex color (unknown ids fall back to the brand color)
const resolveAccentColor = (accentId) => ACCENT_COLORS.find(a => a.id === accentId)?.color || "#6759EF"

// Define your color palette
const colors = {

    // Primary colors
    primary: "#6759EF",
    success: "#7BFFB1",
    warning: "#ff9f43",
    danger: "#DB253E",
    secondary: "#3D4A63",
    tertiary: "#5C6BC0",
    gold: "#FFD700",

    // Light theme colors
    light: {
        contrast: "black",
        successText: "#00471E",
        background: "#FFFFFF",
        secondaryBackground: "#F5F5FB",
        surface: "#F0F1F7",
        primaryText: "#1A1A1A",
        buttonText: "#FFFFFF",
        secondaryText: "#6C757D",
        tertiaryText: "#6C757D",
        border: "#D5D8E3",
        placeholder: "#ADB5BD",
        elevation: "#E8E9F2",
        elevationLight: "#D8DAE5",
        almostBlack: "#0E0E1C",
        almostWhite: "#F7F7F7",
    },

    // Dark theme colors
    dark: {
        contrast: "white",
        successText: "#7BFFB1",
        background: "#0E0E1C",
        secondaryBackground: "#21415F",
        surface: "#1E2039",
        primaryText: "#F7F7F7",
        buttonText: "#FFFFFF",
        secondaryText: "#9DA3B4",
        tertiaryText: "#6C757D",
        border: "#4B4B4B",
        placeholder: "#B4B7BD",
        elevation: "#1E2039",
        elevationLight: "#9DA3B4",
        almostBlack: "#0E0E1C",
        almostWhite: "#F7F7F7",
    }
}

// Font scale multipliers
const fontScaleMap = {
    extraSmall: 0.8,
    small: 0.9,
    medium: 1.0,
    large: 1.15,
    extraLarge: 1.3,
}

/**
 * Builds a complete theme object for one mode: brand colors + the light/dark
 * palette, spacing, border radii and Rubik typography with every font size
 * pre-multiplied by the user's font scale. Pure — exported for tests.
 *
 * @param {boolean} isDark - Whether to use the dark palette.
 * @param {number} [fontScale=1.0] - Multiplier from `fontScaleMap`.
 * @param {string} [accentId='default'] - Accent id from `ACCENT_COLORS` (becomes `colors.primary`).
 * @returns {{ isDark: boolean, colors: Object, spacing: Object, borderRadius: Object, typography: Object }}
 */
const createTheme = (isDark, fontScale = 1.0, accentId = 'default') => ({
    isDark,
    colors: {
        primary: resolveAccentColor(accentId),
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        secondary: colors.secondary,
        tertiary: colors.tertiary,
        gold: colors.gold,
        ...(isDark ? colors.dark : colors.light),
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 48,
    },
    borderRadius: {
        sm: 4,
        md: 8,
        lg: 12,
        xl: 16,
        round: 50,
    },
    typography: {
        fontFamily: {
            regular: 'Rubik-Regular',
            medium: 'Rubik-Medium',
            semiBold: 'Rubik-SemiBold',
            bold: 'Rubik-Bold',
            black: 'Rubik-Black',
            light: 'Rubik-Light',
        },
        fontSize: {
            xs: Math.round(12 * fontScale),
            sm: Math.round(14 * fontScale),
            md: Math.round(16 * fontScale),
            lg: Math.round(18 * fontScale),
            xl: Math.round(20 * fontScale),
            xxl: Math.round(24 * fontScale),
            xxxl: Math.round(30 * fontScale),
            display: Math.round(60 * fontScale),
        },
    }
})

// Create context
const ThemeContext = createContext()

// Get current font scale from key
const getFontScale = (key) => fontScaleMap[key] || 1.0

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
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {Object|null} [props.settings] - Settings object from SettingsContext.
 * @param {Function|null} [props.updateSettings] - Setter used to persist appearance changes.
 * @param {boolean} [props.accentAllowed=true] - Whether the custom accent may be applied
 *   (GOLD entitlement). When false the theme silently falls back to the brand accent
 *   without touching the persisted setting, so the choice survives a GOLD renewal.
 */
export const ThemeProvider = ({ children, settings = null, updateSettings = null, accentAllowed = true }) => {

    // Get theme mode from settings or default to dark
    const initialThemeMode = settings?.appearance?.theme || 'dark'
    const initialFontSize = settings?.appearance?.fontSize || 'medium'
    const initialAccent = settings?.appearance?.accentColor || 'default'
    const [themeMode, setThemeMode] = useState(initialThemeMode)
    const [fontSizeKey, setFontSizeKey] = useState(initialFontSize)
    const [accentKey, setAccentKey] = useState(initialAccent)
    const [isDark, setIsDark] = useState(initialThemeMode === 'dark' || (initialThemeMode === 'auto' && Appearance.getColorScheme() === 'dark'))
    const [theme, setTheme] = useState(createTheme(isDark, fontScaleMap[initialFontSize] || 1.0, accentAllowed ? initialAccent : 'default'))

    // Memoized styles at context level
    const textStyles = useTextStyles(theme)
    const containerStyles = useContainerStyles(theme)

    // Update theme based on mode and system appearance
    const updateTheme = (mode, fKey = fontSizeKey, accent = accentKey) => {

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
    const updateSettingsRef = useRef(updateSettings)
    updateSettingsRef.current = updateSettings

    const changeThemeMode = async (mode) => {

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

    const changeFontSize = async (size) => {
        setFontSizeKey(size)
        updateTheme(themeMode, size)
        if (updateSettingsRef.current) {
            await updateSettingsRef.current('appearance', { fontSize: size })
        }
    }

    const changeAccentColor = async (accentId) => {
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
 * @returns {{
 *   theme: Object,
 *   isDark: boolean,
 *   themeMode: 'light'|'dark'|'auto',
 *   fontSizeKey: string,
 *   accentKey: string,
 *   toggleTheme: () => void,
 *   setThemeMode: (mode: 'light'|'dark'|'auto') => Promise<void>,
 *   setFontSize: (size: string) => Promise<void>,
 *   setAccentColor: (accentId: string) => Promise<void>,
 *   styles: { text: Object, container: Object },
 * }}
 */
export const useTheme = () => {
    const context = use(ThemeContext)
    if (!context) { throw new Error('useTheme must be used within a ThemeProvider') }
    return context
}

// Export theme creation function for testing
export { createTheme, fontScaleMap }