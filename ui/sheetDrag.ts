/**
 * Cuándo se cierra una hoja arrastrada hacia abajo (PURO, worklet).
 *
 * Se decide con dónde ACABARÍA la hoja, no con dónde se soltó: un latigazo corto
 * cierra aunque apenas se haya movido, y uno hacia arriba tras bajarla la deja abierta.
 */

/** Puntos que hay que bajar la hoja, contando su inercia, para que se cierre. */
export const SHEET_DISMISS_DISTANCE = 120

/** Segundos de inercia que se proyectan a partir de la velocidad al soltar. */
const DISMISS_PROJECTION = 0.15

/**
 * @param translationY - Lo que se ha arrastrado, en puntos.
 * @param velocityY - Velocidad al soltar, en puntos por segundo.
 */
export const shouldDismissSheet = (translationY: number, velocityY: number): boolean => {
	'worklet'
	return translationY + velocityY * DISMISS_PROJECTION > SHEET_DISMISS_DISTANCE
}
