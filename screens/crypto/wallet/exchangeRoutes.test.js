/**
 * Rutas del intercambio (varios proveedores, estilo SafePal): de la respuesta del backend a
 * la ruta en uso y a lo que se pinta en la hoja. Lo que no se puede romper: elegir una ruta
 * nunca ejecuta otra, y una ruta que no se puede confirmar nunca queda seleccionada.
 * @jest-environment node
 */
const { isSelectable, quoteOfRoute, routesFrom, selectRoute, selectableCount } = require('./exchangeModel')
const { routeItemsFor, routeSummaryFor } = require('./exchangeView')

const t = (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key)

const route = (provider, amountOut, over = {}) => ({
	quote_id: `q-${provider}`, expires_at: null,
	provider, provider_label: provider.toUpperCase(), custody: 'custodial', kyc_risk: 'possible', rate_type: 'floating',
	amount_in: 100, amount_out: amountOut, deposit_fee: 1.5, withdrawal_fee: 0, eta: '10-60', eta_minutes: 60,
	warning: null, best: false, fastest: false, shortfall: 0, below_min: false, min_amount: 10, ...over,
})
const blocked = (provider, min) => route(provider, null, { quote_id: null, below_min: true, min_amount: min, amount_in: null, deposit_fee: null, eta: null })

const ROUTES = [
	route('simpleswap', 0.8, { best: true }),
	route('changenow', 0.79, { fastest: true, shortfall: 0.01, eta: '5-15' }),
	blocked('otro', 36),
]

const from = { symbol: 'USDT' }
const to = { symbol: 'SOL' }

describe('de la respuesta a las rutas', () => {

	it('con rutas, se usan tal cual', () => {
		expect(routesFrom({ routes: ROUTES })).toBe(ROUTES)
	})

	it('un backend sin rutas se convierte en UNA ruta con su quote_id', () => {
		const [only, ...rest] = routesFrom({
			quote: { provider: 'changenow', amountIn: 100, amountOut: 0.79, depositFee: 1.5, withdrawalFee: 0, speedForecast: '10-60', providerWarning: null },
			quote_id: 'q-1', expires_at: 'x', routes: undefined,
		})
		expect(rest).toHaveLength(0)
		expect(only).toMatchObject({ provider: 'changenow', quote_id: 'q-1', amount_out: 0.79, best: true })
		expect(isSelectable(only)).toBe(true)
	})

	it('una lista de rutas vacía también cae a la cotización suelta', () => {
		expect(routesFrom({ quote: { provider: 'x', amountIn: 1, amountOut: 1 }, quote_id: 'q', routes: [] })).toHaveLength(1)
	})

	it('sin respuesta, nada', () => {
		expect(routesFrom(null)).toEqual([])
	})
})

describe('la ruta en uso', () => {

	it('sin elección, la mejor', () => {
		expect(selectRoute(ROUTES, null).provider).toBe('simpleswap')
	})

	it('la elegida, si se puede confirmar', () => {
		expect(selectRoute(ROUTES, 'changenow').provider).toBe('changenow')
	})

	it('una por debajo de su mínimo nunca queda seleccionada', () => {
		expect(selectRoute(ROUTES, 'otro').provider).toBe('simpleswap')
	})

	it('una que ya no está, tampoco', () => {
		expect(selectRoute(ROUTES, 'fantasma').provider).toBe('simpleswap')
	})

	it('si ninguna se puede confirmar, ninguna', () => {
		expect(selectRoute([blocked('a', 10)], null)).toBeNull()
	})

	it('cuenta solo las elegibles', () => {
		expect(selectableCount(ROUTES)).toBe(2)
	})

	it('la cotización de la ruta lleva el nombre legible', () => {
		expect(quoteOfRoute(ROUTES[1])).toMatchObject({ provider: 'CHANGENOW', amountOut: 0.79, depositFee: 1.5, speedForecast: '5-15' })
		expect(quoteOfRoute(ROUTES[2])).toBeNull()
	})
})

describe('la hoja de rutas', () => {

	const items = routeItemsFor({ t, from, to, routes: ROUTES, selectedProvider: 'changenow' })

	it('una fila por ruta, en el orden del backend', () => {
		expect(items.map(i => i.provider)).toEqual(['simpleswap', 'changenow', 'otro'])
	})

	it('la mejor lleva su insignia y ningún déficit', () => {
		expect(items[0].badges).toEqual(['crypto.wallet.exchange.routes.best'])
		expect(items[0].delta).toBeNull()
		expect(items[0].receive).toBe('0.8 SOL')
	})

	it('las demás dicen cuánto menos reciben, en la moneda de destino', () => {
		expect(items[1].delta).toBe('crypto.wallet.exchange.routes.less|{"amount":"0.01","symbol":"SOL"}')
		expect(items[1].badges).toEqual(['crypto.wallet.exchange.routes.fastest'])
		expect(items[1].selected).toBe(true)
	})

	it('tiempo y comisión de red en la línea de detalle', () => {
		expect(items[1].detail).toContain('crypto.wallet.exchange.routes.eta|{"eta":"5-15"}')
		expect(items[1].detail).toContain('crypto.wallet.exchange.routes.networkFee|{"amount":"1.5","symbol":"USDT"}')
	})

	it('la que no llega a su mínimo: apagada, sin importe, con su "desde"', () => {
		expect(items[2]).toMatchObject({ disabled: true, receive: '', delta: null, badges: [], selected: false })
		expect(items[2].detail).toBe('crypto.wallet.exchange.routes.belowMin|{"amount":"36","symbol":"USDT"}')
	})

	it('cada fila custodial lo dice', () => {
		expect(items.every(i => i.custody === 'crypto.wallet.exchange.routes.custodial')).toBe(true)
	})

	it('una ruta on-chain dice que no hay custodia y CUÁNTO cobra QvaPay (ya incluido)', () => {
		const [item] = routeItemsFor({ t, from, to, routes: [route('lifi', 0.81, { best: true, custody: 'onchain', kyc_risk: 'none', service_fee_bps: 40 })], selectedProvider: 'lifi' })
		expect(item.custody).toContain('crypto.wallet.exchange.routes.onchain')
		expect(item.custody).toContain('crypto.wallet.exchange.routes.serviceFee|{"percent":"0,4"}')
		const [free] = routeItemsFor({ t, from, to, routes: [route('jupiter', 0.81, { best: true, custody: 'onchain', service_fee_bps: 0 })], selectedProvider: 'jupiter' })
		expect(free.custody).toBe('crypto.wallet.exchange.routes.onchain')
	})
})

describe('la línea de ruta del formulario', () => {

	it('nombre, insignia y cuántas rutas hay', () => {
		const summary = routeSummaryFor({ t, routes: ROUTES, selectedProvider: 'simpleswap' })
		expect(summary.title).toBe('SIMPLESWAP')
		expect(summary.caption).toBe('crypto.wallet.exchange.routes.best · crypto.wallet.exchange.routes.count|{"count":3}')
		expect(summary.canChoose).toBe(true)
	})

	it('con una sola ruta informa pero no abre nada', () => {
		const summary = routeSummaryFor({ t, routes: [route('changenow', 1, { best: true })], selectedProvider: 'changenow' })
		expect(summary.canChoose).toBe(false)
		expect(summary.caption).toBe('crypto.wallet.exchange.routes.best')
	})

	it('sin ruta en uso, no hay línea', () => {
		expect(routeSummaryFor({ t, routes: ROUTES, selectedProvider: 'otro' })).toBeNull()
		expect(routeSummaryFor({ t, routes: [], selectedProvider: null })).toBeNull()
	})
})
