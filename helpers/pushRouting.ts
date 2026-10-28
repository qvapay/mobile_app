/**
 * Traducción del payload de una notificación push (`additionalData`) a lo que
 * la app tiene que hacer con ella: si es dinero entrante (para la moneda) y a
 * qué pantalla lleva el toque.
 *
 * Existe porque los tipos que manda el backend (`transfer_received`,
 * `p2p_applied`, `cart_stage`…) NO son los que miraba la app (`transaction`,
 * `transfer`, `p2p`), ni el uuid viaja en la misma clave (`transaction_uuid` /
 * `p2p_uuid`, no `uuid`): con la comparación vieja un cobro sonaba con el tono
 * genérico y al tocarlo no navegaba a ninguna parte. Los tipos legacy se
 * siguen aceptando por si llega una push encolada de antes.
 */

import { ROUTES } from '../routes'
import { resolveDeepLinkTarget } from './deepLinkTarget'

/** `data` de una push de QvaPay (el `additionalData` de la era OneSignal). */
export type PushData = {
	type?: string
	/** Delivery id del backend propio (`POST /push/events` lo referencia). */
	did?: string
	/** id del mensaje en la bandeja (`GET /push/inbox`). */
	mid?: string
	/** Campaña (broadcast) a la que pertenece la push; `''` si es transaccional. */
	cid?: string
	/** `qvapay://…` que abre el toque; manda sobre el enrutado por `type`. */
	deeplink?: string
	/** La misma ruta como URL web (compatibilidad con builds anteriores); la app enruta por `deeplink`. */
	url?: string
	/** Imagen grande (Android la pinta el sistema; iOS vía la Notification Service Extension). */
	image?: string
	/** Legacy: uuid genérico, interpretado según el tipo. */
	uuid?: string
	transaction_uuid?: string
	p2p_uuid?: string
	order_uuid?: string
	/** `p2p_partial_dispute_resolved`: cómo acabó la disputa (`released` | `cancelled`). */
	resolution?: string
	cart_id?: string | number
	/** `p2p_promo_*`: el puesto (hoy el backend solo manda `type`; si llegan, abren ese par). */
	coin?: string
	offer_type?: string
} | undefined | null

/** Destino de navegación de una push, ya resuelto a ruta + params. */
export type PushTarget = { screen: string, params?: Record<string, unknown> }

/** Tipos que anuncian dinero que ENTRA en la cuenta (los que suenan a moneda). */
const MONEY_IN_TYPES = [
	'transfer_received',
	'p2p_completed',
	'p2p_partial_completed',
	// Legacy (pushes emitidas antes de que el backend tipara el evento)
	'transaction',
	'transfer',
]

/** Tipos que salen por el canal `qp_money_out` (dinero que SALE de la cuenta). */
const MONEY_OUT_TYPES = ['transfer_sent', 'invite_sent']

/**
 * Tipos que llevan al detalle de una transacción. NO se derivan de
 * `MONEY_IN_TYPES`: un P2P completado también es dinero entrante, pero su
 * pantalla es la oferta, no la transacción.
 */
const TRANSACTION_TYPES = ['transfer_received', 'transfer_sent', 'invite_sent', 'transaction_comment', 'transaction', 'transfer']

/** ¿Esta push anuncia dinero entrante? */
export const isMoneyInPush = (data: PushData): boolean => !!data?.type && MONEY_IN_TYPES.includes(data.type)

/**
 * ¿Viene por uno de los canales con sonido de moneda (`qp_money_in` /
 * `qp_money_out` de MainApplication.kt, que el backend pide con
 * `existing_android_channel_id`)?
 *
 * Sirve para NO publicarla en la bandeja con la app delante: el canal la haría
 * sonar por segunda vez encima del sonido que ya reproduce la app.
 */
export const isMoneySoundPush = (data: PushData): boolean => isMoneyInPush(data)
	|| (!!data?.type && MONEY_OUT_TYPES.includes(data.type))

/** uuid de la transacción que trae la push, en cualquiera de sus dos claves. */
export const pushTransactionUuid = (data: PushData): string | undefined => data?.transaction_uuid || data?.uuid

/**
 * Pushes que cierran un trato P2P y piden valorarlo: abren el detalle con `rate`
 * para que la hoja de valoración salga sola (si aún no se valoró). Una disputa
 * resuelta solo se valora si acabó liberada (`released`); cancelada, no.
 */
const isRatePromptPush = (data: PushData): boolean => {
	const type = data?.type
	if (type === 'p2p_completed' || type === 'p2p_partial_completed') return true
	return type === 'p2p_partial_dispute_resolved' && data?.resolution === 'released'
}

/**
 * Pantalla a la que lleva tocar la notificación.
 *
 * @param data - `additionalData` de la push.
 * @returns Ruta y params, o `null` si el tipo no tiene destino propio.
 */
export const resolvePushTarget = (data: PushData): PushTarget | null => {

	const type = data?.type
	if (!type) return null

	// Puesto promocionado (te superaron, ganaste, terminó, vence pronto): no es un trato,
	// así que va ANTES del resto de `p2p*`, que exige un p2p_uuid
	if (type.startsWith('p2p_promo')) {
		const coin = data?.coin ? String(data.coin) : undefined
		const offerType = data?.offer_type === 'sell' || data?.offer_type === 'buy' ? data.offer_type : undefined
		return { screen: ROUTES.P2P_PROMOTE, params: { ...(coin ? { coin } : {}), ...(offerType ? { type: offerType } : {}) } }
	}

	// El P2P se mira ANTES: sus eventos de fondos recibidos comparten canal de
	// sonido con las transferencias, pero no comparten destino
	// Ofertas por rango: las push de una ORDEN abren esa orden; la de "tomaron una
	// parte" (`p2p_partial_applied`, al dueño) abre la oferta, donde está la lista
	if (type.startsWith('p2p')) {
		const p2pUuid = data?.p2p_uuid || data?.uuid
		if (!p2pUuid) return null
		const order = type !== 'p2p_partial_applied' ? data?.order_uuid : undefined
		return {
			screen: ROUTES.P2P_OFFER_SCREEN,
			params: { p2p_uuid: p2pUuid, ...(order ? { order } : {}), ...(isRatePromptPush(data) ? { rate: true } : {}) },
		}
	}

	if (TRANSACTION_TYPES.includes(type)) {
		const uuid = pushTransactionUuid(data)
		return uuid ? { screen: ROUTES.TRANSACTION, params: { uuid } } : { screen: ROUTES.TRANSACTIONS }
	}

	// El carrito asistido no tiene pantalla por id de carrito: se abre el carrito
	if (type.startsWith('cart')) return { screen: ROUTES.ASSISTED_CART }

	if (type.startsWith('gold')) return { screen: ROUTES.GOLD_CHECK }

	if (type.startsWith('savings')) return { screen: ROUTES.SAVINGS_SCREEN }

	return null
}

/**
 * Destino del toque de una push: el `deeplink` del backend propio si lo trae
 * (y la app sabe abrirlo), si no el enrutado por `type` de siempre.
 *
 * @param data - `data` de la push.
 * @returns Ruta y params, o `null` si no hay destino.
 */
export const resolvePushNavigation = (data: PushData): PushTarget | null => {
	const link = resolveDeepLinkTarget(data?.deeplink)
	if (link) return { screen: link.name, params: link.params }
	return resolvePushTarget(data)
}
