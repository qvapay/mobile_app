import { ROUTES } from '../routes'

/**
 * Destino resuelto para el botón de un aviso.
 *
 * - `tab`: una pestaña de MainStack (`navigate(MAIN_STACK, { screen })`).
 * - `screen`: una pantalla del stack raíz, con sus params.
 * - `external`: fuera de la app (`Linking.openURL`).
 */
export type AnnouncementTarget =
	| { kind: 'tab', screen: string }
	| { kind: 'screen', route: string, params: Record<string, string> }
	| { kind: 'external', url: string }

// Dominio canónico de qpweb: toda URL que la app GENERA sale por www
const WEB_ORIGIN = 'https://www.qvapay.com'

// Hosts propios cuyas URLs absolutas se intentan resolver dentro de la app
// antes de mandarlas al navegador
const OWN_HOSTS = ['qvapay.com', 'www.qvapay.com']

/**
 * Tabla de rutas internas, ESPEJO de `linking.js`. Se mantiene aparte a
 * propósito: `linking.js` traduce URLs que ABREN la app (React Navigation las
 * resuelve reconstruyendo el estado entero), mientras que aquí se navega desde
 * una pantalla ya montada y basta con un `navigate`.
 *
 * El orden importa: el patrón de producto (2 segmentos) va antes que el de
 * tienda (1), igual que en `linking.js`.
 */
const PATH_ROUTES: { match: RegExp, target: (m: RegExpMatchArray) => AnnouncementTarget }[] = [
	{ match: /^\/home$/, target: () => ({ kind: 'tab', screen: ROUTES.HOME_SCREEN }) },
	{ match: /^\/p2p$/, target: () => ({ kind: 'tab', screen: ROUTES.P2P_SCREEN }) },
	{ match: /^\/store$/, target: () => ({ kind: 'tab', screen: ROUTES.STORE_SCREEN }) },
	{ match: /^\/p2p\/([^/]+)$/, target: m => ({ kind: 'screen', route: ROUTES.P2P_OFFER_SCREEN, params: { p2p_uuid: m[1] } }) },
	{ match: /^\/pay\/([^/]+)$/, target: m => ({ kind: 'screen', route: ROUTES.PAY_SCREEN, params: { uuid: m[1] } }) },
	{ match: /^\/topup$/, target: () => ({ kind: 'screen', route: ROUTES.TOPUP_SCREEN, params: {} }) },
	{ match: /^\/store\/([^/]+)\/([^/]+)$/, target: m => ({ kind: 'screen', route: ROUTES.MARKET_PRODUCT, params: { slug: m[1], uuid: m[2] } }) },
	{ match: /^\/store\/([^/]+)$/, target: m => ({ kind: 'screen', route: ROUTES.MARKET_STORE, params: { slug: m[1] } }) },
]

// Separa el path de su query/hash: los patrones se comparan contra el path pelado
const pathOf = (value: string) => value.split(/[?#]/)[0].replace(/\/+$/, '') || '/'

/**
 * Resuelve el `cta_url` de un aviso al destino que debe abrir la app.
 *
 * El panel admin ya obliga a que el enlace sea una ruta interna (`/ruta`) o una
 * URL `https://`, pero esto se valida igual: el aviso lo escribe una persona y
 * un esquema inesperado no debe llegar nunca a `Linking.openURL`.
 *
 * Una ruta interna que la app sabe pintar se navega DENTRO de la app; el resto
 * se abre en el navegador contra el dominio canónico (`www.qvapay.com`). Las
 * URLs absolutas a qvapay.com pasan por la misma tabla, así que un admin que
 * pegue el enlace completo obtiene igualmente navegación nativa.
 *
 * @param ctaUrl - `cta_url` del aviso (`/ruta`, `https://…`), o null.
 * @returns El destino a abrir, o `null` si no hay enlace o el esquema no es aceptable.
 */
export const resolveAnnouncementTarget = (ctaUrl?: string | null): AnnouncementTarget | null => {

	const url = ctaUrl?.trim()
	if (!url) return null

	// Ruta interna
	if (url.startsWith('/')) {
		const path = pathOf(url)
		for (const { match, target } of PATH_ROUTES) {
			const found = path.match(match)
			if (found) return target(found)
		}
		// Ruta que la app no tiene: se abre en la web
		return { kind: 'external', url: `${WEB_ORIGIN}${url}` }
	}

	// A partir de aquí solo https (el panel no permite otra cosa, pero un
	// `javascript:` o un `http://` jamás deben llegar a Linking.openURL)
	if (!url.startsWith('https://')) return null

	const withoutScheme = url.slice('https://'.length)
	const slash = withoutScheme.indexOf('/')
	const host = (slash === -1 ? withoutScheme : withoutScheme.slice(0, slash)).toLowerCase()

	if (OWN_HOSTS.includes(host)) {
		const path = pathOf(slash === -1 ? '/' : withoutScheme.slice(slash))
		for (const { match, target } of PATH_ROUTES) {
			const found = path.match(match)
			if (found) return target(found)
		}
	}

	return { kind: 'external', url }
}
