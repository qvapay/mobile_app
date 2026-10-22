/**
 * Pantallas que un deep link monta como ruta raíz — módulo puro, entorno node.
 * @jest-environment node
 */
import { DEEP_LINK_ROUTES, isDeepLinkRoute } from './deepLinkRoutes'

describe('deepLinkRoutes', () => {
	test.each(['MiniAppHost', 'MiniApps', 'Pay', 'P2POffer', 'P2PPromote', 'MarketStore', 'MarketProduct', 'Topup'])('%s es destino de deep link', (name) => {
		expect(isDeepLinkRoute(name)).toBe(true)
	})

	test.each(['MainStack', 'Welcome', 'WalletOnly', 'Login', undefined])('%s no lo es', (name) => {
		expect(isDeepLinkRoute(name)).toBe(false)
	})

	test('MainStack nunca entra en la lista (ya es la raíz)', () => {
		expect(DEEP_LINK_ROUTES.has('MainStack')).toBe(false)
	})
})
