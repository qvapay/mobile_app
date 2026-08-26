import AsyncStorage from '@react-native-async-storage/async-storage'
import { addItem, removeItem, setItemQty, parseStoredItems } from './cartCore'
import type { CartItem } from './cartCore'

/**
 * Store de módulo del carrito del marketplace (singleton, sin Context).
 * Los componentes lo consumen vía `useMarketCart` (useSyncExternalStore).
 *
 * Persistencia en AsyncStorage bajo clave PROPIA, fuera del prefijo
 * `@qpcache:`: el carrito sobrevive al logout (como en la web) porque sus
 * ítems son snapshots de catálogo público, no datos de cuenta.
 */

const STORAGE_KEY = '@qpmarketcart:v1'

let items: CartItem[] = []
let hydrated = false
let hydrating: Promise<void> | null = null
const listeners = new Set<() => void>()

const notify = () => { listeners.forEach((cb) => cb()) }

// Fire-and-forget: si el storage falla el carrito simplemente no persiste.
const persist = () => {
	AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {})
}

/**
 * Lazily hydrates the cart from AsyncStorage (once per app session).
 *
 * @returns Resolves when hydration finished (or failed silently).
 */
export function hydrate(): Promise<void> {
	if (hydrated) return Promise.resolve()
	if (hydrating) return hydrating
	hydrating = AsyncStorage.getItem(STORAGE_KEY)
		.then((raw) => {
			const stored = parseStoredItems(raw)
			// No pisar mutaciones que llegaron antes de resolver la lectura.
			if (items.length === 0 && stored.length > 0) {
				items = stored
				notify()
			}
		})
		.catch(() => {})
		.finally(() => { hydrated = true })
	return hydrating
}

/**
 * Snapshot getter for useSyncExternalStore — same reference until a change.
 *
 * @returns Current cart items.
 */
export const getItems = (): CartItem[] => items

/**
 * Subscribes to cart changes (also kicks off hydration).
 *
 * @param callback - Invoked after every mutation.
 * @returns Unsubscribe.
 */
export function subscribe(callback: () => void): () => void {
	listeners.add(callback)
	hydrate()
	return () => { listeners.delete(callback) }
}

/**
 * Adds an item (merging duplicates by product+variant).
 *
 * @param item - Cart item snapshot.
 * @returns false when the cart is full (MAX_ITEMS new lines).
 */
export function add(item: CartItem): boolean {
	const result = addItem(items, item)
	if (!result.added) return false
	items = result.items
	persist()
	notify()
	return true
}

/**
 * Removes a line by its key.
 *
 * @param key - Line key from `cartItemKey`.
 */
export function remove(key: string): void {
	items = removeItem(items, key)
	persist()
	notify()
}

/**
 * Sets a line's quantity (clamped 1..999).
 *
 * @param key - Line key from `cartItemKey`.
 * @param qty - Desired quantity.
 */
export function setQty(key: string, qty: number): void {
	items = setItemQty(items, key, qty)
	persist()
	notify()
}

/** Empties the cart. */
export function clear(): void {
	items = []
	persist()
	notify()
}
