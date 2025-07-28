import { Appearance } from 'react-native'
import { useTextStyles, useContainerStyles } from './themeUtils'
import { createContext, useContext, useEffect, useState, useMemo } from 'react'

// Define your color palette
const colors = {
    
    // Primary colors
    primary: "#6759EF",
    success: "#7BFFB1",
    warning: "#ff9f43",
    danger: "#DB253E",
    secondary: "#3D4A63",
    tertiary: "#5C6BC0",

    // Light theme colors
    light: {
        background: "#FFFFFF",
        secondaryBackground: "#F8F9FA",
        surface: "#FFFFFF",
        primaryText: "#1A1A1A",
        buttonText: "#FFFFFF",
        secondaryText: "#6C757D",
        tertiaryText: "#6C757D",
        border: "#E9ECEF",
        placeholder: "#ADB5BD",
        elevation: "#F8F9FA",
        elevationLight: "#E9ECEF",
        almostBlack: "#0E0E1C",
        almostWhite: "#F7F7F7",
    },

    // Dark theme colors
    dark: {
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

// Create theme objects
const createTheme = (isDark) => ({
    isDark,
    colors: {
        primary: colors.primary,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        secondary: colors.secondary,
        tertiary: colors.tertiary,
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
            xs: 12,
            sm: 14,
            md: 16,
            lg: 18,
            xl: 20,
            xxl: 24,
            xxxl: 30,
            display: 60,
        },
    }
})

// Create context
const ThemeContext = createContext()

// Theme provider component
export const ThemeProvider = ({ children }) => {

    const [themeMode, setThemeMode] = useState('auto') // 'auto', 'light', 'dark'
    const [isDark, setIsDark] = useState(Appearance.getColorScheme() === 'dark')
    const [theme, setTheme] = useState(createTheme(isDark))

    // Memoized styles at context level
    const textStyles = useTextStyles(theme)
    const containerStyles = useContainerStyles(theme)

    // Update theme based on mode and system appearance
    const updateTheme = (mode) => {
        let shouldBeDark = false
        
        if (mode === 'auto') {
            shouldBeDark = Appearance.getColorScheme() === 'dark'
        } else if (mode === 'dark') {
            shouldBeDark = true
        } else if (mode === 'light') {
            shouldBeDark = false
        }
        
        setIsDark(shouldBeDark)
        setTheme(createTheme(shouldBeDark))
    }

    useEffect(() => {
        // Initial theme setup
        updateTheme(themeMode)
        
        // Listen for system appearance changes (only when in auto mode)
        const subscription = Appearance.addChangeListener(({ colorScheme }) => {
            if (themeMode === 'auto') {
                const newIsDark = colorScheme === 'dark'
                setIsDark(newIsDark)
                setTheme(createTheme(newIsDark))
            }
        })

        return () => subscription?.remove()
    }, [themeMode])

    const changeThemeMode = (mode) => {
        setThemeMode(mode)
        updateTheme(mode)
    }

    const toggleTheme = () => {
        const newMode = isDark ? 'light' : 'dark'
        changeThemeMode(newMode)
    }

    // Memoized context value to prevent unnecessary re-renders
    const contextValue = useMemo(() => ({
        theme,
        isDark,
        themeMode,
        toggleTheme,
        setThemeMode: changeThemeMode,
        styles: {
            text: textStyles,
            container: containerStyles
        }
    }), [theme, isDark, themeMode, textStyles, containerStyles])

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
export { createTheme }