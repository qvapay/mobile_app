import { useMemo } from 'react'
import { StyleSheet } from 'react-native'

/**
 * Converts a `#RRGGBB` hex color into an `rgba()` string. Needed for accent
 * tints (backgrounds/borders at low opacity) now that `theme.colors.primary`
 * is user-selectable and can no longer be hardcoded as rgba literals.
 *
 * @param {string} hex - Color in `#RRGGBB` format.
 * @param {number} [alpha=1] - Opacity between 0 and 1.
 * @returns {string} The `rgba(r, g, b, a)` string.
 */
export const hexToRgba = (hex, alpha = 1) => {
	const h = hex.replace('#', '')
	const r = parseInt(h.slice(0, 2), 16)
	const g = parseInt(h.slice(2, 4), 16)
	const b = parseInt(h.slice(4, 6), 16)
	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Builds the shared text StyleSheet for a theme: `text`, `title`, `subtitle`,
 * `amount` (hero numbers), `h1`–`h7`, `body`, `caption`, `error`. Font sizes
 * already carry the user's font scale (baked into `theme.typography`).
 * Prefer the memoized `useTextStyles` inside components.
 *
 * @param {Object} theme - Theme object from `createTheme`.
 * @returns {Object} StyleSheet of text styles.
 */
export const createTextStyles = (theme) => StyleSheet.create({
	text: {
		color: theme.colors.primaryText,
		fontFamily: theme.typography.fontFamily.regular,
		fontSize: theme.typography.fontSize.md,
	},
	title: {
		fontSize: theme.typography.fontSize.xl,
		fontFamily: theme.typography.fontFamily.semiBold,
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
		fontFamily: theme.typography.fontFamily.semiBold,
		color: theme.colors.primaryText,
	},
	h2: {
		fontSize: theme.typography.fontSize.xxl,
		fontFamily: theme.typography.fontFamily.medium,
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
	body: {
		fontSize: theme.typography.fontSize.sm,
		fontFamily: theme.typography.fontFamily.regular,
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

/**
 * Builds the shared layout StyleSheet for a theme: screen containers, `card`
 * (border + shadow only in LIGHT mode — dark surfaces must stay borderless),
 * `box`, `row`, `center` and header slots. Prefer the memoized
 * `useContainerStyles` inside components.
 *
 * @param {Object} theme - Theme object from `createTheme`.
 * @returns {Object} StyleSheet of container styles.
 */
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
		flexGrow: 1
	},
	bottomButtonContainer: {
		paddingTop: 16,
		paddingBottom: 24,
		gap: 12,
	},
	card: {
		backgroundColor: theme.colors.surface,
		borderRadius: theme.borderRadius.md,
		padding: theme.spacing.md,
		marginVertical: theme.spacing.sm,
		...(!theme.isDark ? {
			borderWidth: 1,
			borderColor: theme.colors.border,
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 1 },
			shadowOpacity: 0.06,
			shadowRadius: 3,
			elevation: 1,
		} : {}),
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
		gap: 10,
	},
	headerLeft: {
		marginLeft: 20,
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingBottom: 10,
	},
	headerRight: {
		marginRight: 20,
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingBottom: 10,
	}
})

/**
 * Memoized hook versions (must be called from React components) — the
 * StyleSheets are rebuilt only when the `theme` object identity changes.
 * ThemeProvider calls these once and exposes them as `styles.text` /
 * `styles.container`, so screens rarely need to call them directly.
 *
 * @param {Object} theme - Theme object from `createTheme`.
 * @returns {Object} Memoized StyleSheet.
 */
export const useTextStyles = (theme) => { return useMemo(() => createTextStyles(theme), [theme]) }
export const useContainerStyles = (theme) => { return useMemo(() => createContainerStyles(theme), [theme]) }