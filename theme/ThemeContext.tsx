import { useColorScheme } from 'react-native'
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
 * - Mode, font size and accent are READ from `settings.appearance` every
 *   render (no copy into state) and written back through
 *   `updateSettings('appearance', ...)` (App.tsx wires this up as
 *   `ThemeProviderWithSettings`). Without settings they live in local state.
 *   Persistence itself lives in SettingsContext (AsyncStorage).
 * - The theme object is derived with `useMemo`; 'auto' follows the system
 *   scheme through `useColorScheme()`.
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

	// Fuente de verdad: los ajustes cuando los hay; sin ellos (proveedor aislado), estado local.
	// Nada se COPIA de los ajustes a un estado: antes unos efectos lo sincronizaban y al
	// arrancar (ajustes leídos del disco después del primer render) la app entera se
	// redibujaba dos veces de más, con el tema por defecto en pantalla mientras tanto
	const [localMode, setLocalMode] = useState<ThemeMode>('dark')
	const [localFontSize, setLocalFontSize] = useState('medium')
	const [localAccent, setLocalAccent] = useState('default')
	const themeMode: ThemeMode = settings ? settings.appearance?.theme || 'dark' : localMode
	const fontSizeKey = settings ? settings.appearance?.fontSize || 'medium' : localFontSize
	const accentKey = settings ? settings.appearance?.accentColor || 'default' : localAccent

	// Esquema del sistema, reactivo (sustituye al listener manual de Appearance); solo cuenta en 'auto'
	const systemScheme = useColorScheme()
	const isDark = themeMode === 'dark' || (themeMode === 'auto' && systemScheme === 'dark')
	const effectiveAccent = accentAllowed ? accentKey : 'default'
	const theme = useMemo(() => createTheme(isDark, getFontScale(fontSizeKey), effectiveAccent), [isDark, fontSizeKey, effectiveAccent])

	// Memoized styles at context level
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	// Keep a ref to updateSettings so the memoized context value never uses a stale closure
	// (la escritura va en un efecto: el cuerpo del render debe ser puro y sus
	// únicos lectores son handlers de evento, siempre posteriores al commit)
	const updateSettingsRef = useRef(updateSettings)
	useEffect(() => { updateSettingsRef.current = updateSettings })

	// Con ajustes, `updateSettings` actualiza su estado en el acto (antes de persistir), así
	// que el tema cambia en el mismo render; sin ellos, se cambia el estado local
	const changeThemeMode = async (mode: ThemeMode) => {
		if (updateSettingsRef.current) { await updateSettingsRef.current('appearance', { theme: mode }) }
		else { setLocalMode(mode) }
	}

	const toggleTheme = () => {
		const newMode = isDark ? 'light' : 'dark'
		changeThemeMode(newMode)
	}

	const changeFontSize = async (size: string) => {
		if (updateSettingsRef.current) { await updateSettingsRef.current('appearance', { fontSize: size }) }
		else { setLocalFontSize(size) }
	}

	const changeAccentColor = async (accentId: string) => {
		if (updateSettingsRef.current) { await updateSettingsRef.current('appearance', { accentColor: accentId }) }
		else { setLocalAccent(accentId) }
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
