/**
 * Unit tests for the theme factory and shared StyleSheets — node environment
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import { createTheme, fontScaleMap } from './ThemeContext'
import { createTextStyles, createContainerStyles } from './themeUtils'

describe('createTheme', () => {
	test('dark theme uses the dark palette over the brand colors', () => {
		const theme = createTheme(true)
		expect(theme.isDark).toBe(true)
		expect(theme.colors.primary).toBe('#6759EF')
		expect(theme.colors.success).toBe('#7BFFB1')
		expect(theme.colors.danger).toBe('#DB253E')
		expect(theme.colors.gold).toBe('#FFD700')
		expect(theme.colors.background).toBe('#0E0E1C')
		expect(theme.colors.surface).toBe('#1E2039')
	})

	test('light theme swaps the palette but keeps brand colors', () => {
		const theme = createTheme(false)
		expect(theme.isDark).toBe(false)
		expect(theme.colors.primary).toBe('#6759EF')
		expect(theme.colors.background).toBe('#FFFFFF')
		expect(theme.colors.surface).toBe('#F0F1F7')
	})

	test('font sizes are pre-multiplied by the font scale and rounded', () => {
		const base = createTheme(true, 1.0)
		expect(base.typography.fontSize.md).toBe(16)
		expect(base.typography.fontSize.display).toBe(60)
		const large = createTheme(true, fontScaleMap.large)
		expect(large.typography.fontSize.md).toBe(Math.round(16 * 1.15))
		expect(large.typography.fontSize.xs).toBe(Math.round(12 * 1.15))
	})

	test('fontScaleMap exposes the five user-facing sizes', () => {
		expect(fontScaleMap).toEqual({
			extraSmall: 0.8,
			small: 0.9,
			medium: 1.0,
			large: 1.15,
			extraLarge: 1.3,
		})
	})

	test('typography uses the Rubik family', () => {
		const { fontFamily } = createTheme(true).typography
		expect(fontFamily.regular).toBe('Rubik-Regular')
		expect(fontFamily.semiBold).toBe('Rubik-SemiBold')
		expect(fontFamily.black).toBe('Rubik-Black')
	})
})

describe('createTextStyles', () => {
	test('builds the shared text styles from the theme', () => {
		const theme = createTheme(true)
		const styles = createTextStyles(theme)
		expect(styles.text).toMatchObject({
			color: theme.colors.primaryText,
			fontFamily: 'Rubik-Regular',
			fontSize: theme.typography.fontSize.md,
		})
		expect(styles.title.fontFamily).toBe('Rubik-SemiBold')
		expect(styles.amount.fontFamily).toBe('Rubik-Black')
		expect(styles.error.color).toBe(theme.colors.danger)
		expect(styles.caption.color).toBe(theme.colors.secondaryText)
	})

	test('exposes the full heading scale h1–h7', () => {
		const styles = createTextStyles(createTheme(true))
		for (const h of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7']) { expect(styles[h]).toBeDefined() }
		expect(styles.h1.fontSize).toBeGreaterThan(styles.h7.fontSize)
	})
})

describe('createContainerStyles', () => {
	test('cards are borderless in dark mode (project UI rule)', () => {
		const styles = createContainerStyles(createTheme(true))
		expect(styles.card.borderWidth).toBeUndefined()
		expect(styles.card.shadowOpacity).toBeUndefined()
		expect(styles.card.backgroundColor).toBe('#1E2039')
	})

	test('cards get border + soft shadow in light mode only', () => {
		const theme = createTheme(false)
		const styles = createContainerStyles(theme)
		expect(styles.card.borderWidth).toBe(1)
		expect(styles.card.borderColor).toBe(theme.colors.border)
		expect(styles.card.shadowOpacity).toBeCloseTo(0.06)
	})

	test('containers use the theme background', () => {
		const theme = createTheme(true)
		const styles = createContainerStyles(theme)
		expect(styles.container).toMatchObject({ flex: 1, backgroundColor: theme.colors.background })
		expect(styles.subContainer.paddingHorizontal).toBe(theme.spacing.md)
	})
})
