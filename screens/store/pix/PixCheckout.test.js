/**
 * Pantalla del QR: el seguimiento, volver del banco, un cobro recién reservado sin QR, el aviso
 * legal, y lo que pasa con el carrito y la navegación cuando el pago entra.
 * @jest-environment node
 */
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../../ui/particles/QPFitText', () => 'QPFitText')
jest.mock('../../../ui/particles/QPLoader', () => 'QPLoader')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('lottie-react-native', () => 'LottieView')
jest.mock('react-native-qrcode-styled', () => 'QRCodeStyled')
jest.mock('@react-navigation/native', () => ({ CommonActions: { reset: (payload) => ({ type: 'RESET', payload }) } }))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), info: jest.fn() } }))
jest.mock('../../../api/pixApi', () => ({ pixApi: { getCheckout: jest.fn(), cancelCheckout: jest.fn() } }))
jest.mock('../../../hooks/useMaxBrightness', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('../../../hooks/useContentPadding', () => ({ __esModule: true, default: () => ({ paddingBottom: 0 }) }))
jest.mock('../../../helpers', () => ({ copyTextToClipboard: jest.fn() }))
jest.mock('../market/marketCartStore', () => ({ remove: jest.fn(), hydrate: jest.fn(async () => {}) }))
jest.mock('../storeQueries', () => ({ MY_PURCHASES_KEY: ['store', 'my-purchases'] }))
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = require('../../../theme/themeTokens')
	const theme = createTheme(true)
	return { useTheme: () => ({ theme }) }
})

import React from 'react'
import { AppState } from 'react-native'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner-native'
import { pixApi } from '../../../api/pixApi'
import { copyTextToClipboard } from '../../../helpers'
import { remove as removeCartLine } from '../market/marketCartStore'
import { rememberCartLines } from './pixCartLines'
import useMaxBrightness from '../../../hooks/useMaxBrightness'
import PixCheckout from './PixCheckout'

const NOW = Date.parse('2026-11-06T15:00:00.000Z')
const CHARGE = {
	uuid: 'c1',
	surface: 'topup',
	stage: 'awaiting_payment',
	description: 'Recarga Vivo',
	total_usd: 10.4,
	total_brl: 57.78,
	refunded_brl: 0,
	expires_at: '2026-11-06T15:30:00.000Z',
	paid_at: null,
	clearing_until: null,
	qr: { data: '00020126CODE', expires_at: 1793979245 },
}
const stageOf = (stage, over = {}) => ({ success: true, data: { ...CHARGE, stage, qr: null, ...over } })

describe('PixCheckout', () => {
	let client
	let tree
	let navigation

	const render = async (params = {}) => {
		client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		jest.spyOn(client, 'invalidateQueries')
		navigation = { dispatch: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() }
		await act(async () => {
			tree = create(<QueryClientProvider client={client}><PixCheckout navigation={navigation} route={{ params: { charge: CHARGE, ...params } }} /></QueryClientProvider>)
		})
		await act(async () => { await jest.advanceTimersByTimeAsync(10) })
	}

	const advance = (ms) => act(async () => { await jest.advanceTimersByTimeAsync(ms) })
	const byTestId = (id) => tree.root.findAll(node => node.props.testID === id && typeof node.type === 'string')
	const textOf = (id) => JSON.stringify(byTestId(id).map(node => node.props.children))

	/** Lo que quedaría de la pila al salir. */
	const stackAfterLeaving = (routes) => {
		const action = navigation.dispatch.mock.calls.at(-1)[0]({ routes, index: routes.length - 1 })
		return action.payload.routes.map(route => route.name)
	}

	beforeEach(() => {
		jest.clearAllMocks()
		jest.useFakeTimers({ now: NOW })
		pixApi.getCheckout.mockResolvedValue({ success: true, data: CHARGE })
	})

	afterEach(async () => {
		await act(async () => { tree.unmount() })
		client.clear()
		jest.useRealTimers()
	})

	test('enseña el QR, el precio en reales, la cuenta atrás y el aviso legal literal', async () => {
		await render()
		expect(tree.root.findByType('QRCodeStyled').props.data).toBe('00020126CODE')
		expect(tree.root.findByType('QPFitText').props.children).toBe('R$ 57,78')
		expect(textOf('pix-countdown')).toContain('Caduca en 30:00')
		expect(JSON.stringify(tree.toJSON())).toContain('Esta é uma compra internacional e não inclui a tarifa de 3.5% de IOF.')
		expect(useMaxBrightness).toHaveBeenLastCalledWith(true)
	})

	test('copia el código Pix', async () => {
		await render()
		act(() => { tree.root.findAllByType('QPButton')[0].props.onPress() })
		expect(copyTextToClipboard).toHaveBeenCalledWith('00020126CODE')
	})

	test('un cobro recién reservado llega sin QR: espera, no lo da por caducado', async () => {
		pixApi.getCheckout.mockResolvedValue({ success: true, data: { ...CHARGE, qr: null, expires_at: null } })
		await render({ charge: { ...CHARGE, qr: null, expires_at: null } })
		expect(tree.root.findAllByType('QPLoader')).toHaveLength(1)
		expect(byTestId('pix-countdown')).toHaveLength(0)
		expect(tree.root.findAllByType('QPButton')[0].props.disabled).toBe(true)

		pixApi.getCheckout.mockResolvedValue({ success: true, data: CHARGE })
		await advance(4000)
		expect(tree.root.findByType('QRCodeStyled').props.data).toBe('00020126CODE')
	})

	test('al caducar apaga el botón pero sigue mirando: el pago aún puede entrar', async () => {
		await render({ charge: { ...CHARGE, expires_at: '2026-11-06T15:00:03.000Z' } })
		pixApi.getCheckout.mockResolvedValue({ success: true, data: { ...CHARGE, expires_at: '2026-11-06T15:00:03.000Z' } })
		await advance(4000)
		expect(textOf('pix-countdown')).toContain('Este código ha caducado')
		expect(tree.root.findAllByType('QPButton')[0].props.disabled).toBe(true)

		pixApi.getCheckout.mockResolvedValue(stageOf('delivered', { expires_at: '2026-11-06T15:00:03.000Z' }))
		await advance(4000)
		expect(textOf('pix-finished-title')).toContain('¡Pago recibido!')
	})

	test('consulta cada 4 s y, ya en verifying, unos 30 s más', async () => {
		await render()
		pixApi.getCheckout.mockClear()
		await advance(8000)
		expect(pixApi.getCheckout).toHaveBeenCalledTimes(2)

		pixApi.getCheckout.mockResolvedValue(stageOf('verifying'))
		await advance(4000)
		expect(textOf('pix-finished-title')).toContain('Recibimos tu pago')

		await advance(40000)
		pixApi.getCheckout.mockClear()
		await advance(20000)
		expect(pixApi.getCheckout).not.toHaveBeenCalled()
	})

	test('al volver de la app del banco consulta sin esperar a la siguiente vuelta', async () => {
		await render()
		await advance(100)
		pixApi.getCheckout.mockClear()
		const listener = AppState.addEventListener.mock.calls.at(-1)[1]
		await act(async () => { listener('active') })
		await advance(1)
		expect(pixApi.getCheckout).toHaveBeenCalledTimes(1)
	})

	test('pagado: saca las líneas con las que se creó el cobro, venga de la pantalla que venga, y refresca las compras', async () => {
		await rememberCartLines('c1', ['a', 'b'])
		await render()
		expect(removeCartLine).not.toHaveBeenCalled()
		pixApi.getCheckout.mockResolvedValue(stageOf('verifying'))
		await advance(4000)
		expect(removeCartLine.mock.calls.map(call => call[0])).toEqual(['a', 'b'])
		expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['store', 'my-purchases'] })
	})

	test('devuelto sin haber llegado a verifying: las líneas se quedan en el carrito', async () => {
		await rememberCartLines('c1', ['a'])
		pixApi.getCheckout.mockResolvedValue(stageOf('refunded', { refunded_brl: 57.78 }))
		await render()
		expect(removeCartLine).not.toHaveBeenCalled()
	})

	test('sin pagar el QR no refresca las compras', async () => {
		pixApi.getCheckout.mockResolvedValue(stageOf('expired'))
		await render()
		expect(client.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['store', 'my-purchases'] })
	})

	test('pagado ya no hay gesto ni flecha, y cerrar saca también el wizard', async () => {
		pixApi.getCheckout.mockResolvedValue(stageOf('delivered'))
		await render({ doneDepth: 2 })
		expect(navigation.setOptions).toHaveBeenLastCalledWith({ headerBackVisible: false, gestureEnabled: false })
		act(() => { byTestId('pix-close')[0].props.onPress() })
		expect(stackAfterLeaving([{ name: 'MainStack' }, { name: 'PhoneTopupIndex' }, { name: 'PhoneTopupBrand' }, { name: 'PixCheckout' }])).toEqual(['MainStack', 'PhoneTopupIndex'])
	})

	test('sin pagar, cerrar vuelve a la compra para pagarla de otra forma', async () => {
		pixApi.getCheckout.mockResolvedValue(stageOf('expired'))
		await render({ doneDepth: 2 })
		act(() => { byTestId('pix-close')[0].props.onPress() })
		expect(stackAfterLeaving([{ name: 'MainStack' }, { name: 'PhoneTopupBrand' }, { name: 'PixCheckout' }])).toEqual(['MainStack', 'PhoneTopupBrand'])
	})

	test('«Ver mis compras»: una compra del marketplace entregada va a sus pedidos', async () => {
		pixApi.getCheckout.mockResolvedValue(stageOf('delivered', { surface: 'market' }))
		await render({ charge: { ...CHARGE, surface: 'market' } })
		act(() => { tree.root.findAllByType('QPButton')[0].props.onPress() })
		expect(stackAfterLeaving([{ name: 'MainStack' }, { name: 'MarketCart' }, { name: 'PixCheckout' }])).toEqual(['MainStack', 'MarketCart', 'MarketOrders'])
	})

	test('«Ver mis compras»: lo retenido solo se ve en Mis compras, también en el marketplace', async () => {
		pixApi.getCheckout.mockResolvedValue(stageOf('verifying', { surface: 'market' }))
		await render({ charge: { ...CHARGE, surface: 'market' } })
		act(() => { tree.root.findAllByType('QPButton')[0].props.onPress() })
		expect(stackAfterLeaving([{ name: 'MainStack' }, { name: 'MarketCart' }, { name: 'PixCheckout' }])).toEqual(['MainStack', 'MarketCart', 'MyPurchases'])
	})

	test('cancelar vuelve a la compra', async () => {
		pixApi.cancelCheckout.mockResolvedValue({ success: true })
		await render()
		await act(async () => { await byTestId('pix-cancel')[0].props.onPress() })
		expect(pixApi.cancelCheckout).toHaveBeenCalledWith('c1')
		expect(navigation.goBack).toHaveBeenCalled()
	})

	test('si el pago acaba de entrar no cancela: la pantalla pasa a enseñar el pago', async () => {
		pixApi.cancelCheckout.mockResolvedValue({ success: false, status: 409, details: { code: 'PIX_NOT_CANCELLABLE' } })
		await render()
		pixApi.getCheckout.mockResolvedValue(stageOf('verifying'))
		await act(async () => { await byTestId('pix-cancel')[0].props.onPress() })
		await advance(10)
		expect(navigation.goBack).not.toHaveBeenCalled()
		expect(toast.info).toHaveBeenCalled()
		expect(textOf('pix-finished-title')).toContain('Recibimos tu pago')
	})

	test('una etapa que esta versión no conoce no enseña una clave cruda', async () => {
		pixApi.getCheckout.mockResolvedValue(stageOf('una_etapa_nueva'))
		await render()
		expect(textOf('pix-finished-title')).toContain('Recibimos tu pago')
	})

	test('antes de pagar no toca el gesto de volver', async () => {
		await render()
		expect(navigation.setOptions).not.toHaveBeenCalled()
	})

	test('el reembolso dice cuánto se devolvió', async () => {
		pixApi.getCheckout.mockResolvedValue(stageOf('refunded', { refunded_brl: 20.5 }))
		await render()
		expect(JSON.stringify(tree.toJSON())).toContain('Devolvimos R$ 20,50 a la cuenta Pix que pagó.')
	})
})
