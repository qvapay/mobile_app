import { Appearance } from 'react-native'
import { useTextStyles, useContainerStyles } from './themeUtils'
import { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react'

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

// Create theme objects
const createTheme = (isDark, fontScale = 1.0) => ({
    isDark,
    colors: {
        primary: colors.primary,
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

// Theme provider component
export const ThemeProvider = ({ children, settings = null, updateSettings = null }) => {

    // Get theme mode from settings or default to dark
    const initialThemeMode = settings?.appearance?.theme || 'dark'
    const initialFontSize = settings?.appearance?.fontSize || 'medium'
    const [themeMode, setThemeMode] = useState(initialThemeMode)
    const [fontSizeKey, setFontSizeKey] = useState(initialFontSize)
    const [isDark, setIsDark] = useState(initialThemeMode === 'dark' || (initialThemeMode === 'auto' && Appearance.getColorScheme() === 'dark'))
    const [theme, setTheme] = useState(createTheme(isDark, fontScaleMap[initialFontSize] || 1.0))

    // Memoized styles at context level
    const textStyles = useTextStyles(theme)
    const containerStyles = useContainerStyles(theme)

    // Get current font scale from key
    const getFontScale = (key) => fontScaleMap[key] || 1.0

    // Update theme based on mode and system appearance
    const updateTheme = (mode, fKey = fontSizeKey) => {

        let shouldBeDark = false
        if (mode === 'auto') {
            shouldBeDark = Appearance.getColorScheme() === 'dark'
        } else if (mode === 'dark') {
            shouldBeDark = true
        } else if (mode === 'light') {
            shouldBeDark = false
        }

        setIsDark(shouldBeDark)
        setTheme(createTheme(shouldBeDark, getFontScale(fKey)))
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

    useEffect(() => {

        // Initial theme setup
        updateTheme(themeMode)

        // Listen for system appearance changes (only when in auto mode)
        const subscription = Appearance.addChangeListener(({ colorScheme }) => {
            if (themeMode === 'auto') {
                const newIsDark = colorScheme === 'dark'
                setIsDark(newIsDark)
                setTheme(createTheme(newIsDark, getFontScale(fontSizeKey)))
            }
        })

        return () => subscription?.remove()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [themeMode])

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

    // Memoized context value to prevent unnecessary re-renders
    const contextValue = useMemo(() => ({
        theme,
        isDark,
        themeMode,
        fontSizeKey,
        toggleTheme,
        setThemeMode: changeThemeMode,
        setFontSize: changeFontSize,
        styles: {
            text: textStyles,
            container: containerStyles
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [theme, isDark, themeMode, fontSizeKey, textStyles, containerStyles])

    return (
        <ThemeContext.Provider value={contextValue}>
            {children}
        </ThemeContext.Provider>
    )
}

// Custom hook to use theme
export const useTheme = () => {
    const context = useContext(ThemeContext)
    if (!context) { throw new Error('useTheme must be used within a ThemeProvider') }
    return context
}

// Export theme creation function for testing
export { createTheme, fontScaleMap }