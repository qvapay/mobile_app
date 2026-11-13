/**
 * nativeLinks: qué URLs pedidas por una mini-app abren una pantalla nativa.
 * @jest-environment node
 */
import { NATIVE_LINK_RE, nativeLinkTarget } from './nativeLinks'

const UUID = '796a9e71-3d67-4a42-9dc2-02a5d069fa23'

describe('nativeLinkTarget', () => {

	test('el perfil P2P por uuid y por @usuario, en www y en el apex', () => {
		expect(nativeLinkTarget(`https://www.qvapay.com/p2p/user/${UUID}`)).toEqual({ name: 'P2PUser', params: { uuid: UUID } })
		expect(nativeLinkTarget(`https://qvapay.com/p2p/user/${UUID}/`)).toEqual({ name: 'P2PUser', params: { uuid: UUID } })
		expect(nativeLinkTarget('https://www.qvapay.com/p2p/u/luke')).toEqual({ name: 'P2PUser', params: { username: 'luke' } })
		expect(nativeLinkTarget('https://www.qvapay.com/p2p/u/%40luke?utm_source=app#top')).toEqual({ name: 'P2PUser', params: { username: 'luke' } })
	})

	test('nada de pantallas de dinero ni del resto de la app', () => {
		for (const url of [
			`https://www.qvapay.com/pay/${UUID}`,
			'https://www.qvapay.com/send',
			'https://www.qvapay.com/withdraw',
			'https://www.qvapay.com/add?coin=ETECSA',
			`https://www.qvapay.com/p2p/${UUID}`,
			'https://www.qvapay.com/p2p',
			'https://www.qvapay.com/apps/otra-app',
			'https://www.qvapay.com/store/tienda',
		]) {
			expect(nativeLinkTarget(url)).toBeNull()
		}
	})

	test('solo https y solo los hosts de qpweb', () => {
		for (const url of [
			'http://www.qvapay.com/p2p/u/luke',
			'qvapay://p2p/u/luke',
			'https://evil.com/p2p/u/luke',
			'https://www.qvapay.com.evil.com/p2p/u/luke',
			'https://evil.com/?r=https://www.qvapay.com/p2p/u/luke',
			'https://sub.qvapay.com/p2p/u/luke',
		]) {
			expect(nativeLinkTarget(url)).toBeNull()
		}
	})

	test('sin forma de uuid o de username, ni un segmento de más, no abre nada', () => {
		expect(nativeLinkTarget('https://www.qvapay.com/p2p/user/nope')).toBeNull()
		expect(nativeLinkTarget('https://www.qvapay.com/p2p/u/a%20b')).toBeNull()
		expect(nativeLinkTarget('https://www.qvapay.com/p2p/u/luke/extra')).toBeNull()
		expect(nativeLinkTarget(null)).toBeNull()
		expect(nativeLinkTarget(`https://www.qvapay.com/p2p/u/${'a'.repeat(3000)}`)).toBeNull()
	})

	test('el filtro del SDK coincide con lo que la app sabe abrir', () => {
		expect(NATIVE_LINK_RE.test('https://www.qvapay.com/p2p/u/luke')).toBe(true)
		expect(NATIVE_LINK_RE.test(`https://qvapay.com/p2p/user/${UUID}?x=1`)).toBe(true)
		expect(NATIVE_LINK_RE.test('https://www.qvapay.com/p2p/u/luke/extra')).toBe(false)
		expect(NATIVE_LINK_RE.test(`https://www.qvapay.com/p2p/${UUID}`)).toBe(false)
		expect(NATIVE_LINK_RE.test('https://www.qvapay.com/raffle')).toBe(false)
	})
})
