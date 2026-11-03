import { useCallback, useEffect, useReducer, useRef } from 'react'
import { Platform } from 'react-native'

import { initialModalGate, isModalGateMounted, isModalGatePending, reduceModalGate, MODAL_GATE_TIMEOUT_MS } from './modalGate'

export type ModalGate = {
	/** Para `<Modal visible>`. */
	visible: boolean
	/** Mientras sea true hay que seguir renderizando el `<Modal>` (iOS espera a `onDismiss`). */
	mounted: boolean
	/** Sube con cada presentación: `key` para que el contenido arranque en blanco. */
	generation: number
	/** Para `<Modal onShow>`. */
	onShow: () => void
	/** Para `<Modal onDismiss>`. */
	onDismiss: () => void
}

/**
 * Serializa la presentación de un `<Modal>` de RN para que nunca se oculte antes
 * de terminar de presentarse ni se presente antes de terminar de ocultarse. Ver
 * `ui/modalGate.ts` para el porqué (en iOS eso deja un modal zombi que bloquea
 * todos los demás). Uso:
 *
 *   const gate = useModalGate(abierto)
 *   return gate.mounted
 *     ? <Modal visible={gate.visible} onShow={gate.onShow} onDismiss={gate.onDismiss}>…</Modal>
 *     : null
 *
 * El contenido que deba arrancar en blanco en cada apertura lleva `key={gate.generation}`.
 * En Android (un Dialog, show/dismiss síncronos) no hay carrera: `visible` sigue a
 * `wanted` tal cual y `mounted` = `visible`.
 *
 * @param wanted - Si la pantalla quiere el modal abierto.
 */
export function useModalGate(wanted: boolean): ModalGate {
	const gated = Platform.OS === 'ios'
	const [state, dispatch] = useReducer(reduceModalGate, wanted, initialModalGate)

	useEffect(() => { dispatch({ type: 'want', visible: wanted }) }, [wanted])

	// Red de seguridad: si el evento nativo no llega, aplicar lo pedido igualmente
	const pending = gated && isModalGatePending(state)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(() => {
		if (!pending) return
		timerRef.current = setTimeout(() => { timerRef.current = null; dispatch({ type: 'timeout' }) }, MODAL_GATE_TIMEOUT_MS)
		return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }
	}, [pending])

	const onShow = useCallback(() => dispatch({ type: 'shown' }), [])
	const onDismiss = useCallback(() => dispatch({ type: 'dismissed' }), [])

	if (!gated) return { visible: wanted, mounted: wanted, generation: state.generation, onShow, onDismiss }
	return { visible: state.visible, mounted: isModalGateMounted(state), generation: state.generation, onShow, onDismiss }
}
