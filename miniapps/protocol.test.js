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
	applyMainButtonPatch,
	isMainButtonShown,
	applyHeaderPatch,
	headerBadgeText,
	EMPTY_HEADER,
	HEADER_ICONS,
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

	test('mainButton: recorta el texto y normaliza solo los campos presentes', () => {
		const r = parseBridgeMessage(msg('ui.mainButton.set', { text: '  Pagar ahora ' + 'x'.repeat(100), visible: true }))
		expect(r.ok).toBe(true)
		expect(r.request.params.text.length).toBe(32)
		// Parcial: loading/enabled no venían, así que no se tocan
		expect(r.request.params).toEqual({ text: r.request.params.text, visible: true })
		expect(parseBridgeMessage(msg('ui.mainButton.set', { loading: true })).request.params).toEqual({ loading: true })
		expect(parseBridgeMessage(msg('ui.mainButton.set', {})).request.params).toEqual({})
		// Misma tolerancia de siempre con valores raros
		expect(parseBridgeMessage(msg('ui.mainButton.set', { visible: 'yes', enabled: 0, text: 42 })).request.params)
			.toEqual({ visible: false, enabled: true, text: '' })
		expect(parseBridgeMessage(msg('ui.mainButton.set', { enabled: false })).request.params).toEqual({ enabled: false })
	})

	test('mainButton: el patch se aplica sobre el estado anterior y sin texto no se muestra', () => {
		const hidden = { text: '', visible: false, loading: false, enabled: true }
		const shown = applyMainButtonPatch(hidden, { text: 'Pagar', visible: true })
		expect(isMainButtonShown(shown)).toBe(true)
		const loading = applyMainButtonPatch(shown, { loading: true })
		expect(loading).toEqual({ text: 'Pagar', visible: true, loading: true, enabled: true })
		expect(isMainButtonShown(loading)).toBe(true)
		// visible antes que el texto: se muestra cuando llega el texto
		const visibleFirst = applyMainButtonPatch(hidden, { visible: true })
		expect(isMainButtonShown(visibleFirst)).toBe(false)
		expect(isMainButtonShown(applyMainButtonPatch(visibleFirst, { text: 'Continuar' }))).toBe(true)
		expect(isMainButtonShown(applyMainButtonPatch(shown, { text: '   '.trim() }))).toBe(false)
		expect(isMainButtonShown(applyMainButtonPatch(shown, { visible: false }))).toBe(false)
	})

	test('header: subtítulo de una línea, recortado; null o vacío lo borran', () => {
		const r = parseBridgeMessage(msg('ui.header.set', { subtitle: '  Carrito\n·\t3 productos\u0000 ' + 'x'.repeat(100) }))
		expect(r.ok).toBe(true)
		expect(r.request.params.subtitle.startsWith('Carrito · 3 productos x')).toBe(true)
		expect(r.request.params.subtitle.length).toBe(48)
		expect(r.request.params).not.toHaveProperty('actions')
		expect(parseBridgeMessage(msg('ui.header.set', { subtitle: null })).request.params).toEqual({ subtitle: '' })
		expect(parseBridgeMessage(msg('ui.header.set', {})).request.params).toEqual({})
		expect(parseBridgeMessage(msg('ui.header.set', { subtitle: 42 })).error.code).toBe('INVALID_PARAMS')
	})

	test('colors: hex opaco normalizado, null vuelve al tema, parcial', () => {
		expect(parseBridgeMessage(msg('ui.colors.set', { header: '#0A84FF', background: '#fff' })).request.params).toEqual({ header: '#0a84ff', background: '#ffffff' })
		expect(parseBridgeMessage(msg('ui.colors.set', { header: null })).request.params).toEqual({ header: null })
		expect(parseBridgeMessage(msg('ui.colors.set', { background: '#000', other: '#fff' })).request.params).toEqual({ background: '#000000' })
		expect(parseBridgeMessage(msg('ui.colors.set', {})).request.params).toEqual({})
		for (const bad of ['#ffffff80', 'rgb(0,0,0)', 'red', '', 42, true]) {
			const r = parseBridgeMessage(msg('ui.colors.set', { header: bad }))
			expect(r.ok).toBe(false)
			expect(r.error.code).toBe('INVALID_PARAMS')
			expect(r.error.message).toMatch(/header must be a #RRGGBB color or null/)
		}
		expect(parseBridgeMessage(msg('ui.colors.set', { background: 'transparent' })).error.message).toMatch(/^background must be/)
	})

	test('header: acciones del catálogo, con etiqueta, máximo 2 e ids únicos', () => {
		const ok = parseBridgeMessage(msg('ui.header.set', { actions: [
			{ id: 'cart', icon: 'cart', label: ' Carrito ', badge: 3.7 },
			{ id: 'search', icon: 'search', label: 'Buscar' },
		] }))
		expect(ok.request.params.actions).toEqual([
			{ id: 'cart', icon: 'cart', label: 'Carrito', badge: 3 },
			{ id: 'search', icon: 'search', label: 'Buscar', badge: 0 },
		])
		expect(parseBridgeMessage(msg('ui.header.set', { actions: null })).request.params).toEqual({ actions: [] })
		expect(parseBridgeMessage(msg('ui.header.set', { actions: [] })).request.params).toEqual({ actions: [] })

		const bad = (actions) => parseBridgeMessage(msg('ui.header.set', { actions })).error
		expect(bad('cart').code).toBe('INVALID_PARAMS')
		expect(bad([{ id: 'a', icon: 'cart', label: 'A' }, { id: 'b', icon: 'cart', label: 'B' }, { id: 'c', icon: 'cart', label: 'C' }]).message).toMatch(/at most 2/)
		expect(bad([{ id: 'a', icon: 'rocket', label: 'A' }]).message).toMatch(/icon must be one of/)
		expect(bad([{ id: 'a', icon: 'cart' }]).message).toMatch(/label is required/)
		expect(bad([{ id: 'a b', icon: 'cart', label: 'A' }]).message).toMatch(/action id/)
		expect(bad([{ id: 'a', icon: 'cart', label: 'A' }, { id: 'a', icon: 'bell', label: 'B' }]).message).toMatch(/unique/)
		expect(bad([{ id: 'a', icon: 'cart', label: 'A', badge: -1 }]).message).toMatch(/badge/)
		expect(bad([{ id: 'a', icon: 'cart', label: 'A', badge: '3' }]).message).toMatch(/badge/)
	})

	test('header: patch parcial y texto del badge', () => {
		const withSub = applyHeaderPatch(EMPTY_HEADER, { subtitle: 'Hola' })
		const both = applyHeaderPatch(withSub, { actions: [{ id: 'a', icon: 'cart', label: 'A', badge: 0 }] })
		expect(both).toEqual({ subtitle: 'Hola', actions: [{ id: 'a', icon: 'cart', label: 'A', badge: 0 }] })
		expect(applyHeaderPatch(both, { subtitle: '' }).actions).toHaveLength(1)
		expect(headerBadgeText(0)).toBeNull()
		expect(headerBadgeText(7)).toBe('7')
		expect(headerBadgeText(99)).toBe('99')
		expect(headerBadgeText(100)).toBe('99+')
		expect(HEADER_ICONS).toHaveLength(21)
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

	test('share: texto opcional, colapsado y recortado; sin enlaces', () => {
		expect(parseBridgeMessage(msg('share', {}))).toMatchObject({ ok: true, request: { method: 'share', params: {} } })
		expect(parseBridgeMessage(msg('share', { text: '  Mira   esto\n ya ' }))).toMatchObject({ ok: true, request: { params: { text: 'Mira esto ya' } } })
		const long = parseBridgeMessage(msg('share', { text: 'x'.repeat(500) }))
		expect(long.ok && long.request.params.text.length).toBe(200)
		for (const text of ['https://evil.com', 've a www.evil.com', 'HTTP://x.y']) {
			expect(parseBridgeMessage(msg('share', { text }))).toMatchObject({ ok: false, error: { code: 'INVALID_PARAMS' } })
		}
		expect(parseBridgeMessage(msg('share', { text: 42 }))).toMatchObject({ ok: false, error: { code: 'INVALID_PARAMS' } })
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
		window.QvaPay.share({ text: 'hola' })
		window.QvaPay.share()
		window.QvaPay.ui.header.set({ subtitle: 'Carrito', actions: [{ id: 'cart', icon: 'cart', label: 'Carrito', badge: 2 }] })
		window.QvaPay.ui.header.set()
		expect(posted.at(-2)).toMatchObject({ method: 'ui.header.set', params: { subtitle: 'Carrito' } })
		window.QvaPay.ui.colors.set({ header: '#0A84FF', background: null })
		window.QvaPay.ui.colors.set()
		expect(posted.at(-2)).toMatchObject({ method: 'ui.colors.set', params: { header: '#0A84FF', background: null } })
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

	test('headerAction llega a sus listeners con el id de la acción', () => {
		const { window, deliver } = boot()
		const seen = []
		window.QvaPay.on('headerAction', (d) => seen.push(d))
		deliver(bridgeEvent('headerAction', { id: 'cart' }))
		expect(seen).toEqual([{ id: 'cart' }])
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

	test('un clic en un enlace al perfil de QvaPay se convierte en openLink y frena la navegación', () => {
		const posted = []
		const listeners = []
		const window = {
			ReactNativeWebView: { postMessage: (m) => posted.push(JSON.parse(m)) },
			dispatchEvent: () => {},
			addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
		}
		const ctx = vm.createContext({ window, Promise, JSON, Date, Object, String, setTimeout, Event: class {} })
		vm.runInContext(buildSdkScript({ mode: 'dark' }, { slug: 'hello', language: 'es' }), ctx)
		const click = listeners.find(l => l.type === 'click')
		// En captura: antes que React, para que un <Link> de Next vea el preventDefault
		expect(click.capture).toBe(true)
		const fire = (target, extra = {}) => {
			const e = { target, button: 0, defaultPrevented: false, preventDefault() { e.defaultPrevented = true }, ...extra }
			click.fn(e)
			return e
		}
		const anchor = (href) => ({ nodeName: 'A', href, parentNode: null })
		const profile = anchor('https://www.qvapay.com/p2p/u/luke')

		// El toque cae en un hijo del enlace (el «@luke» dentro de un <span>)
		expect(fire({ nodeName: 'SPAN', parentNode: profile }).defaultPrevented).toBe(true)
		expect(posted.at(-1)).toMatchObject({ method: 'openLink', params: { url: 'https://www.qvapay.com/p2p/u/luke' } })
		expect(parseBridgeMessage(JSON.stringify(posted.at(-1))).ok).toBe(true)

		const sent = posted.length
		// El resto de enlaces, también los de qvapay.com, siguen su camino
		expect(fire(anchor('https://www.qvapay.com/raffle')).defaultPrevented).toBe(false)
		expect(fire(anchor(`https://www.qvapay.com/pay/${UUID}`)).defaultPrevented).toBe(false)
		// Con modificadores, otro botón o ya prevenido por la mini-app, no se toca
		expect(fire(profile, { metaKey: true }).defaultPrevented).toBe(false)
		expect(fire(profile, { button: 1 }).defaultPrevented).toBe(false)
		expect(fire(profile, { defaultPrevented: true }).defaultPrevented).toBe(true)
		expect(fire({ nodeName: 'DIV', parentNode: null }).defaultPrevented).toBe(false)
		expect(posted).toHaveLength(sent)
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
