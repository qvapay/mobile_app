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
    caption: {
        fontSize: theme.typography.fontSize.sm,
        fontFamily: theme.typography.fontFamily.light,
        color: theme.colors.secondaryText,
    },
})

// Common container styles
export const createContainerStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingHorizontal: theme.spacing.md,
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        marginVertical: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
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