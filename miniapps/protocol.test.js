/**
 * Protocolo del bridge de mini-apps + SDK inyectado.
 * @jest-environment node
 */
import vm from 'vm'
import {
	parseBridgeMessage,
	isAllowedOrigin,
	normalizeOrigin,
	bridgeResponse,
	bridgeErrorResponse,
	bridgeEvent,
	TOAST_MAX_LENGTH,
	MAX_MESSAGE_LENGTH,
} from './protocol'
import { buildSdkScript, buildDeliveryScript } from './sdkScript'

const msg = (method, params, extra = {}) => JSON.stringify({ v: 1, id: 'q1_abc', method, params, ...extra })
const UUID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

describe('parseBridgeMessage', () => {

	test('rechaza basura sin lanzar', () => {
		for (const raw of [undefined, null, 42, '', 'not json', '[]', '"str"', JSON.stringify({ v: 1 })]) {
			const r = parseBridgeMessage(raw)
			expect(r.ok).toBe(false)
		}
	})

	test('rechaza mensajes gigantes', () => {
		const r = parseBridgeMessage('x'.repeat(MAX_MESSAGE_LENGTH + 1))
		expect(r).toMatchObject({ ok: false, error: { code: 'INVALID_PARAMS' } })
	})

	test('ids con caracteres raros no se aceptan', () => {
		const r = parseBridgeMessage(JSON.stringify({ v: 1, id: '<script>', method: 'ready' }))
		expect(r).toMatchObject({ ok: false, id: null })
	})

	test('versión distinta → INVALID_PARAMS con id para rechazar la promesa', () => {
		const r = parseBridgeMessage(msg('ready', {}, { v: 2 }))
		expect(r).toMatchObject({ ok: false, id: 'q1_abc', error: { code: 'INVALID_PARAMS' } })
	})

	test('método fuera de la lista blanca → UNKNOWN_METHOD', () => {
		for (const method of ['getToken', 'auth.getBearer', '__proto__', 'eval', 42]) {
			const r = parseBridgeMessage(msg(method, {}))
			expect(r).toMatchObject({ ok: false, id: 'q1_abc', error: { code: 'UNKNOWN_METHOD' } })
		}
	})

	test('métodos sin params', () => {
		for (const method of ['ready', 'close', 'getTheme']) {
			expect(parseBridgeMessage(msg(method))).toEqual({ ok: true, request: { id: 'q1_abc', method } })
		}
	})

	test('requestLogin: scopes subset, deduplicados y ordenados', () => {
		expect(parseBridgeMessage(msg('auth.requestLogin', { scopes: ['kyc', 'profile', 'kyc'] }))).toMatchObject({
			ok: true, request: { params: { scopes: ['kyc', 'profile'] } },
		})
		expect(parseBridgeMessage(msg('auth.requestLogin', { scopes: [] })).ok).toBe(false)
		expect(parseBridgeMessage(msg('auth.requestLogin', { scopes: ['email'] })).ok).toBe(false)
		expect(parseBridgeMessage(msg('auth.requestLogin', { scopes: 'profile' })).ok).toBe(false)
	})

	test('payInvoice exige UUID y lo normaliza a minúsculas', () => {
		expect(parseBridgeMessage(msg('payments.payInvoice', { invoiceUuid: UUID.toUpperCase() }))).toMatchObject({
			ok: true, request: { params: { invoiceUuid: UUID } },
		})
		expect(parseBridgeMessage(msg('payments.payInvoice', { invoiceUuid: '../../user' })).ok).toBe(false)
		expect(parseBridgeMessage(msg('payments.payInvoice', {})).ok).toBe(false)
	})

	test('mainButton: recorta el texto y sin texto no es visible', () => {
		const r = parseBridgeMessage(msg('ui.mainButton.set', { text: '  Pagar ahora ' + 'x'.repeat(100), visible: true }))
		expect(r.ok).toBe(true)
		expect(r.request.params.text.length).toBe(32)
		expect(r.request.params).toMatchObject({ visible: true, loading: false, enabled: true })
		const empty = parseBridgeMessage(msg('ui.mainButton.set', { text: '   ', visible: true }))
		expect(empty.request.params.visible).toBe(false)
	})

	test('toast: obligatorio, tipo conocido y longitud acotada', () => {
		const long = parseBridgeMessage(msg('ui.toast', { message: 'a'.repeat(500) }))
		expect(long.request.params.message.length).toBe(TOAST_MAX_LENGTH)
		expect(long.request.params.type).toBe('info')
		expect(parseBridgeMessage(msg('ui.toast', { message: '' })).ok).toBe(false)
		expect(parseBridgeMessage(msg('ui.toast', { message: 'hola', type: 'html' })).ok).toBe(false)
	})

	test('haptic: tipos conocidos', () => {
		expect(parseBridgeMessage(msg('ui.haptic', {})).request.params.type).toBe('light')
		expect(parseBridgeMessage(msg('ui.haptic', { type: 'success' })).ok).toBe(true)
		expect(parseBridgeMessage(msg('ui.haptic', { type: 'boom' })).ok).toBe(false)
	})

	test('openLink: solo https', () => {
		expect(parseBridgeMessage(msg('openLink', { url: 'https://example.com/x' })).ok).toBe(true)
		for (const url of ['http://example.com', 'javascript:alert(1)', 'qvapay://pay/x', 'file:///etc/passwd', 'tel:123']) {
			expect(parseBridgeMessage(msg('openLink', { url })).ok).toBe(false)
		}
	})
})

describe('isAllowedOrigin', () => {

	const allowed = ['https://shop.example.com', 'https://pay.example.com:8443']

	test('mismo origen con cualquier path pasa', () => {
		expect(isAllowedOrigin('https://shop.example.com/a/b?c=1#d', allowed)).toBe(true)
		expect(isAllowedOrigin('https://pay.example.com:8443/', allowed)).toBe(true)
	})

	test('http, subdominios, otros puertos y lookalikes NO pasan', () => {
		for (const url of [
			'http://shop.example.com/',
			'https://evil.shop.example.com/',
			'https://example.com/',
			'https://shop.example.com.evil.com/',
			'https://shop.example.com:444/',
			'https://pay.example.com/',
			'https://user:pw@shop.example.com/',
			'about:blank',
			'javascript:alert(1)',
			'',
			null,
		]) {
			expect(isAllowedOrigin(url, allowed)).toBe(false)
		}
	})

	test('orígenes declarados que no son https se ignoran', () => {
		expect(isAllowedOrigin('http://x.com/', ['http://x.com'])).toBe(false)
		expect(normalizeOrigin('https://X.com/path')).toBe('https://x.com')
	})
})

describe('SDK inyectado', () => {

	/** Evalúa el SDK en un sandbox con un `ReactNativeWebView` falso. */
	const boot = () => {
		const posted = []
		const window = {
			ReactNativeWebView: { postMessage: (m) => posted.push(JSON.parse(m)) },
			dispatchEvent: () => {},
		}
		const ctx = vm.createContext({ window, Promise, JSON, Date, Object, String, setTimeout, Event: class {} })
		vm.runInContext(buildSdkScript({ mode: 'dark' }, { slug: 'hello', language: 'es' }), ctx)
		const deliver = (payload) => vm.runInContext(buildDeliveryScript(payload), ctx)
		return { window, posted, deliver }
	}

	test('cada petición sale con la forma que el parser acepta', () => {
		const { window, posted } = boot()
		window.QvaPay.payments.payInvoice(UUID)
		window.QvaPay.auth.requestLogin({ scopes: ['profile'] })
		window.QvaPay.ui.toast('hola')
		for (const m of posted) {
			expect(parseBridgeMessage(JSON.stringify(m)).ok).toBe(true)
		}
	})

	test('la respuesta resuelve la promesa por id; el error la rechaza', async () => {
		const { window, posted, deliver } = boot()
		const ok = window.QvaPay.getTheme()
		const ko = window.QvaPay.payments.payInvoice(UUID)
		deliver(bridgeResponse(posted[0].id, { mode: 'light' }))
		deliver(bridgeErrorResponse(posted[1].id, { code: 'USER_CANCELLED', message: 'x' }))
		await expect(ok).resolves.toEqual({ mode: 'light' })
		await expect(ko).rejects.toEqual({ code: 'USER_CANCELLED', message: 'x' })
	})

	test('eventos llegan a los listeners y themeChanged actualiza theme', () => {
		const { window, deliver } = boot()
		const seen = []
		const cb = (d) => seen.push(d)
		window.QvaPay.on('themeChanged', cb)
		deliver(bridgeEvent('themeChanged', { mode: 'light' }))
		expect(seen).toEqual([{ mode: 'light' }])
		expect(window.QvaPay.theme).toEqual({ mode: 'light' })
		window.QvaPay.off('themeChanged', cb)
		deliver(bridgeEvent('themeChanged', { mode: 'dark' }))
		expect(seen).toHaveLength(1)
	})

	test('un payload con comillas y </script> no rompe la entrega', async () => {
		const { window, posted, deliver } = boot()
		const p = window.QvaPay.getTheme()
		const nasty = `"); alert(1); ("</script> `
		deliver(bridgeResponse(posted[0].id, { s: nasty }))
		await expect(p).resolves.toEqual({ s: nasty })
	})

	test('la mini-app no puede reemplazar el SDK ni el receptor', () => {
		const { window } = boot()
		const original = window.QvaPay
		window.QvaPay = { fake: true }
		window.__qvapayReceive = () => {}
		expect(window.QvaPay).toBe(original)
		expect(Object.isFrozen(window.QvaPay)).toBe(true)
	})
})
