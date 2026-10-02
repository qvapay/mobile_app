export type ThemeMode = 'light' | 'dark' | 'auto'

// Curated accent palette (GOLD-only customization). Every color must hold
// white button text and read as a tint on both #0E0E1C and #FFFFFF, and must
// not collide with the semantic success/danger colors. Data only — the
// localized display names live in i18n under `settings.themePanel.accents.<id>`
// (resolved at render time by screens/settings/subpanels/Theme.jsx).
export const ACCENT_COLORS = [
	{ id: 'default', color: '#6759EF' },
	{ id: 'violet', color: '#9B51E0' },
	{ id: 'ocean', color: '#2F80ED' },
	{ id: 'turquoise', color: '#06B6D4' },
	{ id: 'emerald', color: '#10B981' },
	{ id: 'gold', color: '#E6A817' },
	{ id: 'orange', color: '#EA580C' },
	{ id: 'pink', color: '#E84393' },
	{ id: 'graphite', color: '#64748B' },
]

// Resolve an accent id to its hex color (unknown ids fall back to the brand color)
const resolveAccentColor = (accentId: string) => ACCENT_COLORS.find(a => a.id === accentId)?.color || "#6759EF"

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
		// Verde vivo pero accesible sobre blanco (~5:1 AA); el #00471E anterior
		// era tan oscuro que los montos "+" leían casi como texto negro
		successText: "#15803D",
		// El `danger` de marca (#DB253E) es un RELLENO: como tinta sobre el fondo
		// oscuro da 3,75:1, por debajo del mínimo legible. Misma distinción que en
		// los verdes — `danger` para fondos y badges, `dangerText` para tinta.
		dangerText: "#C41E35",
		// Relleno verde de botones/pills: en light el menta (#7BFFB1) es
		// demasiado pálido sobre fondo claro, así que el sólido va oscuro con
		// tinta blanca; en dark se mantiene el menta de marca con tinta negra
		successFill: "#15803D",
		successFillText: "#FFFFFF",
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
		dangerText: "#FF6B7D",
		successFill: "#7BFFB1",
		successFillText: "#0E0E1C",
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
export const fontScaleMap = {
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
 * @param isDark - Whether to use the dark palette.
 * @param fontScale - Multiplier from `fontScaleMap`.
 * @param accentId - Accent id from `ACCENT_COLORS` (becomes `colors.primary`).
 * @returns The theme object: `{ isDark, colors, spacing, borderRadius, typography }`
 *   (type left to inference so TS sees the full literal, colors included).
 */
export const createTheme = (isDark: boolean, fontScale: number = 1.0, accentId: string = 'default') => ({
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

/** El objeto de tema completo (colores + spacing + radios + tipografía escalada). */
export type Theme = ReturnType<typeof createTheme>
