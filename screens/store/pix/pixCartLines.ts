import AsyncStorage from '@react-native-async-storage/async-storage'

// API
import { pixApi } from '../../../api/pixApi'

// Carrito
import { hydrate as hydrateCart, remove as removeCartLine } from '../market/marketCartStore'

import type { PixCharge, PixStage } from '../../../types/domain'

/**
 * Qué líneas del carrito paga cada cobro de PIX del marketplace, por uuid del cobro. El cobro no
 * dice qué artículos lleva, y el carrito puede cambiar con su QR abierto: la cuenta solo admite
 * uno, así que volver a pagar después de tocar el carrito reabre el viejo. Por eso al pagarse
 * solo salen del carrito las líneas que se mandaron al crearlo, y no las que haya ahora.
 *
 * En disco porque el pago se hace en la app del banco y el sistema puede cerrar esta mientras
 * tanto. Fuera de `@qpcache:`, como el carrito: el cobro de otra cuenta responde 404 y se olvida.
 */

const STORAGE_KEY = '@qppixcart:v1'
/** Un cobro que nunca se resuelve no hace crecer esto sin fin: se quedan los últimos. */
const MAX_CHARGES = 20
/**
 * El reintento que recoge un intento sin respuesta suele llegar en minutos. Pasado este rato ya no
 * se usa, para no colgarle sus líneas a un cobro abierto que venga de otro sitio (la web, otro teléfono).
 */
const UNCONFIRMED_MS = 60 * 60 * 1000

/** Un `POST /pix/checkout` del carrito que se quedó sin respuesta: el cobro pudo crearse igual. */
type Unconfirmed = { keys: string[], at: number }
type Stored = { charges: Record<string, string[]>, unconfirmed: Unconfirmed | null }

const PAID: ReadonlySet<PixStage> = new Set(['verifying', 'delivered'])
/** Etapas en las que ya no se va a cobrar: se olvida el cobro sin tocar el carrito. */
const CLOSED: ReadonlySet<PixStage> = new Set(['refunded', 'expired', 'cancelled', 'failed'])

let state: Stored = { charges: {}, unconfirmed: null }
let loading: Promise<void> | null = null
let settling: Promise<void> | null = null

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isKeys = (value: unknown): value is string[] => Array.isArray(value) && value.every(key => typeof key === 'string')

const parse = (raw: string | null): Stored => {
	try {
		const value: unknown = raw ? JSON.parse(raw) : null
		if (!isRecord(value)) { return { charges: {}, unconfirmed: null } }
		const charges: Record<string, string[]> = {}
		if (isRecord(value.charges)) {
			for (const [uuid, keys] of Object.entries(value.charges)) { if (isKeys(keys)) { charges[uuid] = keys } }
		}
		const pending = value.unconfirmed
		const unconfirmed = isRecord(pending) && isKeys(pending.keys) && typeof pending.at === 'number' ? { keys: pending.keys, at: pending.at } : null
		return { charges, unconfirmed }
	} catch { return { charges: {}, unconfirmed: null } }
}

// Todo espera a la lectura del disco, así nada de lo que se apunte antes se pierde al leerlo
const load = (): Promise<void> => {
	if (!loading) {
		loading = AsyncStorage.getItem(STORAGE_KEY).then((raw) => { state = parse(raw) }, () => {})
	}
	return loading
}

// Fire-and-forget: si el disco falla, al menos vale para esta sesión
const save = (next: Stored) => {
	state = { charges: Object.fromEntries(Object.entries(next.charges).slice(-MAX_CHARGES)), unconfirmed: next.unconfirmed }
	AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {})
}

const forget = (uuid: string) => {
	save({ ...state, charges: Object.fromEntries(Object.entries(state.charges).filter(([key]) => key !== uuid)) })
}

/**
 * Un cobro recién creado: apunta las líneas que lleva. Que se haya podido crear prueba que no había
 * otro QR abierto, así que un intento anterior sin respuesta ya no le toca a nadie.
 *
 * @param uuid - Cobro.
 * @param keys - Líneas del carrito (`cartItemKey`) que se mandaron en él; ninguna fuera del carrito.
 */
export async function rememberCartLines(uuid: string, keys: string[]): Promise<void> {
	await load()
	save({ charges: keys.length > 0 ? { ...state.charges, [uuid]: keys } : state.charges, unconfirmed: null })
}

/**
 * El carrito pidió un cobro y no hubo respuesta (o fue un 5xx): pudo crearse igual. Si el
 * reintento lo devuelve en un `409 PIX_QR_OPEN`, estas son sus líneas. Si ya había un intento así
 * se queda el primero: con un QR abierto el servidor no crea otro, así que lo creó el primer
 * intento que llegó, y uno posterior, con el carrito quizá cambiado, solo pudo recibir el 409.
 *
 * @param keys - Líneas que se mandaron en el intento.
 */
export async function rememberUnconfirmedCartLines(keys: string[]): Promise<void> {
	await load()
	const pending = state.unconfirmed
	if (keys.length === 0 || (pending && Date.now() - pending.at <= UNCONFIRMED_MS)) { return }
	save({ ...state, unconfirmed: { keys, at: Date.now() } })
}

/**
 * El QR abierto que devolvió un `409 PIX_QR_OPEN`. Uno del marketplace sin líneas apuntadas es el
 * del intento sin respuesta, si lo hubo: se queda con sus líneas. Sea el que sea, ese intento queda
 * resuelto, porque la cuenta solo admite un QR abierto.
 *
 * @param charge - El `charge` del 409.
 */
export async function claimCartLines(charge: Pick<PixCharge, 'uuid' | 'surface'>): Promise<void> {
	await load()
	const pending = state.unconfirmed
	const adopted = pending && Date.now() - pending.at <= UNCONFIRMED_MS && charge.surface === 'market' && !state.charges[charge.uuid] ? pending.keys : null
	save({ charges: adopted ? { ...state.charges, [charge.uuid]: adopted } : state.charges, unconfirmed: null })
}

/**
 * Lo que una etapa del cobro le hace al carrito: pagado saca sus líneas, y cerrado sin cobrar lo
 * olvida dejándolas (las de un cobro devuelto se quedan). Abierto, o en una etapa que esta
 * versión no conozca, se sigue esperando.
 *
 * @param uuid - Cobro.
 * @param stage - Su etapa actual.
 */
export async function settleCartLines(uuid: string, stage: PixStage): Promise<void> {
	await load()
	const keys = state.charges[uuid]
	if (!keys) { return }
	if (PAID.has(stage)) {
		// Sin leer antes el carrito del disco, quitar una línea guardaría el carrito vacío de memoria
		// encima del de verdad: pasa si el QR se reabre desde otra compra recién abierta la app
		await hydrateCart()
		keys.forEach(removeCartLine)
	} else if (!CLOSED.has(stage)) {
		return
	}
	forget(uuid)
}

const settlePending = async () => {
	await load()
	for (const uuid of Object.keys(state.charges)) {
		const result = await pixApi.getCheckout(uuid)
		if (result.success && result.data) { await settleCartLines(uuid, result.data.stage) }
		// De otra cuenta, o ya no existe. Sin red se queda para la próxima
		else if (result.status === 404) { forget(uuid) }
	}
}

/**
 * Resuelve los cobros apuntados que se pagaron, o se cerraron, sin su QR delante: se salió de la
 * pantalla antes de pagar en el banco, o el sistema cerró la app mientras tanto.
 *
 * @returns Resuelve al terminar; dos llamadas a la vez comparten la misma ronda.
 */
export function settlePendingCartLines(): Promise<void> {
	if (!settling) {
		settling = settlePending().finally(() => { settling = null })
	}
	return settling
}
