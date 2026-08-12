import AsyncStorage from '@react-native-async-storage/async-storage'
import { addItem, removeItem, setItemQty, parseStoredItems } from './cartCore'

/**
 * Store de módulo del carrito del marketplace (singleton, sin Context).
 * Los componentes lo consumen vía `useMarketCart` (useSyncExternalStore).
 *
 * Persistencia en AsyncStorage bajo clave PROPIA, fuera del prefijo
 * `@qpcache:`: el carrito sobrevive al logout (como en la web) porque sus
 * ítems son snapshots de catálogo público, no datos de cuenta.
 */

const STORAGE_KEY = '@qpmarketcart:v1'

let items = []
let hydrated = false
let hydrating = null
const listeners = new Set()

const notify = () => { listeners.forEach((cb) => cb()) }

// Fire-and-forget: si el storage falla el carrito simplemente no persiste.
const persist = () => {
	AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {})
}

/**
 * Lazily hydrates the cart from AsyncStorage (once per app session).
 *
 * @returns {Promise<void>} Resolves when hydration finished (or failed silently).
 */
export function hydrate() {
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
 * @returns {Object[]} Current cart items.
 */
export const getItems = () => items

/**
 * Subscribes to cart changes (also kicks off hydration).
 *
 * @param {Function} callback - Invoked after every mutation.
 * @returns {Function} Unsubscribe.
 */
export function subscribe(callback) {
	listeners.add(callback)
	hydrate()
	return () => { listeners.delete(callback) }
}

/**
 * Adds an item (merging duplicates by product+variant).
 *
 * @param {Object} item - Cart item snapshot.
 * @returns {boolean} false when the cart is full (MAX_ITEMS new lines).
 */
export function add(item) {
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
 * @param {string} key - Line key from `cartItemKey`.
 */
export function remove(key) {
	items = removeItem(items, key)
	persist()
	notify()
}

/**
 * Sets a line's quantity (clamped 1..999).
 *
 * @param {string} key - Line key from `cartItemKey`.
 * @param {number} qty - Desired quantity.
 */
export function setQty(key, qty) {
	items = setItemQty(items, key, qty)
	persist()
	notify()
}

/** Empties the cart. */
export function clear() {
	items = []
	persist()
	notify()
}
