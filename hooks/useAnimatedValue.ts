/**
 * `Animated.Value` estable creado UNA sola vez por montaje.
 *
 * `useRef(new Animated.Value(0))` construye un nodo Animated en CADA render y
 * lo tira: `useRef` no tiene forma perezosa, evalúa su argumento siempre y
 * solo conserva el primero. El inicializador perezoso de `useState` sí corre
 * una única vez, y el valor que devuelve está garantizado estable durante toda
 * la vida del componente (a diferencia de `useMemo`, que React puede descartar
 * — y descartar el nodo dejaría la animación a medias).
 *
 * @param initial - Valor inicial de la animación (solo cuenta en el primer render).
 * @returns El mismo `Animated.Value` durante toda la vida del componente.
 */
import { useState } from 'react'
import { Animated } from 'react-native'

export const useAnimatedValue = (initial: number): Animated.Value => {
	const [value] = useState(() => new Animated.Value(initial))
	return value
}
