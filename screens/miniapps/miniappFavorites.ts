import { pickHomeMiniApps } from './miniappsCatalog'
import type { MiniApp } from '../../types/domain'

/**
 * Mini-apps favoritas (PURO: sin react-native, se testea en node). Viven
 * solo en el teléfono, como lista de slugs por cuenta (`user.uuid`): la más
 * reciente primero, para que al marcarla se vea al principio de la fila.
 */

/** Slugs favoritos por cuenta. */
export type FavoritesByOwner = Record<string, string[]>

/** Cuántas favoritas salen al mantener pulsado el icono de QvaPay (iOS enseña 4). */
export const QUICK_ACTIONS_LIMIT = 4

// Un slug de qpweb es corto (minúsculas y guiones); esto solo descarta basura del disco
const isSlug = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 120

/**
 * Marca o desmarca una favorita.
 * @returns La lista nueva: al marcar, la mini-app va primera.
 */
export const toggleFavorite = (list: readonly string[], slug: string): string[] =>
	list.includes(slug) ? list.filter(s => s !== slug) : [slug, ...list]

/**
 * Lee lo guardado en disco; cualquier cosa rara se descarta en vez de romper el Home.
 * @param raw - JSON de AsyncStorage (o null si no hay nada).
 */
export const parseStoredFavorites = (raw: string | null | undefined): FavoritesByOwner => {
	if (!raw) return {}
	let parsed: unknown
	try { parsed = JSON.parse(raw) } catch { return {} }
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
	const out: FavoritesByOwner = {}
	for (const [owner, list] of Object.entries(parsed as Record<string, unknown>)) {
		if (!owner || !Array.isArray(list)) continue
		const slugs = [...new Set(list.filter(isSlug))]
		if (slugs.length > 0) out[owner] = slugs
	}
	return out
}

/** Lo que necesita un acceso rápido del icono de la app. */
export type QuickActionItem = { slug: string, name: string, icon: string | null }

/**
 * Accesos rápidos del icono de QvaPay: las primeras favoritas que siguen en
 * el directorio (mismas reglas que la fila del Home, sin relleno).
 */
export const quickActionFavorites = (apps: MiniApp[] | null | undefined, favorites: readonly string[], limit = QUICK_ACTIONS_LIMIT): QuickActionItem[] =>
	pickHomeMiniApps(apps, { favorites, limit: 0 })
		.slice(0, Math.max(0, limit))
		.map(app => ({ slug: app.slug, name: app.name, icon: app.icon ?? null }))
