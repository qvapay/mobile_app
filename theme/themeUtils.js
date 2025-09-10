import { useMemo } from 'react'
import { StyleSheet } from 'react-native'

// Common text styles that adapt to theme
export const createTextStyles = (theme) => StyleSheet.create({
    text: {
        color: theme.colors.primaryText,
        fontFamily: theme.typography.fontFamily.regular,
        fontSize: theme.typography.fontSize.md,
    },
    title: {
        fontSize: theme.typography.fontSize.xl,
        fontFamily: theme.typography.fontFamily.bold,
        color: theme.colors.primaryText,
    },
    subtitle: {
        fontSize: theme.typography.fontSize.lg,
        fontFamily: theme.typography.fontFamily.medium,
        color: theme.colors.secondaryText,
    },
    amount: {
        fontSize: theme.typography.fontSize.display,
        fontFamily: theme.typography.fontFamily.black,
        color: theme.colors.primaryText,
        textAlign: 'center',
    },
    h1: {
        fontSize: theme.typography.fontSize.xxxl,
        fontFamily: theme.typography.fontFamily.bold,
        color: theme.colors.primaryText,
    },
    h2: {
        fontSize: theme.typography.fontSize.xxl,
        fontFamily: theme.typography.fontFamily.semiBold,
        color: theme.colors.primaryText,
    },
    h3: {
        fontSize: theme.typography.fontSize.xl,
        fontFamily: theme.typography.fontFamily.medium,
        color: theme.colors.primaryText,
    },
    h4: {
        fontSize: theme.typography.fontSize.lg,
        fontFamily: theme.typography.fontFamily.medium,
        color: theme.colors.primaryText,
    },
    h5: {
        fontSize: theme.typography.fontSize.md,
        fontFamily: theme.typography.fontFamily.medium,
        color: theme.colors.primaryText,
    },
    h6: {
        fontSize: theme.typography.fontSize.sm,
        fontFamily: theme.typography.fontFamily.medium,
        color: theme.colors.primaryText,
    },
    h7: {
        fontSize: theme.typography.fontSize.xs,
        fontFamily: theme.typography.fontFamily.medium,
        color: theme.colors.primaryText,
    },
    caption: {
        fontSize: theme.typography.fontSize.sm,
        fontFamily: theme.typography.fontFamily.light,
        color: theme.colors.secondaryText,
    },
    error: {
        fontSize: theme.typography.fontSize.sm,
        fontFamily: theme.typography.fontFamily.medium,
        color: theme.colors.danger,
    },
})

// Common container styles
export const createContainerStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    subContainer: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingHorizontal: theme.spacing.md,
    },
    scrollContainer: {
        flexGrow: 1,
        paddingVertical: 10
    },
    bottomButtonContainer: {
        marginBottom: 20
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        marginVertical: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    box: {
        flexDirection: 'row',
        alignContent: 'center',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.elevation,
        gap: 10
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
})

// Memoized versions of style creation functions
export const createMemoizedTextStyles = (theme) => {
    return useMemo(() => createTextStyles(theme), [theme])
}

export const createMemoizedContainerStyles = (theme) => {
    return useMemo(() => createContainerStyles(theme), [theme])
}

// Custom hooks for easier usage with automatic memoization
export const useTextStyles = (theme) => {
    return useMemo(() => createTextStyles(theme), [theme])
}

export const useContainerStyles = (theme) => {
    return useMemo(() => createContainerStyles(theme), [theme])
}

// Combined hook for both text and container styles
export const useThemeStyles = (theme) => {
    return useMemo(() => ({
        text: createTextStyles(theme),
        container: createContainerStyles(theme)
    }), [theme])
}