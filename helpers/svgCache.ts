import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Caché de SVGs remotos en tres capas, compartida por QPCoin y QPSvgUri:
 *
 * 1. Memoria de módulo (síncrona) — los remounts (saltos de tab/screen)
 *    pintan el XML en el primer render, sin parpadeo ni red.
 * 2. AsyncStorage — arranques fríos sin red (read-through hacia memoria).
 * 3. Red — una sola vez por URL y sesión, con dedup de fetches en vuelo
 *    (n filas pidiendo el mismo logo → un único fetch).
 *
 * Un payload sin tag `<svg` (404 HTML, error del CDN…) resuelve null y NO se
 * cachea, para que el próximo montaje reintente.
 */
const memory = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

export const getCachedSvgSync = (uri: string): string | null => memory.get(uri) || null

// Solo para tests: la memoria de módulo rompería el aislamiento entre casos
export const clearSvgMemory = (): void => {
	memory.clear()
	inflight.clear()
}

export const loadSvg = (uri: string, storageKey: string = `svg_cache_uri_${uri}`): Promise<string | null> => {
	if (memory.has(uri)) return Promise.resolve(memory.get(uri) as string)
	if (inflight.has(uri)) return inflight.get(uri) as Promise<string | null>

	const promise = (async (): Promise<string | null> => {
		try {
			const cached = await AsyncStorage.getItem(storageKey)
			if (cached) {
				memory.set(uri, cached)
				return cached
			}
		} catch { /* cache read failed */ }

		try {
			const response = await fetch(uri)
			const xml = await response.text()
			if (xml && xml.includes('<svg')) {
				memory.set(uri, xml)
				AsyncStorage.setItem(storageKey, xml).catch(() => { /* cache write failed */ })
				return xml
			}
			return null
		} catch { return null }
	})().finally(() => inflight.delete(uri))

	inflight.set(uri, promise)
	return promise
}
