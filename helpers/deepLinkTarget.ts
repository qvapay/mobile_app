/**
 * Resolución PURA de una URL de QvaPay a la ruta de React Navigation que la
 * abre: espejo de `linking.ts` para los casos en que la URL no entra por el
 * sistema (un deep link guardado hasta después del login, el `deeplink` de una
 * push). React Navigation solo resuelve URLs que le llegan por `Linking`; para
 * navegar "a mano" hace falta esta tabla.
 *
 * Acepta los mismos prefijos que `linking.prefixes` (apex, www y el esquema
 * `qvapay://`). Una URL ajena o un path desconocido devuelven null.
 *
 * Mantener en espejo con `linking.ts` al añadir una ruta.
 */

import { ROUTES } from '../routes'
import { parseMiniAppLink } from '../screens/miniapps/miniappLinks'

/** Ruta raíz + params que la abre (`name` como lo espera `navigation.reset`). */
export type DeepLinkTarget = { name: string, params?: Record<string, unknown> }

const PREFIX_RE = /^(?:https?:\/\/(?:www\.)?qvapay\.com(?:\/|$)|qvapay:\/\/)(.*)$/i

/** Separa path y query de lo que queda tras el prefijo. */
const splitLink = (url: string): { segments: string[], query: Record<string, string> } | null => {
	const match = url.trim().match(PREFIX_RE)
	if (!match) return null
	const rest = match[1].split('#')[0]
	const [path, queryString = ''] = rest.split('?')
	const segments: string[] = []
	for (const raw of path.split('/')) {
		if (!raw) continue
		try { segments.push(decodeURIComponent(raw)) } catch { return null }
	}
	const query: Record<string, string> = {}
	for (const pair of queryString.split('&')) {
		if (!pair) continue
		const [key, value = ''] = pair.split('=')
		try { query[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' ')) } catch { /* par ilegible: se ignora */ }
	}
	return { segments, query }
}

/** Pestaña de MainStack como destino (`/home`, `/crypto`, `/p2p`). */
const tab = (screen: string): DeepLinkTarget => ({ name: ROUTES.MAIN_STACK, params: { screen } })

/**
 * Ruta que abre una URL de QvaPay.
 *
 * @param url - p. ej. `https://www.qvapay.com/p2p/<uuid>?order=<uuid>` o `qvapay://savings`.
 * @returns `{ name, params? }`, o null si no es un destino que la app sepa abrir.
 */
export const resolveDeepLinkTarget = (url: string | null | undefined): DeepLinkTarget | null => {
	if (!url) return null
	const link = splitLink(url)
	if (!link) return null
	const { segments, query } = link
	const [head, second, third] = segments

	switch (head) {
		case 'p2p': {
			if (segments.length === 1) return tab(ROUTES.P2P_SCREEN)
			if (second === 'promote') {
				const coin = query.coin || undefined
				const type = query.type === 'sell' || query.type === 'buy' ? query.type : undefined
				return { name: ROUTES.P2P_PROMOTE, params: { ...(coin ? { coin } : {}), ...(type ? { type } : {}) } }
			}
			if (segments.length === 2) {
				return { name: ROUTES.P2P_OFFER_SCREEN, params: query.order ? { p2p_uuid: second, order: query.order } : { p2p_uuid: second } }
			}
			return null
		}
		case 'pay':
			return segments.length === 2 ? { name: ROUTES.PAY_SCREEN, params: { uuid: second } } : null
		case 'store':
			if (segments.length === 3) return { name: ROUTES.MARKET_PRODUCT, params: { uuid: third } }
			if (segments.length === 2) return { name: ROUTES.MARKET_STORE, params: { slug: second } }
			return null
		case 'apps': {
			if (segments.length === 1) return { name: ROUTES.MINIAPPS }
			if (segments.length !== 2) return null
			const miniApp = parseMiniAppLink(url)
			return miniApp ? { name: ROUTES.MINIAPP_HOST, params: { slug: miniApp.slug } } : null
		}
		case 'topup': return segments.length === 1 ? { name: ROUTES.TOPUP_SCREEN } : null
		case 'add': return segments.length === 1 ? { name: ROUTES.ADD } : null
		case 'withdraw': return segments.length === 1 ? { name: ROUTES.WITHDRAW } : null
		case 'send': return segments.length === 1 ? { name: ROUTES.SEND } : null
		case 'savings': return segments.length === 1 ? { name: ROUTES.SAVINGS_SCREEN } : null
		case 'home': return segments.length === 1 ? tab(ROUTES.HOME_SCREEN) : null
		case 'crypto': return segments.length === 1 ? tab(ROUTES.CRYPTO_SCREEN) : null
		default:
			return null
	}
}
