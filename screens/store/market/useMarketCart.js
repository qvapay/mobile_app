import { useSyncExternalStore } from 'react'
import { subscribe, getItems, add, remove, setQty, clear } from './marketCartStore'
import { cartCount } from './cartCore'

/**
 * Hook del carrito del marketplace. Cualquier componente que lo use se
 * re-renderiza ante mutaciones del store (badge del header incluido), sin
 * Provider: el estado vive en `marketCartStore` (módulo singleton).
 *
 * @returns {{ items: Object[], count: number, add: Function, remove: Function, setQty: Function, clear: Function }} Cart state and mutators.
 */
export default function useMarketCart() {
	const items = useSyncExternalStore(subscribe, getItems)
	return { items, count: cartCount(items), add, remove, setQty, clear }
}
