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

/** `additionalData` de una push de QvaPay. */
export type PushData = {
	type?: string
	/** Legacy: uuid genérico, interpretado según el tipo. */
	uuid?: string
	transaction_uuid?: string
	p2p_uuid?: string
	order_uuid?: string
	cart_id?: string | number
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
const TRANSACTION_TYPES = ['transfer_received', 'transfer_sent', 'invite_sent', 'transaction', 'transfer']

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
 * Pantalla a la que lleva tocar la notificación.
 *
 * @param data - `additionalData` de la push.
 * @returns Ruta y params, o `null` si el tipo no tiene destino propio.
 */
export const resolvePushTarget = (data: PushData): PushTarget | null => {

	const type = data?.type
	if (!type) return null

	// El P2P se mira ANTES: sus eventos de fondos recibidos comparten canal de
	// sonido con las transferencias, pero no comparten destino
	if (type.startsWith('p2p')) {
		const p2pUuid = data?.p2p_uuid || data?.uuid
		return p2pUuid ? { screen: ROUTES.P2P_OFFER_SCREEN, params: { p2p_uuid: p2pUuid } } : null
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
