/**
 * Cuántos `<Modal>` con puerta (`useModalGate`) hay en pantalla ahora mismo,
 * contando su animación de salida (PURO: solo React).
 *
 * Lo necesita quien presenta algo NATIVO por encima de la app sin que nadie se
 * lo pida, como las Novedades al arrancar: en iOS react-native-screens cierra
 * cualquier `<Modal>` ajeno presentado para poner su pantalla modal, y hacerlo
 * con el bloqueo delante (o mientras aún se va) lo tira abajo o deja un modal
 * zombi (ver `ui/modalGate.ts`). Un estado de React no sirve de señal: «ya no
 * está bloqueado» llega bastante antes de que el `<Modal>` termine de irse.
 */
import { useSyncExternalStore } from 'react'

let presented = 0
const listeners = new Set<() => void>()

const emit = () => { listeners.forEach(listener => listener()) }

/**
 * Apunta un modal en pantalla.
 *
 * @returns Función que lo da de baja (idempotente).
 */
export const acquireModalPresence = (): (() => void) => {
	presented += 1
	emit()
	let released = false
	return () => {
		if (released) return
		released = true
		presented -= 1
		emit()
	}
}

/** Hay al menos un modal con puerta en pantalla (o terminando de irse). */
export const isAnyModalPresented = (): boolean => presented > 0

const subscribe = (listener: () => void) => {
	listeners.add(listener)
	return () => { listeners.delete(listener) }
}

/** `isAnyModalPresented` reactivo. */
export const useAnyModalPresented = (): boolean => useSyncExternalStore(subscribe, isAnyModalPresented, isAnyModalPresented)

/**
 * Espera a que no quede ningún modal con puerta en pantalla (salida incluida) antes de
 * presentar otro: en iOS, presentar un `<Modal>` mientras otro termina de irse deja un modal
 * zombi (ver `ui/modalGate.ts`). Con tope, por si un `onDismiss` nativo no llegara nunca.
 *
 * @param timeoutMs - Máximo de espera.
 * @returns Promesa que resuelve al quedar la pantalla libre (o al vencer el tope).
 */
export const whenNoModalPresented = (timeoutMs = 1500): Promise<void> => new Promise(resolve => {
	if (!isAnyModalPresented()) { resolve(); return }
	let timer: ReturnType<typeof setTimeout> | null = null
	const listener = () => {
		if (isAnyModalPresented()) return
		finish()
	}
	const finish = () => {
		listeners.delete(listener)
		if (timer) clearTimeout(timer)
		resolve()
	}
	listeners.add(listener)
	timer = setTimeout(finish, timeoutMs)
})
