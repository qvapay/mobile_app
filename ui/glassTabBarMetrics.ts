/**
 * Medidas y material de la barra inferior «glass» emulada (iOS < 26 y Android).
 * PURO: lo comparten la barra (`GlassTabBar`), el material (`GlassSurface`) y
 * las pestañas, que reservan el hueco con `useTabBarClearance`. En iOS 26+ la
 * barra es la nativa y nada de esto se usa.
 */

/** Alto de la cápsula solo con iconos. */
export const BAR_HEIGHT = 56
/** Alto de la cápsula con etiquetas bajo los iconos. */
export const BAR_HEIGHT_LABELS = 64
/** Margen de la cápsula a los lados de la pantalla. */
export const BAR_SIDE_MARGIN = 20
/** Relleno entre el borde de la cápsula y las pestañas (y la píldora de selección). */
export const BAR_INNER_PADDING = 4
/** Separación mínima de la cápsula al borde inferior (teléfonos sin inset). */
export const BAR_MIN_BOTTOM = 12
/** Cuánto se mete la cápsula en el área segura cuando abajo solo hay un indicador de gestos. */
const GESTURE_OVERLAP = 8
/** Por encima de este inset hay botones de navegación (Android): la cápsula va entera encima. */
const BUTTON_NAV_INSET = 40
/** Aire entre los botones de navegación y la cápsula. */
const BUTTON_NAV_GAP = 8
/** Alto del fundido que hay por encima de la cápsula. */
export const BAR_FADE_ABOVE = 28

/** Ancho máximo de la cápsula: en tablet no se estira de lado a lado. */
export const BAR_MAX_WIDTH = 440

/** Ancho de la cápsula para un ancho de ventana. */
export const barWidth = (windowWidth: number): number =>
	Math.max(0, Math.min((windowWidth || 0) - BAR_SIDE_MARGIN * 2, BAR_MAX_WIDTH))

/** Alto de la cápsula según lleve o no etiquetas. */
export const barHeight = (showLabels: boolean): number => (showLabels ? BAR_HEIGHT_LABELS : BAR_HEIGHT)

/**
 * Distancia de la cápsula al borde inferior de la pantalla.
 *
 * - Sin inset (iPhone con botón, Android sin barra): el mínimo.
 * - Indicador de gestos (iPhone con Face ID, Android por gestos): la cápsula se
 *   mete un poco en el área segura, como la del sistema, sin tapar el indicador.
 * - Botones de navegación (Android): entera por encima, o los taparía.
 */
export const barBottomOffset = (insetBottom: number): number => {
	const inset = Math.max(0, insetBottom || 0)
	if (inset > BUTTON_NAV_INSET) { return inset + BUTTON_NAV_GAP }
	return Math.max(inset - GESTURE_OVERLAP, BAR_MIN_BOTTOM)
}

/**
 * Lo que la barra ocupa POR ENCIMA del área segura: lo que una pestaña suma a
 * su `insets.bottom + margen propio` para que su último elemento quede libre.
 */
export const tabBarClearance = (insetBottom: number, showLabels: boolean): number => {
	const inset = Math.max(0, insetBottom || 0)
	return Math.max(0, barBottomOffset(inset) + barHeight(showLabels) - inset)
}

/** Posición y ancho de la píldora de selección dentro del área de pestañas. */
export const pillFrame = (index: number, count: number, innerWidth: number): { x: number, width: number } => {
	if (!(count > 0) || !(innerWidth > 0)) { return { x: 0, width: 0 } }
	const width = innerWidth / count
	const clamped = Math.min(Math.max(index, 0), count - 1)
	return { x: clamped * width, width }
}

/** Capas del material: el tinte va como opacidad sobre el neutro del tema. */
export type GlassMaterial = {
	/** Opacidad del tinte (sobre `elevation` en dark, `background` en light). */
	tintAlpha: number,
	/** Borde de brillo, hairline. */
	rim: string,
	/** Arranque del degradado de brillo superior (termina en transparente). */
	highlight: string,
	/** Relleno de la píldora de selección. */
	pill: string,
}

/**
 * Material de la cápsula. Con desenfoque real detrás (iOS) el tinte es ligero;
 * sin él (Android) va casi opaco: lo que pasa por debajo no debe competir con
 * los iconos.
 */
export const glassMaterial = (isDark: boolean, blurred: boolean): GlassMaterial => (isDark
	? {
		tintAlpha: blurred ? 0.5 : 0.94,
		rim: 'rgba(255,255,255,0.10)',
		highlight: 'rgba(255,255,255,0.07)',
		pill: 'rgba(255,255,255,0.10)',
	}
	: {
		tintAlpha: blurred ? 0.55 : 0.95,
		rim: 'rgba(14,14,28,0.08)',
		highlight: 'rgba(255,255,255,0.65)',
		pill: 'rgba(14,14,28,0.07)',
	})
