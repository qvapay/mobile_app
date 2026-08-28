/**
 * Unit tests for the announcement CTA link resolver — pure module, node
 * environment (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import { resolveAnnouncementTarget } from './announcementLink'

describe('rutas internas que la app sabe pintar', () => {

	test('las pestañas de MainStack se resuelven como tab', () => {
		expect(resolveAnnouncementTarget('/home')).toEqual({ kind: 'tab', screen: 'Home' })
		expect(resolveAnnouncementTarget('/p2p')).toEqual({ kind: 'tab', screen: 'P2P' })
		expect(resolveAnnouncementTarget('/store')).toEqual({ kind: 'tab', screen: 'Store' })
	})

	test('las pantallas del stack raíz llevan sus params', () => {
		expect(resolveAnnouncementTarget('/p2p/abc-123')).toEqual({ kind: 'screen', route: 'P2POffer', params: { p2p_uuid: 'abc-123' } })
		expect(resolveAnnouncementTarget('/pay/inv-9')).toEqual({ kind: 'screen', route: 'Pay', params: { uuid: 'inv-9' } })
		expect(resolveAnnouncementTarget('/topup')).toEqual({ kind: 'screen', route: 'Topup', params: {} })
	})

	test('el patrón de producto (2 segmentos) gana al de tienda (1), igual que en linking.js', () => {
		expect(resolveAnnouncementTarget('/store/mi-tienda')).toEqual({ kind: 'screen', route: 'MarketStore', params: { slug: 'mi-tienda' } })
		expect(resolveAnnouncementTarget('/store/mi-tienda/prod-7')).toEqual({ kind: 'screen', route: 'MarketProduct', params: { slug: 'mi-tienda', uuid: 'prod-7' } })
	})

	test('la query y la barra final no rompen el emparejamiento', () => {
		expect(resolveAnnouncementTarget('/p2p?utm_source=aviso')).toEqual({ kind: 'tab', screen: 'P2P' })
		expect(resolveAnnouncementTarget('/home/')).toEqual({ kind: 'tab', screen: 'Home' })
	})
})

describe('todo lo demás sale al navegador', () => {

	test('una ruta interna que la app no tiene se abre en el dominio canónico (www)', () => {
		expect(resolveAnnouncementTarget('/gift')).toEqual({ kind: 'external', url: 'https://www.qvapay.com/gift' })
	})

	test('una URL absoluta ajena se abre tal cual', () => {
		expect(resolveAnnouncementTarget('https://blog.ejemplo.com/post')).toEqual({ kind: 'external', url: 'https://blog.ejemplo.com/post' })
	})

	test('una URL absoluta a qvapay.com se resuelve DENTRO de la app', () => {
		expect(resolveAnnouncementTarget('https://www.qvapay.com/p2p/abc')).toEqual({ kind: 'screen', route: 'P2POffer', params: { p2p_uuid: 'abc' } })
		expect(resolveAnnouncementTarget('https://qvapay.com/home')).toEqual({ kind: 'tab', screen: 'Home' })
	})

	test('una URL de qvapay.com sin ruta conocida sigue siendo externa', () => {
		expect(resolveAnnouncementTarget('https://www.qvapay.com/blog/algo')).toEqual({ kind: 'external', url: 'https://www.qvapay.com/blog/algo' })
	})
})

describe('entradas que no deben llegar a Linking.openURL', () => {

	test.each([null, undefined, '', '   '])('sin enlace no hay destino (%p)', (value) => {
		expect(resolveAnnouncementTarget(value)).toBeNull()
	})

	test('los esquemas que el panel no permite se descartan', () => {
		// El admin ya valida "/ruta o https://", pero el aviso lo escribe una
		// persona: un esquema inesperado no puede acabar en Linking.openURL
		expect(resolveAnnouncementTarget('javascript:alert(1)')).toBeNull()
		expect(resolveAnnouncementTarget('http://qvapay.com/home')).toBeNull()
		expect(resolveAnnouncementTarget('qvapay://p2p')).toBeNull()
	})
})
