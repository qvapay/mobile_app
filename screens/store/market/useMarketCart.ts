import { useSyncExternalStore } from 'react'
import { subscribe, getItems, add, remove, setQty, clear } from './marketCartStore'
import { cartCount } from './cartCore'
import type { CartItem } from './cartCore'

/** Lo que devuelve el hook: los ítems del carrito, su conteo y los mutadores del store. */
export type MarketCart = {
	items: CartItem[]
	count: number
	add: typeof add
	remove: typeof remove
	setQty: typeof setQty
	clear: typeof clear
}

/**
 * Hook del carrito del marketplace. Cualquier componente que lo use se
 * re-renderiza ante mutaciones del store (badge del header incluido), sin
 * Provider: el estado vive en `marketCartStore` (módulo singleton).
 *
 * @returns Cart state and mutators.
 */
export default function useMarketCart(): MarketCart {
	const items = useSyncExternalStore(subscribe, getItems)
	return { items, count: cartCount(items), add, remove, setQty, clear }
}
