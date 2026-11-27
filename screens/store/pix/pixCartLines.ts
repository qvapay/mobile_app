import AsyncStorage from '@react-native-async-storage/async-storage'

// API
import { pixApi } from '../../../api/pixApi'

// Carrito
import { cartItemKey } from '../market/cartCore'
import { getItems as getCartItems, hydrate as hydrateCart, remove as removeCartLine } from '../market/marketCartStore'

import type { CartItem } from '../market/cartCore'
import type { PixStage } from '../../../types/domain'

/**
 * Qué líneas del carrito paga cada cobro de PIX del marketplace, por uuid del cobro. El cobro no
 * dice qué artículos lleva, y el carrito puede cambiar con su QR abierto: la cuenta solo admite
 * uno, así que volver a pagar después de tocar el carrito reabre el viejo. Por eso al pagarse
 * solo salen del carrito las líneas que se mandaron al crearlo, y no las que haya ahora. Cada una
 * se reconoce por su clave y su `added_at`: si sale y se vuelve a añadir el mismo producto, es otra
 * línea, y el cobro viejo no la toca. Lo que guardaba la versión anterior eran solo las claves:
 * sin el `added_at` no se sabe si la línea de ahora es la que cobró, así que no se usa.
 *
 * En disco porque el pago se hace en la app del banco y el sistema puede cerrar esta mientras
 * tanto. Fuera de `@qpcache:`, como el carrito: el cobro de otra cuenta responde 404 y se olvida.
 *
 * Un cobro sin pagar no se olvida al caducar, cancelarse o fallar: un pago que entra tarde se
 * entrega igual en el servidor, y sus líneas tienen que salir entonces. Se olvida al devolverse, o
 * pasado `LATE_PAYMENT_MS` desde que se creó.
 *
 * Solo se apunta lo que llega con el cobro creado. Si `POST /pix/checkout` se queda sin respuesta,
 * el QR que devuelva el 409 del reintento pudo crearlo ese intento o estar ya abierto desde la web,
 * y nada en el cobro lo distingue: no se le cuelga nada, porque dejar en el carrito algo pagado se
 * ve y se arregla, y quitar algo sin pagar no.
 */

const STORAGE_KEY = '@qppixcart:v1'
/** Un cobro que nunca se resuelve no hace crecer esto sin fin: se quedan los últimos. */
const MAX_CHARGES = 20
/** Lo que se espera un pago tardío. Mientras, el carrito lo consulta cada vez que se enfoca. */
const LATE_PAYMENT_MS = 24 * 60 * 60 * 1000

/** Una línea del carrito tal como estaba al crear el cobro. `addedAt` null = la línea no lo tenía. */
type Line = { key: string, addedAt: number | null }
/** `at`: cuándo se creó el cobro. */
type Charge = { lines: Line[], at: number }
type Charges = Record<string, Charge>

const PAID: ReadonlySet<PixStage> = new Set(['verifying', 'delivered'])

let charges: Charges = {}
let loading: Promise<void> | null = null
let settling: Promise<void> | null = null

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isLine = (value: unknown): value is Line => isRecord(value) && typeof value.key === 'string' && (value.addedAt === null || typeof value.addedAt === 'number')

/** Lo que distingue a una línea de otra del mismo producto añadida en otro momento. */
const lineIdentity = (item: CartItem | undefined): number | null => (typeof item?.added_at === 'number' ? item.added_at : null)

// Lo que no tenga esta forma se descarta, también lo de la versión anterior (solo las claves)
const parseCharge = (value: unknown): Charge | null => (
	isRecord(value) && Array.isArray(value.lines) && value.lines.every(isLine) && typeof value.at === 'number'
		? { lines: value.lines, at: value.at }
		: null
)

const parse = (raw: string | null): Charges => {
	try {
		const value: unknown = raw ? JSON.parse(raw) : null
		if (!isRecord(value)) { return {} }
		const parsed: Charges = {}
		for (const [uuid, entry] of Object.entries(value)) {
			const charge = parseCharge(entry)
			if (charge) { parsed[uuid] = charge }
		}
		return parsed
	} catch { return {} }
}

// Todo espera a la lectura del disco, así nada de lo que se apunte antes se pierde al leerlo
const load = (): Promise<void> => {
	if (!loading) {
		loading = AsyncStorage.getItem(STORAGE_KEY).then((raw) => { charges = parse(raw) }, () => {})
	}
	return loading
}

// Fire-and-forget: si el disco falla, al menos vale para esta sesión
const save = (next: Charges) => {
	charges = Object.fromEntries(Object.entries(next).slice(-MAX_CHARGES))
	AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(charges)).catch(() => {})
}

const forget = (uuid: string) => {
	save(Object.fromEntries(Object.entries(charges).filter(([key]) => key !== uuid)))
}

/**
 * Apunta las líneas que lleva un cobro recién creado.
 *
 * @param uuid - Cobro.
 * @param keys - Líneas del carrito (`cartItemKey`) que se mandaron en él.
 */
export async function rememberCartLines(uuid: string, keys: string[]): Promise<void> {
	await load()
	if (keys.length === 0) { return }
	await hydrateCart()
	const items = getCartItems()
	const lines = keys.map((key): Line => ({ key, addedAt: lineIdentity(items.find(item => cartItemKey(item) === key)) }))
	save({ ...charges, [uuid]: { lines, at: Date.now() } })
}

/**
 * Lo que una etapa del cobro le hace al carrito: pagado saca sus líneas. Devuelto lo olvida
 * dejándolas, porque el dinero volvió y no se entrega nada. Cualquier otra etapa, también
 * caducado, cancelado o fallido, sigue a la espera de un pago tardío hasta `LATE_PAYMENT_MS`.
 *
 * @param uuid - Cobro.
 * @param stage - Su etapa actual.
 */
export async function settleCartLines(uuid: string, stage: PixStage): Promise<void> {
	await load()
	const charge = charges[uuid]
	if (!charge) { return }
	if (PAID.has(stage)) {
		// Sin leer antes el carrito del disco, quitar una línea guardaría el carrito vacío de memoria
		// encima del de verdad: pasa si el QR se reabre desde otra compra recién abierta la app
		await hydrateCart()
		const items = getCartItems()
		for (const line of charge.lines) {
			const current = items.find(item => cartItemKey(item) === line.key)
			// El mismo producto, quitado y vuelto a añadir después de crear el cobro: esa línea no la pagó este
			const another = current !== undefined && lineIdentity(current) !== line.addedAt
			if (!another) { removeCartLine(line.key) }
		}
		forget(uuid)
	} else if (stage === 'refunded' || Date.now() - charge.at > LATE_PAYMENT_MS) {
		forget(uuid)
	}
}

const settlePending = async () => {
	await load()
	for (const uuid of Object.keys(charges)) {
		const result = await pixApi.getCheckout(uuid)
		if (result.success && result.data) { await settleCartLines(uuid, result.data.stage) }
		// De otra cuenta, o ya no existe. Sin red se queda para la próxima
		else if (result.status === 404) { forget(uuid) }
	}
}

/**
 * Resuelve los cobros apuntados que se pagaron sin su QR delante: se salió de la pantalla antes de
 * pagar en el banco, el sistema cerró la app mientras tanto, o el pago entró tarde.
 *
 * @returns Resuelve al terminar; dos llamadas a la vez comparten la misma ronda.
 */
export function settlePendingCartLines(): Promise<void> {
	if (!settling) {
		settling = settlePending().finally(() => { settling = null })
	}
	return settling
}
