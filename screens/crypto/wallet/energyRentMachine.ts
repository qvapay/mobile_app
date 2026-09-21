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
}

export type RentEvent =
	| { type: 'setParams', params: RentParams }
	| { type: 'quoting' }
	/** Precio listo. `null` = se compra al precio vivo, con techo `max_price_usd`. */
	| { type: 'quoted', quote: EnergyQuote | null }
	/** Confirma la compra con las credenciales ya resueltas por `credentialsFor`. */
	| { type: 'confirm', key: string, keyParams: string, quote: EnergyQuote | null }
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
	...patch,
})

export const rentReducer = (state: RentState, event: RentEvent): RentState => {

	switch (event.type) {

		case 'setParams': {
			const keyParams = paramsKeyOf(event.params)
			if (keyParams === state.keyParams && state.phase !== 'idle') { return { ...state, params: event.params } }
			// Cambiar de pedido con dinero en vuelo NO rota la clave: el que está
			// volando es el pedido viejo y su reintento tiene que seguir siendo él
			const rotate = keyParams !== state.keyParams && !IN_FLIGHT.includes(state.phase)
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
			// El estado guarda EXACTAMENTE lo que se va a mandar (ver `credentialsFor`)
			return { ...state, phase: 'renting', errorCode: null, errorMessage: null, key: event.key, keyParams: event.keyParams, quote: event.quote }

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
			const keep = shouldKeepKeyOnFailure({ code: event.code, http: event.http, quoteExpiredStreak })
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
				polls: 0,
				pollingSince: null,
			}
		}

		case 'reset':
			return initialRentState(state.params)

		default:
			return state
	}
}
