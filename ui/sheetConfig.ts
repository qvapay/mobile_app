import { Easing, SlideInDown } from 'react-native-reanimated'

/**
 * Cuánto de la pantalla puede ocupar una hoja. UN número, aquí.
 *
 * Antes había cuatro repartidos por la app —80, 90, 92 y un `maxHeight: 400` en píxeles
 * fijos— para el mismo gesto, así que la misma lista subía distinto según desde dónde se
 * abriera. Lo que consume la cabecera de cada hoja se descuenta de este tope, nunca se
 * inventa otra fracción.
 */
export const SHEET_MAX_RATIO = 0.92

/**
 * Cómo entra una hoja: SOLO ella sube; el velo oscuro lo pone el `fade` del Modal en su
 * sitio. Con `animationType="slide"` subía el overlay entero como un bloque. No hay
 * `exiting`: un Modal desmonta al instante con `visible=false`, así que el cierre es el
 * fundido del Modal. Mismo timing que `ChargeSheet`.
 */
export const SHEET_ENTERING = SlideInDown.duration(280).easing(Easing.out(Easing.cubic))
