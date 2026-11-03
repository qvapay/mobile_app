/**
 * Puerta de presentación de un `<Modal>` en iOS (PURO: sin react-native).
 *
 * En Fabric, el `<Modal>` de RN presenta un UIViewController y, al ocultarse o
 * desmontarse, pide su `dismiss`. UIKit IGNORA un dismiss mientras la presentación
 * aún anima (y un present mientras el dismiss aún anima): el controlador queda
 * presentado para siempre, invisible, y desde ese momento TODO `<Modal>` de la
 * app falla con «Attempt to present … which is already presenting» hasta
 * reiniciar. Se cazó el 2026-11-02 en un iPhone 17 Pro Max con iOS 27: la
 * pantalla de bloqueo se desmontaba en cuanto Face ID desbloqueaba, antes de
 * terminar su fade de entrada, y la hoja de valoración del P2P (y cualquier
 * otro modal) dejaba de salir.
 *
 * El reductor serializa: `visible` solo pasa a false cuando llegó `onShow`
 * (`shown`) y solo vuelve a true cuando llegó `onDismiss` (`dismissed`). Lo que
 * la pantalla PIDE se recuerda en `wanted` y se aplica en cuanto es seguro.
 * `timeout` es la red de seguridad para cuando el evento nativo nunca llega
 * (p. ej. la presentación fue rechazada por otro modal): entonces se aplica lo
 * pedido sin esperar más. `generation` sube con cada presentación nueva, para
 * que quien monte contenido por apertura (`key`) arranque en blanco.
 */
export type ModalGateState = {
	/** Lo que recibe `<Modal visible>`. */
	visible: boolean
	/** Lo último que pidió la pantalla. */
	wanted: boolean
	/** `onShow` ya llegó para la presentación vigente. */
	presented: boolean
	/** `visible` pasó a false y aún no llegó `onDismiss`. */
	dismissing: boolean
	/** Número de presentación (sube con cada `visible` → true). */
	generation: number
}

export type ModalGateEvent =
	| { type: 'want', visible: boolean }
	| { type: 'shown' }
	| { type: 'dismissed' }
	| { type: 'timeout' }

/** Tope de espera por `onShow`/`onDismiss` antes de aplicar lo pedido de todas formas. */
export const MODAL_GATE_TIMEOUT_MS = 1500

export const initialModalGate = (wanted: boolean): ModalGateState => ({
	visible: wanted,
	wanted,
	presented: false,
	dismissing: false,
	generation: wanted ? 1 : 0,
})

const present = (state: ModalGateState): ModalGateState => ({ ...state, visible: true, presented: false, dismissing: false, generation: state.generation + 1 })
const hide = (state: ModalGateState): ModalGateState => ({ ...state, visible: false, presented: false, dismissing: true })

export function reduceModalGate(state: ModalGateState, event: ModalGateEvent): ModalGateState {
	switch (event.type) {
		case 'want': {
			const next = { ...state, wanted: event.visible }
			if (event.visible) {
				// Ya visible: nada. Cerrándose: esperar a `dismissed`. Si no, presentar
				return next.visible || next.dismissing ? next : present(next)
			}
			// Ya oculto: nada. Presentándose aún: esperar a `shown`. Si no, ocultar
			return !next.visible || !next.presented ? next : hide(next)
		}
		case 'shown': {
			if (!state.visible) return state
			const next = { ...state, presented: true }
			return next.wanted ? next : hide(next)
		}
		case 'dismissed': {
			if (!state.dismissing) return state
			const next = { ...state, dismissing: false }
			return next.wanted && !next.visible ? present(next) : next
		}
		case 'timeout': {
			// Sin `onShow`: ocultar sin esperar (el dismiss sobre algo no presentado no hace nada)
			if (state.visible && !state.presented && !state.wanted) return { ...state, visible: false, dismissing: false }
			// Sin `onDismiss`: volver a presentar lo pedido
			if (state.dismissing) {
				const next = { ...state, dismissing: false }
				return next.wanted && !next.visible ? present(next) : next
			}
			return state
		}
	}
}

/** ¿Hay que seguir montando el `<Modal>`? (en iOS, hasta que llegue `onDismiss`). */
export const isModalGateMounted = (state: ModalGateState): boolean => state.visible || state.dismissing

/** ¿Hay algo pedido a la espera de un evento nativo? (solo entonces se arma el tope de espera). */
export const isModalGatePending = (state: ModalGateState): boolean =>
	(state.visible && !state.presented && !state.wanted) || (state.dismissing && state.wanted)
