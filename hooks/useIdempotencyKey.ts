/**
 * Ref con la clave de idempotencia del intento en curso, generada UNA sola vez
 * por montaje.
 *
 * `useRef(makeIdempotencyKey())` pedía bytes aleatorios al polyfill de crypto
 * en CADA render y tiraba el resultado (`useRef` no tiene forma perezosa). El
 * inicializador perezoso de `useState` genera la clave una única vez; el ref
 * es quien la sostiene, para que rotarla tras un éxito confirmado
 * (`ref.current = makeIdempotencyKey()`) no provoque un render.
 *
 * @returns Ref mutable, de identidad estable, con la clave del intento.
 */
import { useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { makeIdempotencyKey } from '../helpers/idempotency'

export const useIdempotencyKey = (): MutableRefObject<string> => {
	const [initial] = useState(makeIdempotencyKey)
	return useRef(initial)
}
