import { mediaUrl } from '../../helpers/mediaUrl'
import type { MiniApp } from '../../types/domain'

/**
 * Lógica PURA del catálogo de mini-apps (sin react-native: se testea en node).
 * Las categorías son las de `scripts/miniapps/rules.js` de qpweb, en el mismo
 * orden; una que el backend añada y la app no conozca cae en `other`.
 */
export const MINIAPP_CATEGORIES = ['shopping', 'games', 'finance', 'services', 'social', 'tools', 'other'] as const
export type MiniAppCategory = typeof MINIAPP_CATEGORIES[number]

/** Icono (FontAwesome6 solid) y color de acento de cada categoría. */
export const CATEGORY_META = {
	shopping: { icon: 'bag-shopping', color: '#F59E0B' },
	games: { icon: 'gamepad', color: '#8B5CF6' },
	finance: { icon: 'coins', color: '#10B981' },
	services: { icon: 'bell-concierge', color: '#3B82F6' },
	social: { icon: 'user-group', color: '#EC4899' },
	tools: { icon: 'screwdriver-wrench', color: '#64748B' },
	other: { icon: 'shapes', color: '#6759EF' },
} as const satisfies Record<MiniAppCategory, { icon: string, color: string }>

/** El buscador solo aparece cuando hay apps suficientes para necesitarlo. */
export const SEARCH_MIN_APPS = 7

export const categoryOf = (app: Pick<MiniApp, 'category'>): MiniAppCategory =>
	(MINIAPP_CATEGORIES as readonly string[]).includes(app.category) ? app.category as MiniAppCategory : 'other'

/** Categorías con al menos una app, en el orden fijo de arriba. */
export const presentCategories = (apps: Pick<MiniApp, 'category'>[]): MiniAppCategory[] => {
	const seen = new Set(apps.map(categoryOf))
	return MINIAPP_CATEGORIES.filter(c => seen.has(c))
}

/** Minúsculas y sin tildes: «cafe» encuentra «Café». */
export const normalizeSearch = (s: string | null | undefined): string =>
	(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Busca en el nombre, la descripción corta y el autor. */
export const matchesQuery = (app: Pick<MiniApp, 'name' | 'tagline' | 'merchant'>, query: string): boolean => {
	const q = normalizeSearch(query)
	if (!q) return true
	return [app.name, app.tagline, app.merchant?.name].some(field => normalizeSearch(field).includes(q))
}

/** Portada de una destacada; un SVG no se puede recortar a sangre, así que no cuenta. */
export const coverOf = (app: Pick<MiniApp, 'cover'>): string | null => {
	const uri = mediaUrl(app.cover)
	return uri && !/\.svg($|\?)/i.test(uri) ? uri : null
}

export type CatalogView = {
	/** Carrusel de destacadas: solo sin filtro (con filtro, todo va a la lista). */
	featured: MiniApp[]
	/** Lista de abajo. Sin filtro, sin las destacadas (ya están arriba). */
	list: MiniApp[]
	/** Hay búsqueda o categoría activa. */
	filtering: boolean
}

/**
 * Reparte el catálogo entre el carrusel y la lista. Conserva el orden del
 * servidor (destacadas primero, luego `sort` y nombre).
 */
export const buildCatalogView = (apps: MiniApp[], { query = '', category = null }: { query?: string, category?: MiniAppCategory | null } = {}): CatalogView => {
	const filtering = !!normalizeSearch(query) || category != null
	if (filtering) {
		const list = apps.filter(app => (category == null || categoryOf(app) === category) && matchesQuery(app, query))
		return { featured: [], list, filtering }
	}
	return {
		featured: apps.filter(app => app.featured),
		list: apps.filter(app => !app.featured),
		filtering,
	}
}
