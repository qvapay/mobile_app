/**
 * @jest-environment node
 *
 * La máquina del alquiler de energía. Lo que se prueba aquí es dinero: que la
 * clave de idempotencia no entregue una orden por otra, y que ningún camino
 * acabe invitando a comprar algo que ya se compró.
 */
import {
	initialRentState,
	isTerminalOrder,
	POLL_DEADLINE_MS,
	pollDelayMs,
	rentReducer,
	shouldKeepKeyOnFailure,
} from './energyRentMachine'

const PARAMS = { targetAddress: 'TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy', volume: 66_000, duration: '1h' }

const order = (status, extra = {}) => ({
	uuid: 'order-1', resource: 'energy', target_address: PARAMS.targetAddress,
	volume: PARAMS.volume, duration: PARAMS.duration, price_usd: 0.55, status,
	reason: null, order_id: null, txid: null, explorer: null,
	created_at: '2026-09-20T10:00:00.000Z', completed_at: null, ...extra,
})

const quote = { quote_id: 'q1', volume: 66_000, duration: '1h', price_usd: 0.55, expires_at: '2026-09-20T10:01:30.000Z' }

/** Aplica una lista de eventos en orden. */
const run = (state, ...events) => events.reduce(rentReducer, state)

describe('clave de idempotencia', () => {

	it('sobrevive a un fallo de red: la petición pudo llegar', () => {
		const start = initialRentState(PARAMS)
		const after = run(start, { type: 'confirm' }, { type: 'failed', code: null, message: 'sin red' })
		expect(after.key).toBe(start.key)
	})

	it('sobrevive al 409 de petición duplicada y al 429', () => {
		const start = initialRentState(PARAMS)
		expect(rentReducer(start, { type: 'failed', code: 'DUPLICATE_REQUEST', message: '', http: 409 }).key).toBe(start.key)
		expect(rentReducer(start, { type: 'failed', code: 'RATE_LIMITED', message: '', http: 429 }).key).toBe(start.key)
	})

	it('sobrevive a una cotización caducada, porque el backend no llegó a usarla', () => {
		const start = initialRentState(PARAMS)
		const after = rentReducer(start, { type: 'failed', code: 'QUOTE_EXPIRED', message: '', http: 409 })
		expect(after.key).toBe(start.key)
		expect(after.quote).toBeNull()
	})

	it('pero dos cotizaciones caducadas seguidas la rotan', () => {
		const start = initialRentState(PARAMS)
		const once = rentReducer(start, { type: 'failed', code: 'QUOTE_EXPIRED', message: '', http: 409 })
		const twice = rentReducer(once, { type: 'failed', code: 'QUOTE_EXPIRED', message: '', http: 409 })
		expect(twice.key).not.toBe(start.key)
	})

	it('rota tras una orden creada, entregada o replicada', () => {
		const start = initialRentState(PARAMS)
		expect(rentReducer(start, { type: 'rented', order: order('completed'), http: 201 }).key).not.toBe(start.key)
		expect(rentReducer(start, { type: 'rented', order: order('dispatching'), http: 202 }).key).not.toBe(start.key)
		expect(rentReducer(start, { type: 'rented', order: order('pending'), http: 200, duplicate: true }).key).not.toBe(start.key)
	})

	it('rota tras un 502, porque el saldo volvió y reintentar es otra orden', () => {
		const start = initialRentState(PARAMS)
		const after = rentReducer(start, { type: 'failed', code: 'DELIVERY_FAILED', message: '', http: 502 })
		expect(after.key).not.toBe(start.key)
		expect(after.charged).toBe(false)
	})

	it('rota tras los errores de validación y de límite', () => {
		const start = initialRentState(PARAMS)
		expect(rentReducer(start, { type: 'failed', code: 'INSUFFICIENT_BALANCE', message: '', http: 400 }).key).not.toBe(start.key)
		expect(rentReducer(start, { type: 'failed', code: 'LIMIT_EXCEEDED', message: '', http: 403 }).key).not.toBe(start.key)
	})

	it('rota al cambiar el pedido: es otra compra, no un reintento', () => {
		// Sin esto el backend devolvería 200 duplicate con la orden VIEJA y el
		// usuario tendría 66.000/1h creyendo que compró 132.000/1d
		const start = initialRentState(PARAMS)
		const after = rentReducer(start, { type: 'setParams', params: { ...PARAMS, volume: 132_000, duration: '1d' } })
		expect(after.key).not.toBe(start.key)
		expect(after.quote).toBeNull()
	})

	it('NO rota al cambiar el pedido con dinero en vuelo', () => {
		const flying = run(initialRentState(PARAMS), { type: 'confirm' })
		const after = rentReducer(flying, { type: 'setParams', params: { ...PARAMS, volume: 132_000 } })
		expect(after.key).toBe(flying.key)
		expect(after.phase).toBe('renting')
	})

	it('no rota si los parámetros no cambiaron de verdad', () => {
		const start = initialRentState(PARAMS)
		expect(rentReducer(start, { type: 'setParams', params: { ...PARAMS } }).key).toBe(start.key)
	})
})

describe('shouldKeepKeyOnFailure', () => {

	it('sin respuesta HTTP siempre conserva', () => {
		expect(shouldKeepKeyOnFailure({ code: null, http: undefined, quoteExpiredStreak: 0 })).toBe(true)
	})

	it('un código desconocido rota', () => {
		expect(shouldKeepKeyOnFailure({ code: 'WHATEVER', http: 400, quoteExpiredStreak: 0 })).toBe(false)
	})
})

describe('transiciones', () => {

	it('el camino feliz: cotizar, confirmar, entregada', () => {
		const state = run(initialRentState(PARAMS),
			{ type: 'quoting' },
			{ type: 'quoted', quote },
			{ type: 'confirm' },
			{ type: 'rented', order: order('completed', { txid: '0xabc' }), http: 201 },
		)
		expect(state.phase).toBe('done')
		expect(state.charged).toBe(true)
		expect(state.order.txid).toBe('0xabc')
	})

	it('el 202 entra en espera y cierra al completarse', () => {
		const polling = run(initialRentState(PARAMS), { type: 'confirm' }, { type: 'rented', order: order('dispatching'), http: 202 })
		expect(polling.phase).toBe('polling')
		expect(polling.charged).toBe(true)
		expect(rentReducer(polling, { type: 'polled', order: order('completed') }).phase).toBe('done')
	})

	it('una orden reembolsada es un fallo, y el saldo ya no está cobrado', () => {
		const polling = run(initialRentState(PARAMS), { type: 'confirm' }, { type: 'rented', order: order('dispatching'), http: 202 })
		const after = rentReducer(polling, { type: 'polled', order: order('refunded', { reason: 'provider' }) })
		expect(after).toMatchObject({ phase: 'failed', errorCode: 'REFUNDED', charged: false })
	})

	it('una orden en revisión manual queda lenta, no fallida', () => {
		const polling = run(initialRentState(PARAMS), { type: 'confirm' }, { type: 'rented', order: order('dispatching'), http: 202 })
		expect(rentReducer(polling, { type: 'polled', order: order('needs_review') }).phase).toBe('slow')
	})

	it('el tope de espera manda la orden al historial, nunca de vuelta a comprar', () => {
		const polling = run(initialRentState(PARAMS), { type: 'confirm' }, { type: 'rented', order: order('dispatching'), http: 202 })
		const started = rentReducer(polling, { type: 'tick', now: 1_000 })
		expect(started.phase).toBe('polling')
		expect(rentReducer(started, { type: 'tick', now: 1_000 + POLL_DEADLINE_MS - 1 }).phase).toBe('polling')
		const expired = rentReducer(started, { type: 'tick', now: 1_000 + POLL_DEADLINE_MS })
		expect(expired.phase).toBe('slow')
		expect(expired.charged).toBe(true)
	})

	it('el reloj no mueve nada fuera de la espera', () => {
		const start = initialRentState(PARAMS)
		expect(rentReducer(start, { type: 'tick', now: 9_999_999 })).toBe(start)
	})

	it('el doble tap en confirmar no dispara una segunda compra', () => {
		const first = run(initialRentState(PARAMS), { type: 'confirm' })
		expect(rentReducer(first, { type: 'confirm' })).toBe(first)
		const polling = rentReducer(first, { type: 'rented', order: order('dispatching'), http: 202 })
		expect(rentReducer(polling, { type: 'confirm' })).toBe(polling)
	})

	it('aplicar dos veces la misma entrega no cobra ni rota dos veces', () => {
		const once = run(initialRentState(PARAMS), { type: 'confirm' }, { type: 'rented', order: order('completed'), http: 201 })
		const twice = rentReducer(once, { type: 'rented', order: order('completed'), http: 201 })
		expect(twice.phase).toBe('done')
		expect(twice.order).toEqual(once.order)
	})

	it('ninguna fase terminal vuelve a un estado de compra', () => {
		const terminals = ['done', 'slow', 'failed']
		const base = run(initialRentState(PARAMS), { type: 'confirm' }, { type: 'rented', order: order('dispatching'), http: 202 })
		terminals.forEach(phase => {
			const state = { ...base, phase }
			expect(rentReducer(state, { type: 'tick', now: Date.now() }).phase).toBe(phase)
			expect(rentReducer(state, { type: 'polled', order: order('dispatching') }).phase).toBe(phase)
		})
	})
})

describe('ritmo de la espera', () => {

	it('empieza corta y se estabiliza', () => {
		expect(pollDelayMs(0)).toBe(2_000)
		expect(pollDelayMs(1)).toBe(3_000)
		expect(pollDelayMs(2)).toBe(5_000)
		expect(pollDelayMs(20)).toBe(5_000)
	})

	it('reconoce las órdenes que ya no se mueven', () => {
		expect(isTerminalOrder(order('completed'))).toBe(true)
		expect(isTerminalOrder(order('refunded'))).toBe(true)
		expect(isTerminalOrder(order('dispatching'))).toBe(false)
		expect(isTerminalOrder(null)).toBe(false)
	})
})
