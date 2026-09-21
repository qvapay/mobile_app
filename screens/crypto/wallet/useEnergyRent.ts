/**
 * Compra de energía TRON: efectos, relojes y disco alrededor de la máquina
 * pura de `energyRentMachine.ts`.
 *
 * Es una mutación de DINERO, así que sigue las reglas de las otras
 * (SendConfirm, Withdraw, swap): llamada directa al módulo de `api/` —nunca
 * React Query—, clave de idempotencia estable en todo reintento del mismo
 * pedido, y `callWithDuplicateRetry` para el 409 "ya hay una idéntica en
 * curso".
 *
 * Dos plazos gobiernan la espera: el del `202` (la orden se cobró y el
 * proveedor aún no entregó) y el de la cotización congelada, que dura 90 s y
 * se renueva sola mientras el usuario decide.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'

// API
import { energyApi } from '../../../api/energyApi'
import { callWithDuplicateRetry } from '../../../helpers/idempotency'
import type { ApiFailure } from '../../../types/api'

// Auth (el alquiler sale del saldo QvaPay)
import { useAuth } from '../../../auth/AuthContext'

// Estado
import { credentialsFor, initialRentState, isTerminalOrder, pollDelayMs, rentReducer } from './energyRentMachine'
import type { RentParams, RentState } from './energyRentMachine'
import { clearPendingOrder, savePendingOrder } from './energyPending'
import { ENERGY_ORDERS_KEY } from './energyQueries'
import { WALLET_TRON_RESOURCES_KEY } from './walletQueries'
import { HOME_QUERY_KEY } from '../../home/homeQueries'
import type { EnergyDuration, EnergyOrder } from '../../../types/domain'

/** Margen del techo de precio sobre lo cotizado: la red se mueve, pero no tanto. */
const MAX_PRICE_MARGIN = 1.02

/** Con menos de esto por delante, la cotización se renueva sola. */
const REQUOTE_BEFORE_MS = 15_000

/**
 * Respiro mínimo entre recotizaciones. Sin él, una cotización que naciera ya
 * dentro de la ventana de renovación —reloj del móvil adelantado respecto al
 * servidor, o un TTL corto— encadenaría `quoted → confirming → begin()` sin
 * pausa, martilleando `/quote` hasta que el rate limit del backend corta y el
 * usuario se queda mirando un error que no entiende.
 */
const REQUOTE_MIN_GAP_MS = 5_000

type Args = {
	targetAddress: string
	volume: number
	duration: EnergyDuration
	/** Precio publicado o estimado: pinta antes de cotizar y fija el techo. */
	estimatedUsd: number | null
	/** Congelar el precio con `/quote` antes de comprar (pantalla de recursos). */
	freezePrice?: boolean
	/** El modal está abierto. Cerrado, el hook no pide nada. */
	active: boolean
	/** La energía ya está delegada en la dirección. */
	onRented?: (order: EnergyOrder) => void
	/**
	 * Se cobró algo por este pedido, esté entregado o no. Quien ofrece la
	 * compra tiene que dejar de ofrecerla AQUÍ, no al entregarse: una orden
	 * que acaba en `slow` nunca llega a `onRented` y el CTA volvería a salir.
	 */
	onCharged?: (order: EnergyOrder) => void
}

/** Un 2xx sin cuerpo: no pasa, pero si pasara dejaría la compra colgada para siempre. */
const EMPTY_BODY = { code: 'EMPTY_BODY', message: '' }

/** Fallo del backend traducido a lo que necesita la máquina: código, mensaje y HTTP. */
const failureOf = (result: ApiFailure): { code: string | null, message: string, http?: number } => ({
	code: (result.details as { code?: string } | null | undefined)?.code ?? null,
	message: result.error || '',
	http: result.status,
})

export const useEnergyRent = ({ targetAddress, volume, duration, estimatedUsd, freezePrice = false, active, onRented, onCharged }: Args) => {

	const queryClient = useQueryClient()
	const { user, updateUser } = useAuth()

	const params = useMemo<RentParams>(() => ({ targetAddress, volume, duration }), [targetAddress, volume, duration])
	const [state, dispatch] = useReducer(rentReducer, params, initialRentState)

	// Espejo del estado para leer la clave y la cotización sin re-crear callbacks
	const stateRef = useRef<RentState>(state)
	useEffect(() => { stateRef.current = state }, [state])

	const inFlightRef = useRef(false)
	const notifiedRef = useRef<string | null>(null)
	const chargedRef = useRef<string | null>(null)
	const onRentedRef = useRef(onRented)
	const onChargedRef = useRef(onCharged)
	useEffect(() => { onRentedRef.current = onRented }, [onRented])
	useEffect(() => { onChargedRef.current = onCharged }, [onCharged])

	useEffect(() => { dispatch({ type: 'setParams', params }) }, [params])

	// --- Precio -------------------------------------------------------------

	const begin = useCallback(async () => {
		if (!freezePrice) { dispatch({ type: 'quoted', quote: null }); return }
		dispatch({ type: 'quoting' })
		const result = await energyApi.quote(volume, duration)
		if (result.success && result.data?.data) { dispatch({ type: 'quoted', quote: result.data.data }) }
		// Un 2xx sin cuerpo dejaría la fase colgada: cuenta como fallo genérico
		else { dispatch({ type: 'failed', ...(result.success ? EMPTY_BODY : failureOf(result)) }) }
	}, [freezePrice, volume, duration])

	useEffect(() => { if (active) { begin() } }, [active, begin])

	// Cuenta atrás de la cotización congelada, que se renueva sola antes de caducar
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		if (!active || state.phase !== 'confirming' || !state.quote) { return }
		const id = setInterval(() => setNow(Date.now()), 1_000)
		return () => clearInterval(id)
	}, [active, state.phase, state.quote])

	const quoteExpiresAt = state.quote ? Date.parse(state.quote.expires_at) : null
	const quoteSecondsLeft = quoteExpiresAt ? Math.max(0, Math.round((quoteExpiresAt - now) / 1000)) : null

	const lastRequoteRef = useRef(0)
	useEffect(() => {
		if (!active || state.phase !== 'confirming' || !quoteExpiresAt) { return }
		// El reloj se lee aquí y no del estado `now`, que deja de avanzar mientras
		// se cotiza y dejaría este efecto comparando contra un valor congelado
		const stamp = Date.now()
		if (quoteExpiresAt - stamp > REQUOTE_BEFORE_MS) { return }
		if (stamp - lastRequoteRef.current < REQUOTE_MIN_GAP_MS) { return }
		lastRequoteRef.current = stamp
		begin()
	}, [active, state.phase, quoteExpiresAt, now, begin])

	const priceUsd = state.quote?.price_usd ?? estimatedUsd

	// --- Compra -------------------------------------------------------------

	const confirm = useCallback(async () => {
		if (inFlightRef.current) { return }
		const current = stateRef.current
		if (current.phase === 'renting' || current.phase === 'polling') { return }
		// Lo que se manda y lo que se guarda salen del MISMO sitio
		const { key, keyParams, quote } = credentialsFor(current)
		const price = quote?.price_usd ?? estimatedUsd
		inFlightRef.current = true
		dispatch({ type: 'confirm', key, keyParams, quote })
		try {
			const result = await callWithDuplicateRetry(() => energyApi.rent({
				targetAddress: current.params.targetAddress,
				volume: current.params.volume,
				duration: current.params.duration,
				idempotencyKey: key,
				quoteId: quote?.quote_id,
				// Se manda SIEMPRE, incluso con cotización: es la protección que no caduca
				maxPriceUsd: typeof price === 'number' ? Math.ceil(price * MAX_PRICE_MARGIN * 100) / 100 : undefined,
			}))

			if (result.success && result.data?.data) {
				const { data: order, balance, duplicate } = result.data
				dispatch({ type: 'rented', order, http: result.status ?? 200, duplicate })
				// El backend devuelve el saldo ya debitado; el replay de una clave no
				if (typeof balance === 'number') { updateUser({ balance }) }
				else if (!duplicate && typeof price === 'number') { updateUser({ balance: Number(user?.balance || 0) - price }) }
				queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY })
				queryClient.invalidateQueries({ queryKey: ENERGY_ORDERS_KEY })
				// Cobrada y sin cerrar: la nota en disco es lo que impide que, tras
				// un cierre de app, el usuario no sepa si pagó y vuelva a comprar
				if (!isTerminalOrder(order)) { savePendingOrder(order.uuid) }
			} else {
				dispatch({ type: 'failed', ...(result.success ? EMPTY_BODY : failureOf(result)) })
			}
		} finally {
			inFlightRef.current = false
		}
	}, [estimatedUsd, queryClient, updateUser, user?.balance])

	// --- Espera del 202 -----------------------------------------------------

	// Los temporizadores de RN se estrangulan en segundo plano: al volver, se
	// consulta ya, sin esperar al siguiente latido
	const [wake, setWake] = useState(0)
	useEffect(() => {
		const sub = AppState.addEventListener('change', next => { if (next === 'active') { setWake(value => value + 1) } })
		return () => sub.remove()
	}, [])

	const wakeRef = useRef(wake)
	const uuid = state.order?.uuid
	const polls = state.polls
	const polling = state.phase === 'polling'

	useEffect(() => {
		if (!polling || !uuid) { return }
		const woke = wakeRef.current !== wake
		wakeRef.current = wake
		// Sella el inicio de la espera (el tope de tiempo cuenta desde aquí)
		dispatch({ type: 'tick', now: Date.now() })
		let cancelled = false
		const id = setTimeout(async () => {
			const result = await energyApi.order(uuid)
			if (cancelled) { return }
			dispatch({ type: 'tick', now: Date.now() })
			if (result.success && result.data?.data) { dispatch({ type: 'polled', order: result.data.data }) }
			else if (stateRef.current.order) { dispatch({ type: 'polled', order: stateRef.current.order }) }
		}, woke ? 0 : pollDelayMs(polls))
		return () => { cancelled = true; clearTimeout(id) }
	}, [polling, uuid, polls, wake])

	// --- Cierre -------------------------------------------------------------

	const phase = state.phase
	const order = state.order
	const charged = state.charged

	/**
	 * El aviso: se ha COBRADO algo para este pedido.
	 *
	 * Va atado al cobro y no a la entrega a propósito. Quien escucha esto
	 * (la pantalla de enviar) lo usa para no volver a ofrecer la compra, y una
	 * orden que se queda en `slow` —cobrada, sin entregar en el plazo— es
	 * exactamente el caso en el que reofrecerla sería un segundo cargo real.
	 */
	useEffect(() => {
		if (!charged || !order || chargedRef.current === order.uuid) { return }
		chargedRef.current = order.uuid
		onChargedRef.current?.(order)
	}, [charged, order])

	useEffect(() => {
		if (phase !== 'done' && phase !== 'failed' && phase !== 'slow') { return }
		// La nota en disco solo se borra cuando la orden ya no puede sorprender:
		// entregada, o sin cobro vivo (nunca se cobró, o se reembolsó). En `slow`
		// se queda, que es justo para lo que existe.
		if (phase === 'done' || !charged) { clearPendingOrder() }
		if (phase !== 'done' || !order || notifiedRef.current === order.uuid) { return }
		notifiedRef.current = order.uuid
		queryClient.invalidateQueries({ queryKey: WALLET_TRON_RESOURCES_KEY })
		onRentedRef.current?.(order)
	}, [phase, order, charged, queryClient])

	const retry = useCallback(() => {
		// Una cotización caducada se recotiza; el resto reintenta la compra con
		// la misma clave (o con una nueva, según lo que decidió la máquina)
		if (state.quote === null && freezePrice) { begin(); return }
		if (state.phase === 'failed' && state.errorCode === 'QUOTE_EXPIRED') { begin(); return }
		confirm()
	}, [state.quote, state.phase, state.errorCode, freezePrice, begin, confirm])

	return { state, priceUsd, quoteSecondsLeft, confirm, retry, reset: useCallback(() => dispatch({ type: 'reset' }), []) }
}

export default useEnergyRent
