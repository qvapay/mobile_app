/**
 * Enlaces públicos de una mini-app (PURO: cero react-native, se testea con
 * `@jest-environment node`).
 *
 * Cada mini-app publicada tiene página pública en qpweb (`/apps/<slug>`) que
 * abre la mini-app dentro de la app (universal link / App Link) o lleva a
 * descargarla. La app GENERA esa URL siempre por `www` (dominio canónico de
 * qpweb) y la ACEPTA por apex, www y el esquema `qvapay://`.
 */

/** Dominio canónico de qpweb: toda URL que la app genera sale por www. */
export const WEB_ORIGIN = 'https://www.qvapay.com'

/** Segmento de ruta de las mini-apps en la web y en los deep links. */
export const MINIAPPS_PATH = 'apps'

/**
 * URL pública de una mini-app, la que se comparte.
 * @param slug - Slug de la mini-app (minúsculas, guiones).
 */
export const buildMiniAppUrl = (slug: string): string => `${WEB_ORIGIN}/${MINIAPPS_PATH}/${encodeURIComponent(slug)}`

// `/apps/<slug>` en una URL https (apex o www) o `qvapay://apps/<slug>`; la
// query y el hash no cuentan. Como los parsers hermanos de useAppNavigation,
// NO valida el host: el perímetro lo ponen `linking.prefixes`, el AASA de iOS
// y el intent-filter de Android (una URL ajena jamás llega aquí como deep link)
const MINIAPP_LINK_RE = /(?:\/|^qvapay:\/\/)apps\/([^/?#]+)/

/**
 * Extrae el slug de un deep link de mini-app.
 * @param url - p. ej. `https://www.qvapay.com/apps/mi-app?utm=x` o `qvapay://apps/mi-app`.
 * @returns `{ slug }`, o null si la URL no es un enlace de mini-app.
 */
export const parseMiniAppLink = (url: string): { slug: string } | null => {
	const match = url.match(MINIAPP_LINK_RE)
	if (!match) return null
	try { return { slug: decodeURIComponent(match[1]) } } catch { return null }
}

/**
 * Texto de la hoja de compartir (Android lo usa como payload; iOS manda `url`
 * aparte). Con texto propio de la mini-app (SDK) la URL va en su propia línea;
 * sin él, el copy por defecto ya la incluye.
 */
export const buildMiniAppShareMessage = ({ url, defaultMessage, text }: { url: string, defaultMessage: string, text?: string }): string =>
	text ? `${text}\n${url}` : defaultMessage
