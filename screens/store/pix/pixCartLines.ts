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
/** El reintento que recoge un intento sin respuesta suele llegar en minutos: pasado este rato ya no se usa. */
const UNCONFIRMED_MS = 60 * 60 * 1000
/** Intentos sin respuesta que se recuerdan a la vez. */
const MAX_UNCONFIRMED = 5

/**
 * Un `POST /pix/checkout` del carrito que se quedó sin respuesta. Pudo crear el cobro, o pudo
 * recibir el 409 de un QR que ya estaba abierto (desde la web, desde otro teléfono): desde aquí
 * solo lo distingue el importe. `totalUsd` es lo que el servidor cobraría por estas líneas.
 */
type Unconfirmed = { keys: string[], at: number, totalUsd: number }
type Stored = { charges: Record<string, string[]>, unconfirmed: Unconfirmed[] }

const PAID: ReadonlySet<PixStage> = new Set(['verifying', 'delivered'])
/** Etapas en las que ya no se va a cobrar: se olvida el cobro sin tocar el carrito. */
const CLOSED: ReadonlySet<PixStage> = new Set(['refunded', 'expired', 'cancelled', 'failed'])

let state: Stored = { charges: {}, unconfirmed: [] }
let loading: Promise<void> | null = null
let settling: Promise<void> | null = null

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isKeys = (value: unknown): value is string[] => Array.isArray(value) && value.every(key => typeof key === 'string')
const cents = (usd: number): number => Math.round(usd * 100)
const live = (attempts: Unconfirmed[]): Unconfirmed[] => attempts.filter(attempt => Date.now() - attempt.at <= UNCONFIRMED_MS)

const parse = (raw: string | null): Stored => {
	try {
		const value: unknown = raw ? JSON.parse(raw) : null
		if (!isRecord(value)) { return { charges: {}, unconfirmed: [] } }
		const charges: Record<string, string[]> = {}
		if (isRecord(value.charges)) {
			for (const [uuid, keys] of Object.entries(value.charges)) { if (isKeys(keys)) { charges[uuid] = keys } }
		}
		const unconfirmed = Array.isArray(value.unconfirmed)
			? value.unconfirmed.flatMap((attempt: unknown) => (isRecord(attempt) && isKeys(attempt.keys) && typeof attempt.at === 'number' && typeof attempt.totalUsd === 'number'
				? [{ keys: attempt.keys, at: attempt.at, totalUsd: attempt.totalUsd }]
				: []))
			: []
		return { charges, unconfirmed }
	} catch { return { charges: {}, unconfirmed: [] } }
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
	save({ charges: keys.length > 0 ? { ...state.charges, [uuid]: keys } : state.charges, unconfirmed: [] })
}

/**
 * El carrito pidió un cobro y no hubo respuesta (o fue un 5xx): pudo crearse igual. Si el reintento
 * devuelve en un `409 PIX_QR_OPEN` un QR con este importe, estas son sus líneas.
 *
 * @param keys - Líneas que se mandaron en el intento.
 * @param totalUsd - Lo que cobraría el servidor por ellas (`pixQuote`); solo con un precio cerrado.
 */
export async function rememberUnconfirmedCartLines(keys: string[], totalUsd: number): Promise<void> {
	await load()
	if (keys.length === 0 || !(totalUsd > 0)) { return }
	save({ ...state, unconfirmed: [...state.unconfirmed, { keys, at: Date.now(), totalUsd }].slice(-MAX_UNCONFIRMED) })
}

/**
 * El QR abierto que devolvió un `409 PIX_QR_OPEN`. Uno del marketplace sin líneas apuntadas se queda
 * con las de un intento sin respuesta solo si cobra lo mismo, al centavo: si no, es un QR que ya
 * estaba abierto, y quitarle al carrito lo que no cobra sería peor que dejarle lo que sí. Dos
 * intentos del mismo importe con otras líneas tampoco dicen cuál fue. Sea el QR que sea, los
 * intentos quedan resueltos, porque la cuenta solo admite uno abierto.
 *
 * @param charge - El `charge` del 409.
 */
export async function claimCartLines(charge: Pick<PixCharge, 'uuid' | 'surface' | 'total_usd'>): Promise<void> {
	await load()
	const matches = live(state.unconfirmed).filter(attempt => cents(attempt.totalUsd) === cents(Number(charge.total_usd)))
	const lineSets = new Set(matches.map(attempt => [...attempt.keys].sort().join('\n')))
	const adopted = charge.surface === 'market' && !state.charges[charge.uuid] && lineSets.size === 1 ? matches[0].keys : null
	save({ charges: adopted ? { ...state.charges, [charge.uuid]: adopted } : state.charges, unconfirmed: [] })
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
