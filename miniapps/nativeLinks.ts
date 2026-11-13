/**
 * Enlaces de QvaPay que una mini-app abre en una pantalla NATIVA de la app en
 * vez de cargarlos como web (PURO: cero react-native, se testea con
 * `@jest-environment node`).
 *
 * Hoy solo el perfil P2P: `https://www.qvapay.com/p2p/user/<uuid>` (la URL
 * canónica) y `https://www.qvapay.com/p2p/u/<username>` (el atajo por
 * @usuario). Es la misma URL que funciona en un navegador normal, así que la
 * mini-app no tiene que distinguir si corre dentro de QvaPay: pone un enlace al
 * perfil y, dentro de la app, se abre la pantalla del perfil.
 *
 * Lista cerrada a propósito: una mini-app no debe poder empujar al usuario a
 * pantallas de dinero (`/pay`, `/send`, `/withdraw`…). Pagar tiene su propio
 * método del SDK, que comprueba que la factura es del comercio de la mini-app.
 * Añadir un destino = ampliar `NATIVE_LINK_RE` y `NATIVE_ROUTES` a la vez.
 */
import { resolveDeepLinkTarget } from '../helpers/deepLinkTarget'
import { ROUTES } from '../routes'
import type { RootStackParamList } from '../types/navigation'

/**
 * Filtro previo de las URLs que pueden abrir algo nativo. Lo comparte el SDK
 * inyectado (`sdkScript.ts`), que intercepta los clics en esos enlaces: así
 * también funcionan los `<Link>` de Next o React Router, que navegan sin
 * recargar la página y nunca pasan por `onShouldStartLoadWithRequest`. Solo
 * https y solo los dos hosts de qpweb.
 */
export const NATIVE_LINK_RE = /^https:\/\/(?:www\.)?qvapay\.com\/p2p\/(?:user|u)\/[^/?#]+\/?(?:[?#]|$)/i

/** Pantallas que una mini-app puede abrir con un enlace. */
const NATIVE_ROUTES: ReadonlySet<string> = new Set([ROUTES.P2P_USER_SCREEN])

export type NativeLinkTarget = { name: 'P2PUser', params: RootStackParamList['P2PUser'] }

/**
 * Pantalla nativa que abre una URL pedida por una mini-app, o null si la URL
 * debe seguir su camino de siempre (cargarse en el WebView o ir al navegador).
 *
 * @param url - Destino de una navegación del WebView o de `QvaPay.openLink`.
 */
export function nativeLinkTarget(url: unknown): NativeLinkTarget | null {
	if (typeof url !== 'string' || url.length > 2048 || !NATIVE_LINK_RE.test(url)) return null
	const target = resolveDeepLinkTarget(url)
	if (!target || !NATIVE_ROUTES.has(target.name)) return null
	// `resolveDeepLinkTarget` ya validó la forma del uuid o del username
	return target as NativeLinkTarget
}
