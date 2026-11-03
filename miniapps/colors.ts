/**
 * Colores que una mini-app puede poner en el host (`ui.colors.set`): validación
 * del hex y elección de la tinta por contraste. PURO (cero react-native): se
 * testea con `@jest-environment node` y lo espeja `parseColors` del simulador
 * de qpweb (components/dev/miniapp/Simulator.js).
 */

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** La tinta de texto e iconos sobre un color: `light` = blanca (fondo oscuro), `dark` = oscura. */
export type Ink = 'light' | 'dark'

/** Tinta real de cada caso; la oscura es el fondo dark del tema, no negro puro. */
export const INK_COLORS: Record<Ink, string> = { light: '#FFFFFF', dark: '#0E0E1C' }

/**
 * Normaliza un color de la mini-app a `#rrggbb` minúsculas. Acepta `#RGB` y
 * `#RRGGBB` en cualquier caja; rechaza alfa, `rgb()`, nombres y todo lo demás
 * (una barra semitransparente dejaría ver lo que hay debajo, y `transparent`
 * la haría ilegible).
 */
export function parseHexColor(raw: unknown): string | null {
	if (typeof raw !== 'string' || !HEX_RE.test(raw)) return null
	const hex = raw.slice(1).toLowerCase()
	if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
	return `#${hex}`
}

const channel = (hex: string, at: number) => {
	const c = parseInt(hex.slice(at, at + 2), 16) / 255
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Luminancia relativa (WCAG 2.x) de un `#rrggbb` ya normalizado, 0 (negro) a 1 (blanco). */
export function relativeLuminance(hex: string): number {
	return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
}

/**
 * Por debajo de esta luminancia el fondo es "oscuro" y la tinta va en blanco. El ratio
 * de contraste WCAG puro (blanco contra negro) elige negro para demasiados colores de
 * marca de brillo medio (el azul de iOS #0A84FF, por ejemplo), así que se decide por
 * umbral, como hacen los clientes de Telegram y Material.
 */
export const DARK_BACKGROUND_MAX_LUMINANCE = 0.4

/**
 * Tinta que mejor contrasta sobre un color. La decide la app, no la mini-app:
 * así nadie puede dejar la barra ilegible.
 *
 * @param hex - Color normalizado por `parseHexColor`.
 */
export function inkFor(hex: string): Ink {
	return relativeLuminance(hex) > DARK_BACKGROUND_MAX_LUMINANCE ? 'dark' : 'light'
}
