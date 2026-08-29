/**
 * Encogido por longitud de los números "héroe" (balances, precios).
 *
 * `QPBalance` protegía el ancho con `adjustsFontSizeToFit`, que es una medida
 * NATIVA del `Text`: en cuanto el número se parte en un elemento por dígito
 * (la rama animada con NumberFlow) deja de funcionar como unidad — cada trozo
 * se escalaría por su cuenta. Este helper lo replica en JS, tomando la idea de
 * la fórmula que el Keypad ya usaba inline (screens/keypad/Keypad.tsx:
 * MAX/MIN_FONT_SIZE + FONT_SIZE_DECREASE_FACTOR).
 *
 * Diferencia importante con la del Keypad: allí se encoge desde el SEGUNDO
 * dígito porque el monto se teclea y crece sin decimales forzados. Aquí los
 * importes SIEMPRE traen dos decimales, así que empezar a encoger tan pronto
 * pintaría un saldo de "$5,00" un 30% más pequeño de lo que se ve hoy. Por eso
 * hay una franja de dígitos gratis: solo se encoge cuando el número de verdad
 * se acerca a desbordar.
 *
 * Lógica pura sin imports nativos: testeable en `@jest-environment node`.
 */

/** Dígitos que no penalizan: hasta $99.999,99 cabe de sobra al tamaño pleno. */
const DEFAULT_FREE_DIGITS = 7

/** Paso de reducción por dígito extra, en puntos. */
const DEFAULT_STEP = 4

/** Piso por defecto: 60% del tamaño máximo. */
const DEFAULT_MIN_RATIO = 0.6

/** Ajustes finos del encogido; todos opcionales. */
export type HeroFontSizeOptions = {
	/** Piso de tamaño. Por defecto el 60% de `max`. */
	min?: number
	/** Puntos que se restan por cada dígito pasado del umbral. */
	step?: number
	/** Dígitos que se pintan al tamaño pleno antes de empezar a encoger. */
	freeDigits?: number
}

/**
 * Tamaño de fuente para un héroe numérico según cuántos dígitos tenga.
 *
 * Cuenta SOLO dígitos: los separadores de miles y el decimal ocupan bastante
 * menos que una cifra, así que penalizarlos encogería de más un "1.234,56"
 * que en pantalla es más estrecho que un "123456,78".
 *
 * @param text - Cifras ya formateadas (sin el símbolo de moneda).
 * @param max - Tamaño pleno, el que se usa mientras el número quepa.
 * @param [options] - Piso, paso y franja de dígitos gratis.
 * @returns Tamaño de fuente en puntos, nunca por debajo del piso.
 */
export function heroFontSize(text: string, max: number, options: HeroFontSizeOptions = {}): number {
	const { min = max * DEFAULT_MIN_RATIO, step = DEFAULT_STEP, freeDigits = DEFAULT_FREE_DIGITS } = options
	const digits = String(text ?? '').replace(/\D/g, '').length
	if (digits <= freeDigits) { return max }
	return Math.max(max - (digits - freeDigits) * step, min)
}
