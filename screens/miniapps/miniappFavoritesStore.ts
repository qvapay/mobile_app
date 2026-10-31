import AsyncStorage from '@react-native-async-storage/async-storage'
import { parseStoredFavorites, toggleFavorite } from './miniappFavorites'
import type { FavoritesByOwner } from './miniappFavorites'

/**
 * Store de módulo de las mini-apps favoritas (singleton, sin Context). Los
 * componentes lo consumen vía `useMiniAppFavorites` (useSyncExternalStore).
 *
 * Una sola clave con un mapa por cuenta: dos cuentas en el mismo teléfono no
 * se mezclan. Fuera del prefijo `@qpcache:`, así que sobrevive al logout:
 * las favoritas son del teléfono, no del servidor.
 */

const STORAGE_KEY = '@qpminiapps:favorites:v1'

let byOwner: FavoritesByOwner = {}
let hydrated = false
let hydrating: Promise<void> | null = null
const listeners = new Set<() => void>()

const notify = () => { listeners.forEach((cb) => cb()) }

// Fire-and-forget: si el storage falla las favoritas simplemente no persisten.
const persist = () => {
	AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(byOwner)).catch(() => {})
}

/**
 * Lazily hydrates the favorites from AsyncStorage (once per app session).
 *
 * @returns Resolves when hydration finished (or failed silently).
 */
export function hydrate(): Promise<void> {
	if (hydrated) return Promise.resolve()
	if (hydrating) return hydrating
	hydrating = AsyncStorage.getItem(STORAGE_KEY)
		.then((raw) => {
			const stored = parseStoredFavorites(raw)
			if (Object.keys(stored).length === 0) return
			// No pisar lo que se marcó antes de resolver la lectura: esa cuenta gana
			const touched = Object.keys(byOwner).length > 0
			byOwner = { ...stored, ...byOwner }
			if (touched) persist()
			notify()
		})
		.catch(() => {})
		.finally(() => { hydrated = true })
	return hydrating
}

/**
 * Snapshot getter for useSyncExternalStore — same reference until a change.
 *
 * @returns Favorite slugs by account uuid.
 */
export const getFavoritesByOwner = (): FavoritesByOwner => byOwner

/**
 * Subscribes to favorites changes (also kicks off hydration).
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
 * Marks or unmarks a mini-app as favorite for one account.
 *
 * @param owner - Account uuid.
 * @param slug - Mini-app slug.
 * @returns true when it is now a favorite.
 */
export function toggle(owner: string, slug: string): boolean {
	const next = toggleFavorite(byOwner[owner] ?? [], slug)
	const updated = { ...byOwner, [owner]: next }
	if (next.length === 0) delete updated[owner]
	byOwner = updated
	persist()
	notify()
	return next.includes(slug)
}
