/**
 * El motor de datos del intercambio cripto↔cripto: cuándo se cotiza y cuándo NO.
 *
 * Todo aquí gira alrededor de una trampa: el mínimo del par apaga la query. Un mínimo mal
 * atribuido no produce un aviso, produce una pantalla que deja de cargar el importe a
 * recibir sin decir por qué.
 * @jest-environment node
 */
jest.mock('../../../api/exchangeApi', () => ({
	exchangeApi: { quote: jest.fn(), create: jest.fn(), catalog: jest.fn(), get: jest.fn(), list: jest.fn() },
}))
jest.mock('sonner-native', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { exchangeApi } from '../../../api/exchangeApi'
import useExchangeFlow, { QUOTE_DEBOUNCE_MS } from './useExchangeFlow'

// Los dos pares del caso real, con sus mínimos REALES del proveedor (26 sep 2026)
const USDT_TRON = { id: 'tron:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', kind: 'tron', symbol: 'USDT', decimals: 6, amount: '500' }
const USDC_BASE = { id: 'base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', kind: 'evm', symbol: 'USDC', decimals: 6, amount: '500' }
const TRX = { id: 'tron:native', kind: 'tron', symbol: 'TRX', decimals: 6, amount: '0' }
const MIN_USDT_TRON = 12.359949
const MIN_USDC_BASE = 0.455497

const ADDRESSES = { evm: '0xabc', tron: 'TXYZ', btc: 'bc1q', stx: 'SP1', sol: 'So11' }

/** Mínimo real de cada origen, para que el mock conteste como el proveedor. */
const MIN_BY_ASSET = { [USDT_TRON.id]: MIN_USDT_TRON, [USDC_BASE.id]: MIN_USDC_BASE }

/** El backend contesta según el par: un mock que devuelve siempre lo mismo escondería el bug. */
const quoteByPair = () => exchangeApi.quote.mockImplementation(async ({ fromAssetId, amount }) => {
	const min = MIN_BY_ASSET[fromAssetId] ?? 1
	if (amount < min) {
		return { success: false, status: 400, error: `El mínimo para este par es ${min}`, details: { code: 'BELOW_MINIMUM', min_amount: min } }
	}
	return quoteFor(amount, min)
})

const quoteFor = (amount, minAmount) => ({
	success: true,
	status: 200,
	data: {
		quote: { provider: 'changenow', amountIn: amount, amountOut: amount * 2.9, depositFee: 0.0076, withdrawalFee: 0, speedForecast: '10-60', providerWarning: null },
		advice: { level: 'ok', bps: 3, suggestedMinimum: null },
		min_amount: minAmount,
		quote_id: 'q-' + amount,
		expires_at: new Date(Date.now() + 120000).toISOString(),
		alternatives: [],
		cheaper_origin: null,
	},
})

let client
const Probe = ({ state }) => {
	state.flow = useExchangeFlow({ ...state.props, addresses: ADDRESSES, onOpened: () => { }, onOnchainRoute: state.props.onOnchainRoute })
	return null
}

const mount = (props) => {
	const state = { props }
	let tree
	act(() => {
		tree = create(
			<QueryClientProvider client={client}>
				<Probe state={state} />
			</QueryClientProvider>,
		)
	})
	state.rerender = (next) => {
		state.props = { ...state.props, ...next }
		act(() => { tree.update(<QueryClientProvider client={client}><Probe state={state} /></QueryClientProvider>) })
	}
	state.unmount = () => act(() => tree.unmount())
	return state
}

/**
 * Deja asentar con reloj REAL: primero el debounce del importe, y solo después la petición
 * y el aviso de React Query (que llega por temporizador). Con un margen justo, lo que se lee
 * es todavía la cotización del par anterior servida por `placeholderData`.
 */
const settle = async () => { await act(async () => { await new Promise(r => setTimeout(r, QUOTE_DEBOUNCE_MS + 250)) }) }

beforeEach(() => {
	jest.clearAllMocks()
	client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
})
afterEach(() => { client.clear() })

describe('el mínimo es del PAR, no de la pantalla', () => {

	it('el mínimo aprendido en un par no bloquea al siguiente', async () => {
		// 1. USDT-TRON, que es el primer activo de la wallet y el de mínimo más alto
		quoteByPair()
		const s = mount({ from: USDT_TRON, to: TRX, amountText: '20' })
		await settle()
		expect(s.flow.minAmount).toBeCloseTo(MIN_USDT_TRON)
		expect(s.flow.quote).not.toBeNull()

		// 2. Se cambia a USDC en Base, cuyo mínimo real es VEINTISIETE veces menor, y se teclea
		//    un importe que es válido ahí pero quedaba por debajo del mínimo del par anterior
		s.rerender({ from: USDC_BASE, amountText: '5' })
		await settle()

		expect(s.flow.check.ok).toBe(true)
		expect(s.flow.quote).not.toBeNull()
		// Y se preguntó por el par NUEVO con el importe nuevo: es lo que antes no pasaba,
		// porque el mínimo heredado apagaba la query
		expect(exchangeApi.quote).toHaveBeenCalledWith(expect.objectContaining({ fromAssetId: USDC_BASE.id, amount: 5 }))
		s.unmount()
	})

	it('volver a un par ya visto recuerda SU mínimo, sin otra ida al servidor', async () => {
		quoteByPair()
		const s = mount({ from: USDT_TRON, to: TRX, amountText: '20' })
		await settle()

		s.rerender({ from: USDC_BASE, amountText: '5' })
		await settle()
		expect(s.flow.minAmount).toBeCloseTo(MIN_USDC_BASE)

		s.rerender({ from: USDT_TRON, amountText: '20' })
		await settle()
		expect(s.flow.minAmount).toBeCloseTo(MIN_USDT_TRON)
		s.unmount()
	})

	it('dentro del MISMO par, el mínimo sí bloquea: para eso está', async () => {
		quoteByPair()
		const s = mount({ from: USDT_TRON, to: TRX, amountText: '20' })
		await settle()

		s.rerender({ amountText: '3' })
		await settle()
		expect(s.flow.check.ok).toBe(false)
		expect(s.flow.check.reason).toBe('below_minimum')
		s.unmount()
	})
})

describe('cuándo se gasta una cotización', () => {

	it('sin importe, sin activos o con el par no soportado, no se pregunta al servidor', async () => {
		const s = mount({ from: USDT_TRON, to: TRX, amountText: '' })
		await settle()
		expect(exchangeApi.quote).not.toHaveBeenCalled()

		s.rerender({ amountText: '20', unsupportedReason: 'no se puede' })
		await settle()
		expect(exchangeApi.quote).not.toHaveBeenCalled()

		s.rerender({ unsupportedReason: null, to: null })
		await settle()
		expect(exchangeApi.quote).not.toHaveBeenCalled()
		s.unmount()
	})

	it('más de lo que hay en el saldo tampoco se cotiza', async () => {
		const s = mount({ from: { ...USDT_TRON, amount: '10' }, to: TRX, amountText: '50' })
		await settle()
		expect(s.flow.check.reason).toBe('insufficient')
		expect(exchangeApi.quote).not.toHaveBeenCalled()
		s.unmount()
	})

	it('el 400 de "por debajo del mínimo" enseña el mínimo real en vez de solo fallar', async () => {
		exchangeApi.quote.mockResolvedValue({ success: false, status: 400, error: 'El mínimo para este par es 12.36', details: { code: 'BELOW_MINIMUM', min_amount: MIN_USDT_TRON } })
		const s = mount({ from: USDT_TRON, to: TRX, amountText: '5' })
		await settle()
		expect(s.flow.minAmount).toBeCloseTo(MIN_USDT_TRON)
		s.unmount()
	})
})

describe('lo que se confirma es lo que se revisó', () => {

	it('cambiar el importe dentro del debounce no deja confirmar la cotización vieja', async () => {
		quoteByPair()
		exchangeApi.create.mockResolvedValue({ success: true, status: 201, data: { uuid: 'o-1' } })
		const s = mount({ from: USDC_BASE, to: TRX, amountText: '20' })
		await settle()
		expect(s.flow.ready).toBe(true)

		// El usuario teclea otro importe y pulsa Revisar → Confirmar antes de que acabe el debounce
		s.rerender({ amountText: '30' })
		expect(s.flow.ready).toBe(false)
		await act(async () => { await s.flow.confirm() })
		expect(exchangeApi.create).not.toHaveBeenCalled()

		// Con la cotización de 30 ya en pantalla, se confirma 30 y su quote_id
		// (la cotización de 30 sale al acabar el debounce y llega por notifyManager: se sondea)
		for (let i = 0; i < 10 && !s.flow.ready; i++) { await settle() }
		expect(s.flow.ready).toBe(true)
		await act(async () => { await s.flow.confirm() })
		expect(exchangeApi.create).toHaveBeenCalledTimes(1)
		expect(exchangeApi.create.mock.calls[0][0]).toMatchObject({ amount: 30, quoteId: 'q-30' })
		s.unmount()
	})

	it('la cotización del par anterior (placeholderData) tampoco se puede confirmar', async () => {
		quoteByPair()
		const s = mount({ from: USDC_BASE, to: TRX, amountText: '20' })
		await settle()
		expect(s.flow.ready).toBe(true)
		s.rerender({ from: USDT_TRON })
		expect(s.flow.ready).toBe(false)
		s.unmount()
	})
})

describe('rutas: varios proveedores, una elección', () => {

	const route = (provider, amountOut, extra = {}) => ({
		quote_id: `q-${provider}`, expires_at: new Date(Date.now() + 120000).toISOString(),
		provider, provider_label: provider.toUpperCase(), custody: 'custodial', kyc_risk: 'possible', rate_type: 'floating',
		amount_in: 20, amount_out: amountOut, deposit_fee: 0.0076, withdrawal_fee: 0, eta: '10-60', eta_minutes: 60,
		warning: null, best: false, fastest: false, shortfall: 0, below_min: false, min_amount: 1, ...extra,
	})

	/** El backend con rutas: la mejor primero y con su quote_id también en el sobre viejo. */
	const quoteWithRoutes = (routes) => exchangeApi.quote.mockImplementation(async () => {
		const best = routes[0]
		return {
			success: true, status: 200,
			data: {
				quote: { provider: best.provider, amountIn: 20, amountOut: best.amount_out, depositFee: 0.0076, withdrawalFee: 0, speedForecast: '10-60', providerWarning: null },
				advice: { level: 'ok', bps: 3, suggestedMinimum: null },
				min_amount: 1, quote_id: best.quote_id, expires_at: best.expires_at, alternatives: [], cheaper_origin: null,
				routes,
			},
		}
	})

	it('por defecto se usa la mejor', async () => {
		quoteWithRoutes([route('simpleswap', 59, { best: true }), route('changenow', 58)])
		const s = mount({ from: USDC_BASE, to: TRX, amountText: '20' })
		await settle()
		expect(s.flow.routes).toHaveLength(2)
		expect(s.flow.selectedRoute.provider).toBe('simpleswap')
		expect(s.flow.quote.amountOut).toBe(59)
		s.unmount()
	})

	it('elegir otra ruta abre la operación con SU quote_id, no con el de la mejor', async () => {
		quoteWithRoutes([route('simpleswap', 59, { best: true }), route('changenow', 58)])
		exchangeApi.create.mockResolvedValue({ success: true, status: 201, data: { uuid: 'o-1' } })
		const s = mount({ from: USDC_BASE, to: TRX, amountText: '20' })
		await settle()

		act(() => { s.flow.selectRoute('changenow') })
		expect(s.flow.selectedRoute.provider).toBe('changenow')
		// La pantalla pinta lo que da ESA ruta, con su nombre legible
		expect(s.flow.quote.amountOut).toBe(58)
		expect(s.flow.quote.provider).toBe('CHANGENOW')

		await act(async () => { await s.flow.confirm() })
		expect(exchangeApi.create.mock.calls[0][0]).toMatchObject({ quoteId: 'q-changenow' })
		s.unmount()
	})

	it('si la ruta elegida deja de cotizar, se vuelve a la mejor', async () => {
		quoteWithRoutes([route('simpleswap', 59, { best: true }), route('changenow', 58)])
		const s = mount({ from: USDC_BASE, to: TRX, amountText: '20' })
		await settle()
		act(() => { s.flow.selectRoute('changenow') })

		// Nueva cotización (otro importe) en la que changenow ya no llega a su mínimo
		quoteWithRoutes([route('simpleswap', 89, { best: true }), route('changenow', null, { quote_id: null, below_min: true, min_amount: 50 })])
		s.rerender({ amountText: '30' })
		for (let i = 0; i < 10 && s.flow.selectedRoute?.amount_out !== 89; i++) { await settle() }
		expect(s.flow.selectedRoute.provider).toBe('simpleswap')
		s.unmount()
	})

	it('con la revisión abierta, un cambio de ruta por debajo bloquea Confirmar', async () => {
		quoteWithRoutes([route('simpleswap', 59, { best: true }), route('changenow', 58)])
		const s = mount({ from: USDC_BASE, to: TRX, amountText: '20' })
		await settle()
		act(() => { s.flow.selectRoute('changenow') })
		act(() => { s.flow.openReview() })
		expect(s.flow.ready).toBe(true)

		// El refresco periódico ya no trae a changenow: la ruta en uso pasa a ser otra que el
		// usuario NO revisó
		quoteWithRoutes([route('simpleswap', 59.1, { best: true })])
		await act(async () => { await client.refetchQueries() })
		await settle()
		expect(s.flow.selectedRoute.provider).toBe('simpleswap')
		expect(s.flow.ready).toBe(false)
		s.unmount()
	})

	it('pide rutas on-chain declarando lo que sabe firmar y con sus propias direcciones', async () => {
		quoteWithRoutes([route('simpleswap', 59, { best: true })])
		const s = mount({ from: USDC_BASE, to: TRX, amountText: '20' })
		await settle()
		expect(exchangeApi.quote.mock.calls[0][0]).toMatchObject({ onchain: ['evm', 'solana', 'tron', 'btc'], addresses: { evm: ADDRESSES.evm, solana: ADDRESSES.sol } })
		s.unmount()
	})

	it('una ruta on-chain no abre la revisión custodial: va a firmar con el importe COTIZADO', async () => {
		quoteWithRoutes([route('lifi', 60, { best: true, custody: 'onchain', kyc_risk: 'none', service_fee_bps: 40 }), route('simpleswap', 59)])
		const onOnchainRoute = jest.fn()
		const s = mount({ from: USDC_BASE, to: TRX, amountText: '20', onOnchainRoute })
		await settle()
		act(() => { s.flow.openReview() })
		expect(s.flow.review).toBe(false)
		expect(onOnchainRoute).toHaveBeenCalledWith(expect.objectContaining({ provider: 'lifi', quote_id: 'q-lifi' }), 20)
		expect(exchangeApi.create).not.toHaveBeenCalled()
		s.unmount()
	})

	it('un backend sin rutas se lee como una sola ruta con su quote_id', async () => {
		quoteByPair()
		const s = mount({ from: USDC_BASE, to: TRX, amountText: '20' })
		await settle()
		expect(s.flow.routes).toHaveLength(1)
		expect(s.flow.selectedRoute.quote_id).toBe('q-20')
		expect(s.flow.ready).toBe(true)
		s.unmount()
	})
})
