/**
 * Máquina del alquiler de energía TRON. Módulo PURO — sin React, sin red,
 * sin timers: solo `(estado, evento) → estado`. Testeado en node.
 *
 * Está fuera del hook porque aquí vive todo lo que puede costar dinero dos
 * veces, y eso merece tests deterministas:
 *
 * 1. **La clave de idempotencia.** El backend la namespacea por usuario y
 *    endpoint, NO por payload: si el usuario prueba 66.000/1h, falla, y luego
 *    pide 132.000/1d con la misma clave, la respuesta es `200 duplicate:true`
 *    con la orden VIEJA. Cree que compró lo segundo y tiene lo primero. De
 *    ahí que la clave se ate a los parámetros y rote al cambiarlos.
 * 2. **El 202 que no cierra.** Un polling sin final es un bucle contra un
 *    endpoint que además hace trabajo real (confirma la orden preguntando al
 *    proveedor). Con tope de tiempo, el estado final es `slow`: cobrada y en
 *    curso, visible en el historial — nunca un camino que invite a comprar
 *    otra vez.
 * 3. **La duda.** Una compra que se quedó sin respuesta PUDO cobrarse. Hasta
 *    que algo lo aclare, su clave no se rota por ningún rechazo posterior: el
 *    backend valida precio, cotización y proveedor ANTES de buscar la orden por
 *    clave, así que un reintento puede topar con `PROVIDER_UNAVAILABLE` o
 *    `PRICE_ABOVE_MAX` con la orden ya cobrada. Rotar ahí era un segundo cargo.
 */
import { makeIdempotencyKey } from '../../../helpers/idempotency'
import type { EnergyDuration, EnergyOrder, EnergyQuote } from '../../../types/domain'

export type RentPhase =
	/** Nada en marcha. */
	| 'idle'
	/** Pidiendo precio congelado. */
	| 'quoting'
	/** Precio en pantalla, esperando al usuario. */
	| 'confirming'
	/** `POST /rent` en vuelo: el saldo puede haber salido ya. */
	| 'renting'
	/** 202: cobrada, esperando a que el proveedor entregue. */
	| 'polling'
	/** Energía delegada. */
	| 'done'
	/** Cobrada pero sin cerrar en el tiempo razonable (o en revisión manual). */
	| 'slow'
	/** No se compró nada, o se compró y se devolvió el saldo. */
	| 'failed'

export type RentParams = { targetAddress: string, volume: number, duration: EnergyDuration }

export type RentState = {
	phase: RentPhase
	params: RentParams
	/** Clave de idempotencia del pedido en curso. */
	key: string
	/** Parámetros con los que nació esa clave (si cambian, la clave ya no vale). */
	keyParams: string
	quote: EnergyQuote | null
	order: EnergyOrder | null
	/** Código del backend, que es lo que elige el copy. */
	errorCode: string | null
	errorMessage: string | null
	/** El saldo ya salió de la cuenta (201/202), aunque la entrega no haya cerrado. */
	charged: boolean
	polls: number
	/** Momento en que empezó la espera, para el tope de tiempo. */
	pollingSince: number | null
	/** Dos cotizaciones caducadas seguidas: algo va mal, se rota la clave por si acaso. */
	quoteExpiredStreak: number
	/** Cuándo salió por primera vez una compra con esta clave (ms); null si aún no salió ninguna. */
	keySentAt: number | null
	/**
	 * La compra de `key` PUDO cobrarse y no se sabe: se quedó sin respuesta, o la contestó
	 * la infraestructura. Mientras dure, esa clave no se rota por nada que no PRUEBE que no
	 * dejó una orden (`NO_CHARGE_CODES`) y el mismo pedido se repite siempre con ella.
	 */
	doubt: boolean
}

export type RentEvent =
	| { type: 'setParams', params: RentParams }
	| { type: 'quoting' }
	/** Precio listo. `null` = se compra al precio vivo, con techo `max_price_usd`. */
	| { type: 'quoted', quote: EnergyQuote | null }
	/** Confirma la compra con las credenciales ya resueltas por `credentialsFor`. `at`: cuándo sale. */
	| { type: 'confirm', key: string, keyParams: string, quote: EnergyQuote | null, at?: number }
	/** Un intento que quedó en duda en una sesión anterior (leído del disco). */
	| { type: 'restore', key: string, params: RentParams, at: number }
	/** Respuesta 2xx de `POST /rent`. `http` distingue el 201 del 202. */
	| { type: 'rented', order: EnergyOrder, http: number, duplicate?: boolean }
	| { type: 'polled', order: EnergyOrder }
	/** Latido del reloj: es lo único que puede vencer un plazo. */
	| { type: 'tick', now: number }
	/** Fallo con el código del backend; `http` ausente = no hubo respuesta (red). */
	| { type: 'failed', code: string | null, message: string, http?: number }
	| { type: 'reset' }

/** Tope de la espera del 202. Pasado esto la orden no se abandona: se manda al historial. */
export const POLL_DEADLINE_MS = 120_000

/** Espera entre consultas: corta al principio, con techo para no castigar al backend. */
export const pollDelayMs = (polls: number): number => (polls <= 0 ? 2_000 : polls === 1 ? 3_000 : 5_000)

export const paramsKeyOf = ({ targetAddress, volume, duration }: RentParams): string => `${targetAddress}|${volume}|${duration}`

/** El pedido que describe un `keyParams`; null si no tiene esa forma. */
export const paramsFromKey = (keyParams: string): RentParams | null => {
	const parts = keyParams.split('|')
	const volume = Number(parts[1])
	if (parts.length !== 3 || !parts[0] || !Number.isFinite(volume) || !parts[2]) { return null }
	return { targetAddress: parts[0], volume, duration: parts[2] as EnergyDuration }
}

/**
 * Códigos tras los que la clave se CONSERVA. Todos comparten lo mismo: o no
 * llegaron a crear una orden, o la crearon y reintentar con la misma clave es
 * justo lo que evita el doble cobro.
 *
 * `QUOTE_EXPIRED` entra aquí porque el backend lo responde ANTES de tocar la
 * idempotencia (ni fila en base de datos ni reserva en Redis): la clave queda
 * virgen. Dos seguidos, en cambio, huelen a clave envenenada y la rotan.
 */
const KEEP_KEY_CODES = new Set(['DUPLICATE_REQUEST', 'RATE_LIMITED', 'QUOTE_EXPIRED'])

/**
 * ¿Se conserva la clave tras este fallo?
 *
 * La pregunta de fondo es siempre la misma: **¿pudo haberse cobrado?** Si la
 * respuesta es "no lo sé", la clave se conserva, porque reintentar con ella es
 * lo único que convierte un posible doble cobro en un replay inofensivo.
 *
 * - Sin respuesta HTTP (red, timeout del cliente): pudo llegar → conservar.
 * - 5xx sin código NUESTRO: es infraestructura (un 502/504 de gateway con
 *   cuerpo HTML), el caso canónico de "¿se cobró?" → conservar. Ojo: el 502
 *   `DELIVERY_FAILED` sí trae código y sí rota, porque ahí el backend nos dice
 *   que devolvió el saldo y reintentar es una orden nueva.
 * - 4xx conocidos que no materializan nada → conservar.
 * - Todo lo demás (validación, límites, códigos desconocidos) → rotar.
 */
export const shouldKeepKeyOnFailure = ({ code, http, quoteExpiredStreak }: { code: string | null, http?: number, quoteExpiredStreak: number }): boolean => {
	if (http === undefined) { return true }
	if (code === 'QUOTE_EXPIRED') { return quoteExpiredStreak < 2 }
	if (code !== null && KEEP_KEY_CODES.has(code)) { return true }
	return code === null && http >= 500
}

/** ¿Pudo cobrarse sin que lo sepamos? Sin respuesta, o un 5xx que no trae código nuestro. */
export const isAmbiguousFailure = ({ code, http }: { code: string | null, http?: number }): boolean =>
	http === undefined || (code === null && http >= 500)

/**
 * Códigos que PRUEBAN que la clave no dejó una orden cobrada. El backend da
 * `INSUFFICIENT_BALANCE` y `LIMIT_EXCEEDED` DESPUÉS de buscar la orden por clave (no existía
 * y no se creó), y `DELIVERY_FAILED` tras devolver el saldo. Cualquier otro rechazo puede
 * salir antes de esa búsqueda (precio, cotización, validación, proveedor caído, límite de
 * peticiones) y no dice nada de un intento anterior con la misma clave.
 */
const NO_CHARGE_CODES = new Set(['INSUFFICIENT_BALANCE', 'LIMIT_EXCEEDED', 'DELIVERY_FAILED'])

/** Holgura entre el reloj del teléfono y el del servidor al buscar la orden de un intento. */
export const ATTEMPT_CLOCK_SKEW_MS = 5 * 60_000

/**
 * ¿Está entre estas órdenes la del intento en duda? Misma dirección, volumen y duración, y
 * creada después de que saliera la petición (con holgura de reloj).
 *
 * Solo PRUEBA el cobro cuando la encuentra. No encontrarla no dice que no se cobrara: el
 * servidor pudo crearla después de esta consulta. Por eso la duda no se despeja con un «no
 * está», y el mismo pedido sigue saliendo con la misma clave.
 */
export const findAttemptOrder = (orders: EnergyOrder[], attempt: { params: RentParams, since: number }): EnergyOrder | null =>
	orders.find(order => order.target_address === attempt.params.targetAddress
		&& Number(order.volume) === attempt.params.volume
		&& order.duration === attempt.params.duration
		&& Date.parse(order.created_at) >= attempt.since - ATTEMPT_CLOCK_SKEW_MS) ?? null

/** Una orden ya no va a cambiar: ni polling ni reintentos la mueven. */
export const isTerminalOrder = (order: EnergyOrder | null): boolean =>
	order?.status === 'completed' || order?.status === 'refunded'

/**
 * Con qué clave y con qué cotización sale esta compra.
 *
 * `setParams` NO rota la clave si hay dinero en vuelo: el vuelo es del pedido
 * viejo y su reintento tiene que seguir siendo él. Pero entonces `state.params`
 * y `state.keyParams` quedan describiendo pedidos distintos, y mandar el nuevo
 * bajo la clave vieja hace que el backend replique la orden ANTERIOR como
 * `duplicate: true` — el usuario cree que compró lo segundo y tiene lo primero,
 * que es el peligro número uno de este módulo.
 *
 * Este es el último punto donde se puede poner al día, y lo resuelve el mismo
 * valor que el hook mete en la petición: lo que se guarda es lo que se manda.
 */
export const credentialsFor = (state: RentState): { key: string, keyParams: string, quote: EnergyQuote | null } => {
	const keyParams = paramsKeyOf(state.params)
	if (keyParams === state.keyParams) { return { key: state.key, keyParams, quote: state.quote } }
	// Pedido distinto: clave nueva, y la cotización vieja ya no vale (el backend
	// la rechazaría con QUOTE_MISMATCH por volumen o duración)
	return { key: makeIdempotencyKey(), keyParams, quote: null }
}

export const initialRentState = (params: RentParams): RentState => ({
	phase: 'idle',
	params,
	key: makeIdempotencyKey(),
	keyParams: paramsKeyOf(params),
	quote: null,
	order: null,
	errorCode: null,
	errorMessage: null,
	charged: false,
	polls: 0,
	pollingSince: null,
	quoteExpiredStreak: 0,
	keySentAt: null,
	doubt: false,
})

/** Fases en las que hay una petición de dinero en vuelo: nada puede tocar la clave. */
const IN_FLIGHT: RentPhase[] = ['renting', 'polling']

/** Tras cerrar un pedido, el siguiente empieza de cero (clave nueva incluida). */
const settled = (state: RentState, patch: Partial<RentState>): RentState => ({
	...state,
	key: makeIdempotencyKey(),
	keyParams: paramsKeyOf(state.params),
	quote: null,
	polls: 0,
	pollingSince: null,
	quoteExpiredStreak: 0,
	keySentAt: null,
	doubt: false,
	...patch,
})

export const rentReducer = (state: RentState, event: RentEvent): RentState => {

	switch (event.type) {

		case 'setParams': {
			const keyParams = paramsKeyOf(event.params)
			if (keyParams === state.keyParams && state.phase !== 'idle') { return { ...state, params: event.params } }
			// Cambiar de pedido con dinero en vuelo NO rota la clave: el que está
			// volando es el pedido viejo y su reintento tiene que seguir siendo él.
			// Con un pedido EN DUDA tampoco: si se vuelve a pedir lo mismo, tiene que
			// salir con su clave (`credentialsFor` ya da una nueva al pedido distinto)
			const rotate = keyParams !== state.keyParams && !IN_FLIGHT.includes(state.phase) && !state.doubt
			return {
				...state,
				params: event.params,
				key: rotate ? makeIdempotencyKey() : state.key,
				keyParams: rotate ? keyParams : state.keyParams,
				quote: rotate ? null : state.quote,
				phase: IN_FLIGHT.includes(state.phase) ? state.phase : 'idle',
				errorCode: null,
				errorMessage: null,
			}
		}

		case 'quoting':
			// Recotizar con dinero en vuelo no puede devolver la UI a un estado
			// que ofrezca confirmar otra vez
			if (IN_FLIGHT.includes(state.phase)) { return state }
			return { ...state, phase: 'quoting', errorCode: null, errorMessage: null }

		case 'quoted':
			if (IN_FLIGHT.includes(state.phase)) { return { ...state, quote: event.quote } }
			return { ...state, phase: 'confirming', quote: event.quote }

		case 'confirm':
			// Doble tap: si ya hay dinero en vuelo, el segundo toque no existe
			if (IN_FLIGHT.includes(state.phase)) { return state }
			// El estado guarda EXACTAMENTE lo que se va a mandar (ver `credentialsFor`).
			// Con la misma clave sigue siendo el mismo pedido: conserva su duda y cuándo
			// salió por primera vez. Con otra, es una compra nueva
			return {
				...state,
				phase: 'renting',
				errorCode: null,
				errorMessage: null,
				key: event.key,
				keyParams: event.keyParams,
				quote: event.quote,
				keySentAt: event.key === state.key && state.keySentAt !== null ? state.keySentAt : event.at ?? null,
				doubt: event.key === state.key ? state.doubt : false,
			}

		case 'restore': {
			// Solo en reposo, y nunca encima de una duda propia de esta sesión
			if (IN_FLIGHT.includes(state.phase) || state.doubt) { return state }
			return { ...state, key: event.key, keyParams: paramsKeyOf(event.params), quote: null, keySentAt: event.at, doubt: true, quoteExpiredStreak: 0 }
		}

		case 'rented': {
			// 201 entregada · 202 cobrada y en curso · 200 replay de una clave ya
			// usada. En los tres casos el saldo salió y la clave queda quemada.
			const order = event.order
			const phase: RentPhase = order.status === 'completed' ? 'done'
				: order.status === 'refunded' ? 'failed'
					: order.status === 'needs_review' ? 'slow'
						: 'polling'
			return settled(state, {
				phase,
				order,
				charged: order.status !== 'refunded',
				errorCode: order.status === 'refunded' ? 'REFUNDED' : null,
			})
		}

		case 'polled': {
			if (state.phase !== 'polling') { return { ...state, order: event.order } }
			if (event.order.status === 'completed') { return { ...state, phase: 'done', order: event.order, errorCode: null } }
			if (event.order.status === 'refunded') { return { ...state, phase: 'failed', order: event.order, errorCode: 'REFUNDED', charged: false } }
			if (event.order.status === 'needs_review') { return { ...state, phase: 'slow', order: event.order } }
			return { ...state, order: event.order, polls: state.polls + 1 }
		}

		case 'tick': {
			if (state.phase !== 'polling') { return state }
			if (state.pollingSince === null) { return { ...state, pollingSince: event.now } }
			if (event.now - state.pollingSince < POLL_DEADLINE_MS) { return state }
			// Cobrada y sin cerrar: al historial, NUNCA de vuelta a una compra
			return { ...state, phase: 'slow' }
		}

		case 'failed': {
			const quoteExpiredStreak = event.code === 'QUOTE_EXPIRED' ? state.quoteExpiredStreak + 1 : 0
			// La duda nace de una COMPRA sin respuesta clara (un fallo al cotizar no cobra
			// nada) y solo la despeja una prueba; la orden misma llega por `rented`
			const proven = event.code !== null && NO_CHARGE_CODES.has(event.code)
			const doubt = !proven && (state.doubt || (state.phase === 'renting' && isAmbiguousFailure(event)))
			const keep = doubt || shouldKeepKeyOnFailure({ code: event.code, http: event.http, quoteExpiredStreak })
			// El 502 devolvió el saldo: reintentar es una orden NUEVA, no la misma
			const charged = event.code === 'DELIVERY_FAILED' ? false : state.charged
			return {
				...state,
				phase: 'failed',
				errorCode: event.code,
				errorMessage: event.message,
				charged,
				key: keep ? state.key : makeIdempotencyKey(),
				keyParams: keep ? state.keyParams : paramsKeyOf(state.params),
				quote: event.code === 'QUOTE_EXPIRED' ? null : state.quote,
				quoteExpiredStreak,
				keySentAt: keep ? state.keySentAt : null,
				doubt,
				polls: 0,
				pollingSince: null,
			}
		}

		case 'reset':
			// Empezar de cero no borra una duda: su clave es lo que evita el segundo cargo
			return state.doubt
				? { ...initialRentState(state.params), key: state.key, keyParams: state.keyParams, keySentAt: state.keySentAt, doubt: true }
				: initialRentState(state.params)

		default:
			return state
	}
}

// ---------------------------------------------------------------------------
// La nota en disco: forma y caducidad (el disco está en `energyPending.ts`)
// ---------------------------------------------------------------------------

/** Pasado esto una nota se considera caduca: la orden ya estará resuelta en el historial. */
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Una orden cobrada (202) cuya entrega sigue en curso. */
export type PendingEnergyOrder = { uuid: string, at: number }
/** Una compra que salió hacia el servidor: su clave, su pedido y cuándo salió por primera vez. */
export type PendingEnergyAttempt = { key: string, params: RentParams, at: number }
export type PendingEnergy = { order: PendingEnergyOrder | null, attempt: PendingEnergyAttempt | null }

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._-]{8,64}$/

/**
 * Lo que hay en disco → lo que se puede usar: nada que no tenga la forma exacta ni lo que
 * pasó de un día. Acepta la nota de las versiones anteriores, que era solo `{ uuid, at }`.
 */
export const parsePendingEnergy = (raw: string | null | undefined, now: number): PendingEnergy => {
	const empty: PendingEnergy = { order: null, attempt: null }
	if (!raw) { return empty }
	let parsed: unknown
	try { parsed = JSON.parse(raw) } catch { return empty }
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { return empty }

	const fresh = (at: unknown): at is number => typeof at === 'number' && Number.isFinite(at) && now - at <= PENDING_MAX_AGE_MS
	const text = (value: unknown): value is string => typeof value === 'string' && value !== '' && !value.includes('|')

	const orderOf = (value: unknown): PendingEnergyOrder | null => {
		const order = value as { uuid?: unknown, at?: unknown } | null
		return order && typeof order === 'object' && text(order.uuid) && fresh(order.at) ? { uuid: order.uuid, at: order.at } : null
	}
	const attemptOf = (value: unknown): PendingEnergyAttempt | null => {
		const attempt = value as { key?: unknown, params?: unknown, at?: unknown } | null
		if (!attempt || typeof attempt !== 'object' || typeof attempt.key !== 'string' || !IDEMPOTENCY_KEY.test(attempt.key) || !fresh(attempt.at)) { return null }
		const params = attempt.params as { targetAddress?: unknown, volume?: unknown, duration?: unknown } | null
		if (!params || typeof params !== 'object' || !text(params.targetAddress) || !text(params.duration)) { return null }
		if (typeof params.volume !== 'number' || !Number.isFinite(params.volume) || params.volume <= 0) { return null }
		return { key: attempt.key, params: { targetAddress: params.targetAddress, volume: params.volume, duration: params.duration as EnergyDuration }, at: attempt.at }
	}

	const record = parsed as Record<string, unknown>
	// Versiones anteriores: la nota entera era la orden
	if ('uuid' in record) { return { order: orderOf(record), attempt: null } }
	return { order: orderOf(record.order), attempt: attemptOf(record.attempt) }
}
