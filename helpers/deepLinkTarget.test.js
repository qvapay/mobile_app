/**
 * resolveDeepLinkTarget: la tabla URL → ruta que sustituye a React Navigation
 * cuando la URL no entra por Linking (deep link diferido, `deeplink` de push).
 * @jest-environment node
 */
import { resolveDeepLinkTarget } from './deepLinkTarget'

const UUID = '796a9e71-3d67-4a42-9dc2-02a5d069fa23'

test('accepts apex, www and the custom scheme', () => {
	expect(resolveDeepLinkTarget(`https://qvapay.com/pay/${UUID}`)).toEqual({ name: 'Pay', params: { uuid: UUID } })
	expect(resolveDeepLinkTarget(`https://www.qvapay.com/pay/${UUID}`)).toEqual({ name: 'Pay', params: { uuid: UUID } })
	expect(resolveDeepLinkTarget(`qvapay://pay/${UUID}`)).toEqual({ name: 'Pay', params: { uuid: UUID } })
})

test('rejects foreign hosts, unknown paths and empty input', () => {
	expect(resolveDeepLinkTarget(`https://evil.com/pay/${UUID}`)).toBeNull()
	expect(resolveDeepLinkTarget('https://www.qvapay.com/nope')).toBeNull()
	expect(resolveDeepLinkTarget('https://www.qvapay.com/pay')).toBeNull()
	expect(resolveDeepLinkTarget('')).toBeNull()
	expect(resolveDeepLinkTarget(null)).toBeNull()
})

test('P2P: offer (with order), promote slot and the tab', () => {
	expect(resolveDeepLinkTarget(`https://www.qvapay.com/p2p/${UUID}`)).toEqual({ name: 'P2POffer', params: { p2p_uuid: UUID } })
	expect(resolveDeepLinkTarget(`https://www.qvapay.com/p2p/${UUID}?order=o-1&utm=x`)).toEqual({ name: 'P2POffer', params: { p2p_uuid: UUID, order: 'o-1' } })
	expect(resolveDeepLinkTarget('https://www.qvapay.com/p2p/promote?coin=BANK_CUP&type=sell')).toEqual({ name: 'P2PPromote', params: { coin: 'BANK_CUP', type: 'sell' } })
	expect(resolveDeepLinkTarget('https://www.qvapay.com/p2p/promote?type=weird')).toEqual({ name: 'P2PPromote', params: {} })
	expect(resolveDeepLinkTarget('qvapay://p2p')).toEqual({ name: 'MainStack', params: { screen: 'P2P' } })
})

test('store, mini-apps and widget shortcuts', () => {
	expect(resolveDeepLinkTarget('https://www.qvapay.com/store/mi-tienda')).toEqual({ name: 'MarketStore', params: { slug: 'mi-tienda' } })
	expect(resolveDeepLinkTarget(`https://www.qvapay.com/store/mi-tienda/${UUID}`)).toEqual({ name: 'MarketProduct', params: { uuid: UUID } })
	expect(resolveDeepLinkTarget('https://www.qvapay.com/apps/mi-app')).toEqual({ name: 'MiniAppHost', params: { slug: 'mi-app' } })
	expect(resolveDeepLinkTarget('https://www.qvapay.com/apps')).toEqual({ name: 'MiniApps' })
	expect(resolveDeepLinkTarget('qvapay://savings')).toEqual({ name: 'Savings' })
	expect(resolveDeepLinkTarget('qvapay://add')).toEqual({ name: 'Add' })
	expect(resolveDeepLinkTarget('qvapay://withdraw')).toEqual({ name: 'Withdraw' })
	expect(resolveDeepLinkTarget('qvapay://send')).toEqual({ name: 'Send' })
	expect(resolveDeepLinkTarget('https://www.qvapay.com/topup')).toEqual({ name: 'Topup' })
	expect(resolveDeepLinkTarget('https://www.qvapay.com/home')).toEqual({ name: 'MainStack', params: { screen: 'Home' } })
	expect(resolveDeepLinkTarget('https://www.qvapay.com/crypto')).toEqual({ name: 'MainStack', params: { screen: 'Crypto' } })
})

test('decodes path segments and survives a broken escape', () => {
	expect(resolveDeepLinkTarget('https://www.qvapay.com/store/mi%20tienda')).toEqual({ name: 'MarketStore', params: { slug: 'mi tienda' } })
	expect(resolveDeepLinkTarget('https://www.qvapay.com/store/%E0%A4%A')).toBeNull()
})
