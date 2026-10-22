/**
 * useMiniAppBridge — gate KYC: identidad y pago se cortan ANTES de abrir la hoja
 * nativa o de firmar cuando el usuario no está verificado (qpweb responde
 * 403 KYC_REQUIRED a esas rutas).
 * @jest-environment node
 */
jest.mock('../../api/miniappsApi', () => ({ miniappsApi: { authorize: jest.fn() } }))
jest.mock('react-native-haptic-feedback', () => ({ __esModule: true, default: { trigger: jest.fn() } }))
jest.mock('sonner-native', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))

import { act, create } from 'react-test-renderer'
import { miniappsApi } from '../../api/miniappsApi'
import { useMiniAppBridge } from './useMiniAppBridge'

const ORIGIN = 'https://shop.example.com'
const UUID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const THEME = { mode: 'dark', colors: { bg: '#000', surface: '#111', text: '#fff', primary: '#6759EF' } }

const baseApp = (overrides = {}) => ({
	uuid: 'a1', slug: 'shop', name: 'Shop', tagline: null, icon: null,
	entry_url: `${ORIGIN}/`, allowed_origins: [ORIGIN], category: 'shopping', featured: false,
	scopes: ['profile'], app_uuid: 'merchant-1', merchant: { name: 'Shop', logo: null },
	granted: false, granted_scopes: [], ...overrides,
})

let seq = 0
const message = (method, params) => ({ nativeEvent: { url: `${ORIGIN}/checkout`, data: JSON.stringify({ v: 1, id: `q${++seq}_t`, method, params }) } })

// Lo que el puente entrega al WebView, ya parseado ({ id, ok, result | error })
const deliveriesOf = (injectJavaScript) => injectJavaScript.mock.calls.map(([script]) => JSON.parse(JSON.parse(script.match(/\((".*")\); true;$/)[1])))

const renderBridge = async ({ hasKyc, app = baseApp(), share = jest.fn(async () => 'shared') }) => {
	const kyc = { value: hasKyc }
	const requireKyc = jest.fn(() => kyc.value)
	const injectJavaScript = jest.fn()
	const webViewRef = { current: { injectJavaScript } }
	const state = {}
	const Harness = () => {
		Object.assign(state, useMiniAppBridge({ app, webViewRef, theme: THEME, onReady: () => {}, onClose: () => {}, requireKyc, share }))
		return null
	}
	let tree
	await act(async () => { tree = create(<Harness />) })
	const send = async (method, params) => { await act(async () => { state.onMessage(message(method, params)) }) }
	const unmount = async () => { await act(async () => { tree.unmount() }) }
	return { state, send, requireKyc, kyc, share, deliveries: () => deliveriesOf(injectJavaScript), unmount }
}

describe('useMiniAppBridge — gate KYC', () => {

	afterEach(() => { jest.clearAllMocks() })

	test('sin KYC, requestLogin se rechaza sin abrir la hoja de consentimiento', async () => {
		const bridge = await renderBridge({ hasKyc: false })
		await bridge.send('auth.requestLogin', { scopes: ['profile'] })
		expect(bridge.requireKyc).toHaveBeenCalledTimes(1)
		expect(bridge.state.modal).toBeNull()
		expect(bridge.deliveries()).toEqual([expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'NOT_ALLOWED' }) })])
		await bridge.unmount()
	})

	test('sin KYC, una mini-app YA autorizada tampoco firma (no llama a authorize)', async () => {
		const bridge = await renderBridge({ hasKyc: false, app: baseApp({ granted: true, granted_scopes: ['profile'] }) })
		await bridge.send('auth.requestLogin', { scopes: ['profile'] })
		expect(miniappsApi.authorize).not.toHaveBeenCalled()
		expect(bridge.deliveries()[0]).toMatchObject({ ok: false, error: { code: 'NOT_ALLOWED' } })
		await bridge.unmount()
	})

	test('sin KYC, payInvoice se rechaza sin abrir la hoja de pago (no se pide PIN)', async () => {
		const bridge = await renderBridge({ hasKyc: false })
		await bridge.send('payments.payInvoice', { invoiceUuid: UUID })
		expect(bridge.state.modal).toBeNull()
		expect(bridge.deliveries()[0]).toMatchObject({ ok: false, error: { code: 'NOT_ALLOWED' } })
		await bridge.unmount()
	})

	test('los métodos que no son de identidad ni pago no pasan por el gate', async () => {
		const bridge = await renderBridge({ hasKyc: false })
		await bridge.send('getTheme', {})
		expect(bridge.requireKyc).not.toHaveBeenCalled()
		expect(bridge.deliveries()[0]).toMatchObject({ ok: true, result: THEME })
		await bridge.unmount()
	})

	test('con KYC, payInvoice abre la hoja de pago', async () => {
		const bridge = await renderBridge({ hasKyc: true })
		await bridge.send('payments.payInvoice', { invoiceUuid: UUID })
		expect(bridge.state.modal).toMatchObject({ kind: 'pay', invoiceUuid: UUID })
		expect(bridge.deliveries()).toEqual([])
		await bridge.unmount()
	})

	test('con KYC y consentimiento previo, requestLogin firma directo', async () => {
		miniappsApi.authorize.mockResolvedValue({ success: true, data: { init_data: 'x', hash: 'h', scopes: ['profile'] } })
		const bridge = await renderBridge({ hasKyc: true, app: baseApp({ granted: true, granted_scopes: ['profile'] }) })
		await bridge.send('auth.requestLogin', { scopes: ['profile'] })
		expect(miniappsApi.authorize).toHaveBeenCalledWith('shop', ['profile'])
		expect(bridge.deliveries()[0]).toMatchObject({ ok: true, result: { hash: 'h' } })
		await bridge.unmount()
	})

	test('un rechazo por KYC no deja el puente ocupado: tras verificarse, el siguiente pago abre la hoja', async () => {
		const bridge = await renderBridge({ hasKyc: false })
		await bridge.send('payments.payInvoice', { invoiceUuid: UUID })
		bridge.kyc.value = true
		await bridge.send('payments.payInvoice', { invoiceUuid: UUID })
		expect(bridge.state.modal).toMatchObject({ kind: 'pay' })
		expect(bridge.deliveries().map(d => d.error?.code)).toEqual(['NOT_ALLOWED'])
		await bridge.unmount()
	})
})

describe('useMiniAppBridge — share', () => {

	afterEach(() => { jest.clearAllMocks() })

	// Resolver la promesa de `share` y dejar que el bridge responda
	const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

	test('abre la hoja nativa con el texto de la mini-app y resuelve null al compartir', async () => {
		const bridge = await renderBridge({ hasKyc: false })
		await bridge.send('share', { text: 'Mira esto' })
		await flush()
		expect(bridge.share).toHaveBeenCalledWith('Mira esto')
		expect(bridge.requireKyc).not.toHaveBeenCalled()
		expect(bridge.deliveries()).toEqual([expect.objectContaining({ ok: true, result: null })])
		await bridge.unmount()
	})

	test('sin texto llama a share sin argumento', async () => {
		const bridge = await renderBridge({ hasKyc: false })
		await bridge.send('share', {})
		await flush()
		expect(bridge.share).toHaveBeenCalledWith(undefined)
		await bridge.unmount()
	})

	test('si el usuario descarta la hoja (iOS) rechaza con USER_CANCELLED', async () => {
		const bridge = await renderBridge({ hasKyc: false, share: jest.fn(async () => 'dismissed') })
		await bridge.send('share', {})
		await flush()
		expect(bridge.deliveries()[0]).toMatchObject({ ok: false, error: { code: 'USER_CANCELLED' } })
		await bridge.unmount()
	})

	test('si la hoja falla rechaza con FAILED y libera el puente', async () => {
		const share = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('shared')
		const bridge = await renderBridge({ hasKyc: false, share })
		await bridge.send('share', {})
		await flush()
		await bridge.send('share', {})
		await flush()
		expect(bridge.deliveries().map(d => d.ok ? 'ok' : d.error.code)).toEqual(['FAILED', 'ok'])
		await bridge.unmount()
	})

	test('un segundo share con el primero en vuelo → BUSY', async () => {
		let release
		const share = jest.fn(() => new Promise(resolve => { release = resolve }))
		const bridge = await renderBridge({ hasKyc: false, share })
		await bridge.send('share', {})
		await bridge.send('share', {})
		expect(bridge.deliveries()).toEqual([expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'BUSY' }) })])
		await act(async () => { release('shared') })
		await flush()
		expect(bridge.deliveries()).toHaveLength(2)
		expect(bridge.deliveries()[1]).toMatchObject({ ok: true })
		await bridge.unmount()
	})

	test('con una hoja nativa (pago) abierta, share → BUSY', async () => {
		const bridge = await renderBridge({ hasKyc: true })
		await bridge.send('payments.payInvoice', { invoiceUuid: UUID })
		await bridge.send('share', {})
		expect(bridge.share).not.toHaveBeenCalled()
		expect(bridge.deliveries()[0]).toMatchObject({ ok: false, error: { code: 'BUSY' } })
		await bridge.unmount()
	})

	// iOS no presenta dos hojas a la vez: la de pago no saldría y el puente quedaría ocupado
	test.each([
		['payments.payInvoice', { invoiceUuid: UUID }],
		['auth.requestLogin', { scopes: ['profile'] }],
	])('con la hoja de compartir abierta, %s → BUSY sin abrir hoja ni pedir KYC', async (method, params) => {
		let release
		const share = jest.fn(() => new Promise(resolve => { release = resolve }))
		const bridge = await renderBridge({ hasKyc: true, share })
		await bridge.send('share', {})
		await bridge.send(method, params)
		expect(bridge.state.modal).toBeNull()
		expect(bridge.requireKyc).not.toHaveBeenCalled()
		expect(bridge.deliveries()).toEqual([expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'BUSY' }) })])
		// Cerrada la hoja de compartir, el pago entra
		await act(async () => { release('shared') })
		await flush()
		await bridge.send('payments.payInvoice', { invoiceUuid: UUID })
		expect(bridge.state.modal).toMatchObject({ kind: 'pay' })
		await bridge.unmount()
	})

	// El login con consentimiento previo firma sin hoja, pero también ocupa el puente
	test('con un login firmando sin hoja, share → BUSY', async () => {
		let release
		miniappsApi.authorize.mockImplementation(() => new Promise(resolve => { release = resolve }))
		const bridge = await renderBridge({ hasKyc: true, app: baseApp({ granted: true, granted_scopes: ['profile'] }) })
		await bridge.send('auth.requestLogin', { scopes: ['profile'] })
		await bridge.send('share', {})
		expect(bridge.share).not.toHaveBeenCalled()
		expect(bridge.deliveries()[0]).toMatchObject({ ok: false, error: { code: 'BUSY' } })
		await act(async () => { release({ success: true, data: { init_data: 'x', hash: 'h', scopes: ['profile'] } }) })
		await flush()
		await bridge.unmount()
	})

	test('un texto con enlace no llega a la hoja (INVALID_PARAMS)', async () => {
		const bridge = await renderBridge({ hasKyc: false })
		await bridge.send('share', { text: 'entra en https://evil.com' })
		expect(bridge.share).not.toHaveBeenCalled()
		expect(bridge.deliveries()[0]).toMatchObject({ ok: false, error: { code: 'INVALID_PARAMS' } })
		await bridge.unmount()
	})
})
