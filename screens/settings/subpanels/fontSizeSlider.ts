// Geometría del slider de Ajustes → Fuente, sacada de FontSize.tsx para probarla en node
// (fontSizeSlider.test.js). Las funciones son worklets: el gesto las llama en el hilo de UI.
// Sin imports de React Native, para que el test siga en `@jest-environment node`.

/** Ancho del área de cada paso: los puntos se reparten con `space-between`, así que el
 *  primer y el último centro quedan a medio paso de los bordes. */
export const STEP_HIT = 28

/**
 * Centro horizontal del paso `index` dentro de una pista de `width`.
 *
 * @param index - Paso (0 … count − 1).
 * @param width - Ancho medido de la pista.
 * @param count - Número de pasos.
 * @returns X del centro, relativa a la pista.
 */
export const stepCenterX = (index: number, width: number, count: number): number => {
	'worklet'
	if (count < 2) return width / 2
	return STEP_HIT / 2 + index * (width - STEP_HIT) / (count - 1)
}

/**
 * X del dedo acotada al tramo entre el primer y el último centro (el pulgar no se sale).
 *
 * @param x - X del toque, relativa a la pista.
 * @param width - Ancho medido de la pista.
 * @returns X acotada.
 */
export const clampToTrack = (x: number, width: number): number => {
	'worklet'
	return Math.min(Math.max(x, STEP_HIT / 2), Math.max(width - STEP_HIT / 2, STEP_HIT / 2))
}

/**
 * Paso más cercano a una X (el que se aplica al cruzar la mitad entre dos puntos).
 *
 * @param x - X del toque, relativa a la pista.
 * @param width - Ancho medido de la pista.
 * @param count - Número de pasos.
 * @returns Índice acotado a 0 … count − 1.
 */
export const nearestStep = (x: number, width: number, count: number): number => {
	'worklet'
	if (count < 2 || width <= STEP_HIT) return 0
	const index = Math.round((x - STEP_HIT / 2) / ((width - STEP_HIT) / (count - 1)))
	return Math.min(Math.max(index, 0), count - 1)
}
