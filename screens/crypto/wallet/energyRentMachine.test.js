/**
 * @jest-environment node
 *
 * La máquina del alquiler de energía. Lo que se prueba aquí es dinero: que la
 * clave de idempotencia no entregue una orden por otra, y que ningún camino
 * acabe invitando a comprar algo que ya se compró.
 */
import {
	ATTEMPT_CLOCK_SKEW_MS,
	credentialsFor,
	findAttemptOrder,
	initialRentState,
	isAmbiguousFailure,
	isTerminalOrder,
	paramsFromKey,
	paramsKeyOf,
	parsePendingEnergy,
	PENDING_MAX_AGE_MS,
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

/** `confirm` tal y como lo emite el hook: con las credenciales ya resueltas. */
const confirmOf = (state) => ({ type: 'confirm', ...credentialsFor(state) })
const confirmed = (state) => rentReducer(state, confirmOf(state))

describe('clave de idempotencia', () => {

	it('sobrevive a un fallo de red: la petición pudo llegar', () => {
		const start = initialRentState(PARAMS)
		const after = run(confirmed(start), { type: 'failed', code: null, message: 'sin red' })
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
		const flying = confirmed(initialRentState(PARAMS))
		const after = rentReducer(flying, { type: 'setParams', params: { ...PARAMS, volume: 132_000 } })
		expect(after.key).toBe(flying.key)
		expect(after.phase).toBe('renting')
	})

	it('no rota si los parámetros no cambiaron de verdad', () => {
		const start = initialRentState(PARAMS)
		expect(rentReducer(start, { type: 'setParams', params: { ...PARAMS } }).key).toBe(start.key)
	})
})

describe('credentialsFor — la clave corresponde a lo que se manda', () => {

	it('con los parámetros intactos, reutiliza clave y cotización', () => {
		const state = run(initialRentState(PARAMS), { type: 'quoted', quote })
		expect(credentialsFor(state)).toEqual({ key: state.key, keyParams: state.keyParams, quote })
	})

	it('si los parámetros cambiaron con dinero en vuelo, la compra siguiente NO hereda la clave vieja', () => {
		// setParams no rota con un vuelo en curso (ese vuelo es del pedido viejo),
		// así que params y keyParams quedan describiendo pedidos distintos. Mandar
		// el nuevo con la clave vieja haría que el backend replicase la orden
		// ANTERIOR como duplicate: el usuario cree que compró 132.000 y tiene 66.000
		const flying = confirmed(initialRentState(PARAMS))
		const changed = rentReducer(flying, { type: 'setParams', params: { ...PARAMS, volume: 132_000 } })
		expect(changed.key).toBe(flying.key)

		const creds = credentialsFor(changed)
		expect(creds.key).not.toBe(flying.key)
		expect(creds.keyParams).toContain('132000')
		// La cotización vieja tampoco vale: el backend la rechazaría por volumen
		expect(creds.quote).toBeNull()
	})

	it('el desfase sobrevive a un fallo que conserva la clave, y se resuelve al comprar', () => {
		// Camino completo del peligro: compra en vuelo → el usuario cambia el
		// pedido (no rota, el vuelo es del viejo) → la petición muere por red y
		// CONSERVA la clave → keyParams se queda describiendo el pedido anterior
		const flying = confirmed(initialRentState(PARAMS))
		const changed = rentReducer(flying, { type: 'setParams', params: { ...PARAMS, duration: '1d' } })
		const failed = rentReducer(changed, { type: 'failed', code: null, message: 'sin red' })
		expect(failed.key).toBe(flying.key)
		expect(failed.keyParams).not.toBe(`${PARAMS.targetAddress}|66000|1d`)

		// Al confirmar de nuevo, lo que se manda y lo que se guarda coinciden
		const creds = credentialsFor(failed)
		expect(creds.key).not.toBe(flying.key)
		const sent = rentReducer(failed, { type: 'confirm', ...creds })
		expect(sent.key).toBe(creds.key)
		expect(sent.keyParams).toBe(`${PARAMS.targetAddress}|66000|1d`)
	})
})

describe('shouldKeepKeyOnFailure', () => {

	it('sin respuesta HTTP siempre conserva', () => {
		expect(shouldKeepKeyOnFailure({ code: null, http: undefined, quoteExpiredStreak: 0 })).toBe(true)
	})

	it('un código desconocido rota', () => {
		expect(shouldKeepKeyOnFailure({ code: 'WHATEVER', http: 400, quoteExpiredStreak: 0 })).toBe(false)
	})

	it('un 5xx de infraestructura CONSERVA: es el caso canónico de "¿se cobró?"', () => {
		// Un 502/504 de gateway llega con status pero sin código nuestro. El
		// backend puede haber debitado ya: rotar la clave crearía una segunda orden
		expect(shouldKeepKeyOnFailure({ code: null, http: 502, quoteExpiredStreak: 0 })).toBe(true)
		expect(shouldKeepKeyOnFailure({ code: null, http: 504, quoteExpiredStreak: 0 })).toBe(true)
	})

	it('pero el 502 DELIVERY_FAILED rota, porque ahí el backend dice que devolvió el saldo', () => {
		expect(shouldKeepKeyOnFailure({ code: 'DELIVERY_FAILED', http: 502, quoteExpiredStreak: 0 })).toBe(false)
	})

	it('un 4xx sin código no se confunde con un 5xx', () => {
		expect(shouldKeepKeyOnFailure({ code: null, http: 400, quoteExpiredStreak: 0 })).toBe(false)
	})
})

describe('transiciones', () => {

	it('el camino feliz: cotizar, confirmar, entregada', () => {
		const quoted = run(initialRentState(PARAMS), { type: 'quoting' }, { type: 'quoted', quote })
		const state = run(confirmed(quoted), { type: 'rented', order: order('completed', { txid: '0xabc' }), http: 201 })
		expect(state.phase).toBe('done')
		expect(state.charged).toBe(true)
		expect(state.order.txid).toBe('0xabc')
	})

	it('el 202 entra en espera y cierra al completarse', () => {
		const polling = run(confirmed(initialRentState(PARAMS)), { type: 'rented', order: order('dispatching'), http: 202 })
		expect(polling.phase).toBe('polling')
		expect(polling.charged).toBe(true)
		expect(rentReducer(polling, { type: 'polled', order: order('completed') }).phase).toBe('done')
	})

	it('una orden reembolsada es un fallo, y el saldo ya no está cobrado', () => {
		const polling = run(confirmed(initialRentState(PARAMS)), { type: 'rented', order: order('dispatching'), http: 202 })
		const after = rentReducer(polling, { type: 'polled', order: order('refunded', { reason: 'provider' }) })
		expect(after).toMatchObject({ phase: 'failed', errorCode: 'REFUNDED', charged: false })
	})

	it('una orden en revisión manual queda lenta, no fallida', () => {
		const polling = run(confirmed(initialRentState(PARAMS)), { type: 'rented', order: order('dispatching'), http: 202 })
		expect(rentReducer(polling, { type: 'polled', order: order('needs_review') }).phase).toBe('slow')
	})

	it('el tope de espera manda la orden al historial, nunca de vuelta a comprar', () => {
		const polling = run(confirmed(initialRentState(PARAMS)), { type: 'rented', order: order('dispatching'), http: 202 })
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

	it('una recotización tardía no devuelve la UI a confirmar durante un cobro', () => {
		// `begin()` puede disparar con la compra ya en vuelo; si `quoted` pisara la
		// fase, el modal reabriría Cancelar y el CTA en mitad de un cargo
		const renting = confirmed(initialRentState(PARAMS))
		expect(rentReducer(renting, { type: 'quoted', quote }).phase).toBe('renting')
		expect(rentReducer(renting, { type: 'quoting' })).toBe(renting)

		const polling = rentReducer(renting, { type: 'rented', order: order('dispatching'), http: 202 })
		expect(rentReducer(polling, { type: 'quoted', quote }).phase).toBe('polling')
	})

	it('el doble tap en confirmar no dispara una segunda compra', () => {
		const first = confirmed(initialRentState(PARAMS))
		expect(rentReducer(first, confirmOf(first))).toBe(first)
		const polling = rentReducer(first, { type: 'rented', order: order('dispatching'), http: 202 })
		expect(rentReducer(polling, confirmOf(polling))).toBe(polling)
	})

	it('aplicar dos veces la misma entrega no cobra ni rota dos veces', () => {
		const once = run(confirmed(initialRentState(PARAMS)), { type: 'rented', order: order('completed'), http: 201 })
		const twice = rentReducer(once, { type: 'rented', order: order('completed'), http: 201 })
		expect(twice.phase).toBe('done')
		expect(twice.order).toEqual(once.order)
	})

	it('ninguna fase terminal vuelve a un estado de compra', () => {
		const terminals = ['done', 'slow', 'failed']
		const base = run(confirmed(initialRentState(PARAMS)), { type: 'rented', order: order('dispatching'), http: 202 })
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

// N-01: el backend valida precio, cotización y proveedor ANTES de buscar la orden por clave.
// Una compra sin respuesta pudo cobrarse; si el reintento topaba con uno de esos rechazos,
// la clave rotaba y el toque siguiente creaba y cobraba OTRA orden
describe('una compra en duda no cambia de clave', () => {

	const SENT_AT = 1_800_000_000_000
	/** Compra que sale y se queda sin respuesta (corte de red o timeout del cliente). */
	const inDoubt = (state = initialRentState(PARAMS)) => run(
		rentReducer(state, { ...confirmOf(state), at: SENT_AT }),
		{ type: 'failed', code: null, message: 'timeout' },
	)

	it('sin respuesta, o con un 5xx de infraestructura, queda en duda', () => {
		const start = initialRentState(PARAMS)
		expect(inDoubt(start)).toMatchObject({ phase: 'failed', doubt: true, key: start.key, keySentAt: SENT_AT })
		const gateway = run(rentReducer(start, { ...confirmOf(start), at: SENT_AT }), { type: 'failed', code: null, message: 'Bad Gateway', http: 502 })
		expect(gateway.doubt).toBe(true)
		expect(isAmbiguousFailure({ code: null, http: undefined })).toBe(true)
		expect(isAmbiguousFailure({ code: null, http: 400 })).toBe(false)
		expect(isAmbiguousFailure({ code: 'PROVIDER_UNAVAILABLE', http: 503 })).toBe(false)
	})

	it('un rechazo claro de la compra no deja duda', () => {
		const start = initialRentState(PARAMS)
		const after = run(rentReducer(start, { ...confirmOf(start), at: SENT_AT }), { type: 'failed', code: 'PROVIDER_UNAVAILABLE', message: '', http: 503 })
		expect(after.doubt).toBe(false)
		expect(after.key).not.toBe(start.key)
	})

	it('un fallo al COTIZAR no es una compra: no hay nada que dudar', () => {
		const quoting = rentReducer(initialRentState(PARAMS), { type: 'quoting' })
		expect(rentReducer(quoting, { type: 'failed', code: null, message: 'sin red' }).doubt).toBe(false)
	})

	it('el reintento que topa con el proveedor caído o con el precio NO rota la clave', () => {
		const doubtful = inDoubt()
		const retried = rentReducer(doubtful, confirmOf(doubtful))
		expect(retried.key).toBe(doubtful.key)
		for (const [code, http] of [['PROVIDER_UNAVAILABLE', 503], ['PRICE_ABOVE_MAX', 409], ['QUOTE_MISMATCH', 400], ['ADDRESS_NOT_ACTIVATED', 400], ['RATE_LIMITED', 429], ['KYC_REQUIRED', 403], ['WHATEVER', 400]]) {
			const after = rentReducer(retried, { type: 'failed', code, message: '', http })
			expect([code, after.key]).toEqual([code, doubtful.key])
			expect(after.doubt).toBe(true)
			expect(after.keySentAt).toBe(SENT_AT)
		}
	})

	it('ni dos cotizaciones caducadas seguidas', () => {
		const doubtful = inDoubt()
		const twice = run(doubtful, { type: 'failed', code: 'QUOTE_EXPIRED', message: '', http: 409 }, { type: 'failed', code: 'QUOTE_EXPIRED', message: '', http: 409 })
		expect(twice.key).toBe(doubtful.key)
		expect(twice.doubt).toBe(true)
	})

	it('solo la despeja una PRUEBA de que esa clave no dejó nada cobrado', () => {
		const doubtful = inDoubt()
		for (const [code, http] of [['INSUFFICIENT_BALANCE', 400], ['LIMIT_EXCEEDED', 403], ['DELIVERY_FAILED', 502]]) {
			const after = rentReducer(rentReducer(doubtful, confirmOf(doubtful)), { type: 'failed', code, message: '', http })
			expect([code, after.doubt]).toEqual([code, false])
			expect(after.key).not.toBe(doubtful.key)
			expect(after.keySentAt).toBeNull()
		}
	})

	it('o la orden misma: el replay de la clave la cierra', () => {
		const doubtful = inDoubt()
		const after = run(rentReducer(doubtful, confirmOf(doubtful)), { type: 'rented', order: order('completed'), http: 200, duplicate: true })
		expect(after).toMatchObject({ phase: 'done', doubt: false, charged: true, keySentAt: null })
	})

	it('cambiar de pedido en duda no pisa su clave: volver al mismo pedido vuelve a ella', () => {
		const doubtful = inDoubt()
		const other = { ...PARAMS, volume: 132_000 }
		const changed = rentReducer(doubtful, { type: 'setParams', params: other })
		expect(changed.key).toBe(doubtful.key)
		expect(changed.doubt).toBe(true)
		// El pedido distinto sale con otra clave (sería entregar una orden por otra)…
		expect(credentialsFor(changed).key).not.toBe(doubtful.key)
		// …y el mismo de antes, con la suya
		const back = rentReducer(changed, { type: 'setParams', params: PARAMS })
		expect(credentialsFor(back).key).toBe(doubtful.key)
	})

	it('comprar OTRO pedido deja atrás la duda del anterior', () => {
		const changed = rentReducer(inDoubt(), { type: 'setParams', params: { ...PARAMS, volume: 132_000 } })
		const sent = rentReducer(changed, { ...confirmOf(changed), at: SENT_AT + 60_000 })
		expect(sent).toMatchObject({ phase: 'renting', doubt: false, keySentAt: SENT_AT + 60_000 })
		expect(sent.keyParams).toContain('132000')
	})

	it('empezar de cero no la borra', () => {
		const doubtful = inDoubt()
		const reset = rentReducer(doubtful, { type: 'reset' })
		expect(reset).toMatchObject({ phase: 'idle', doubt: true, key: doubtful.key, keySentAt: SENT_AT })
	})

	it('un intento leído del disco (la app se cerró con la compra en vuelo) recupera su clave', () => {
		const start = initialRentState(PARAMS)
		const restored = rentReducer(start, { type: 'restore', key: 'clave-de-antes', params: PARAMS, at: SENT_AT })
		expect(restored).toMatchObject({ key: 'clave-de-antes', keyParams: paramsKeyOf(PARAMS), doubt: true, keySentAt: SENT_AT })
		expect(credentialsFor(restored).key).toBe('clave-de-antes')
		// Con una compra en vuelo o una duda de esta sesión, lo del disco no pisa nada
		const flying = confirmed(start)
		expect(rentReducer(flying, { type: 'restore', key: 'clave-de-antes', params: PARAMS, at: SENT_AT })).toBe(flying)
		const doubtful = inDoubt()
		expect(rentReducer(doubtful, { type: 'restore', key: 'clave-de-antes', params: PARAMS, at: SENT_AT })).toBe(doubtful)
	})
})

describe('la orden de un intento en duda, buscada en el historial', () => {

	const SINCE = Date.parse('2026-09-20T10:00:00.000Z')
	const attempt = { params: PARAMS, since: SINCE }

	it('la encuentra por dirección, volumen y duración, creada después de salir la compra', () => {
		const mine = order('dispatching', { uuid: 'mía', created_at: '2026-09-20T10:00:02.000Z' })
		const orders = [order('completed', { uuid: 'otra', volume: 132_000, created_at: '2026-09-20T10:00:05.000Z' }), mine]
		expect(findAttemptOrder(orders, attempt)).toBe(mine)
	})

	it('una igual pero de antes no es la suya', () => {
		const old = order('completed', { created_at: new Date(SINCE - ATTEMPT_CLOCK_SKEW_MS - 1).toISOString() })
		expect(findAttemptOrder([old], attempt)).toBeNull()
	})

	it('admite el desfase entre el reloj del teléfono y el del servidor', () => {
		const skewed = order('completed', { created_at: new Date(SINCE - ATTEMPT_CLOCK_SKEW_MS).toISOString() })
		expect(findAttemptOrder([skewed], attempt)).toBe(skewed)
	})

	it('ni otra dirección, ni otra duración, ni una fecha ilegible', () => {
		expect(findAttemptOrder([order('completed', { target_address: 'TOtraDireccion', created_at: '2026-09-20T10:00:02.000Z' })], attempt)).toBeNull()
		expect(findAttemptOrder([order('completed', { duration: '1d', created_at: '2026-09-20T10:00:02.000Z' })], attempt)).toBeNull()
		expect(findAttemptOrder([order('completed', { created_at: 'nope' })], attempt)).toBeNull()
		expect(findAttemptOrder([], attempt)).toBeNull()
	})

	it('el pedido de una clave se lee de vuelta', () => {
		expect(paramsFromKey(paramsKeyOf(PARAMS))).toEqual(PARAMS)
		expect(paramsFromKey('basura')).toBeNull()
		expect(paramsFromKey('T|x|1h')).toBeNull()
	})
})

describe('la nota en disco', () => {

	const NOW = 1_800_000_000_000
	const KEY = '1800000000000-abcdefgh-ijklmnop'

	it('dos casillas: la orden cobrada sin entregar y la compra que salió', () => {
		const raw = JSON.stringify({ order: { uuid: 'order-1', at: NOW - 1000 }, attempt: { key: KEY, params: PARAMS, at: NOW - 500 } })
		expect(parsePendingEnergy(raw, NOW)).toEqual({ order: { uuid: 'order-1', at: NOW - 1000 }, attempt: { key: KEY, params: PARAMS, at: NOW - 500 } })
	})

	it('acepta la nota de las versiones anteriores, que era solo la orden', () => {
		expect(parsePendingEnergy(JSON.stringify({ uuid: 'order-1', at: NOW - 1000 }), NOW)).toEqual({ order: { uuid: 'order-1', at: NOW - 1000 }, attempt: null })
	})

	it('lo que pasó de un día no cuenta, casilla a casilla', () => {
		const raw = JSON.stringify({ order: { uuid: 'order-1', at: NOW - PENDING_MAX_AGE_MS - 1 }, attempt: { key: KEY, params: PARAMS, at: NOW - 500 } })
		expect(parsePendingEnergy(raw, NOW)).toEqual({ order: null, attempt: { key: KEY, params: PARAMS, at: NOW - 500 } })
	})

	it('nada que no tenga la forma exacta', () => {
		const empty = { order: null, attempt: null }
		for (const raw of [null, '', 'no es json', '[]', '"texto"', '{}', JSON.stringify({ order: { uuid: 7, at: NOW } }), JSON.stringify({ attempt: { key: 'corta', params: PARAMS, at: NOW } }),
			JSON.stringify({ attempt: { key: KEY, params: { ...PARAMS, volume: '66000' }, at: NOW } }), JSON.stringify({ attempt: { key: KEY, params: { ...PARAMS, targetAddress: 'a|b' }, at: NOW } }),
			JSON.stringify({ attempt: { key: KEY, params: PARAMS, at: 'ayer' } })]) {
			expect([raw, parsePendingEnergy(raw, NOW)]).toEqual([raw, empty])
		}
	})
})
