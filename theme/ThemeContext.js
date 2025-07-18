import { Appearance } from 'react-native'
import React, { createContext, useContext, useEffect, useState } from 'react'

// Define your color palette
const colors = {
    
    // Primary colors
    primary: "#6759EF",
    success: "#7BFFB1",
    warning: "#ff9f43",
    danger: "#DB253E",

    // Light theme colors
    light: {
        background: "#FFFFFF",
        secondaryBackground: "#F8F9FA",
        surface: "#FFFFFF",
        primaryText: "#1A1A1A",
        secondaryText: "#6C757D",
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
        secondaryText: "#9DA3B4",
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
    },
})

// Create context
const ThemeContext = createContext()

// Theme provider component
export const ThemeProvider = ({ children }) => {

    const [isDark, setIsDark] = useState(Appearance.getColorScheme() === 'dark')
    const [theme, setTheme] = useState(createTheme(isDark))

    useEffect(() => {
        const subscription = Appearance.addChangeListener(({ colorScheme }) => {
            const newIsDark = colorScheme === 'dark'
            setIsDark(newIsDark)
            setTheme(createTheme(newIsDark))
        })

        return () => subscription?.remove()
    }, [])

    const toggleTheme = () => {
        const newIsDark = !isDark
        setIsDark(newIsDark)
        setTheme(createTheme(newIsDark))
    }

    const setThemeMode = (mode) => {
        const newIsDark = mode === 'dark'
        setIsDark(newIsDark)
        setTheme(createTheme(newIsDark))
    }

    return (
        <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setThemeMode }}>
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