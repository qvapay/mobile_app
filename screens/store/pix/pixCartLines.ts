import AsyncStorage from '@react-native-async-storage/async-storage'

// API
import { pixApi } from '../../../api/pixApi'

// Carrito
import { remove as removeCartLine } from '../market/marketCartStore'

import type { PixStage } from '../../../types/domain'

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

type LinesByCharge = Record<string, string[]>

const PAID: ReadonlySet<PixStage> = new Set(['verifying', 'delivered'])
/** Etapas en las que ya no se va a cobrar: se olvida el cobro sin tocar el carrito. */
const CLOSED: ReadonlySet<PixStage> = new Set(['refunded', 'expired', 'cancelled', 'failed'])

let lines: LinesByCharge = {}
let loading: Promise<void> | null = null
let settling: Promise<void> | null = null

const parse = (raw: string | null): LinesByCharge => {
	try {
		const value: unknown = raw ? JSON.parse(raw) : null
		if (!value || typeof value !== 'object' || Array.isArray(value)) { return {} }
		return Object.fromEntries(Object.entries(value).filter(([, keys]) => Array.isArray(keys) && keys.every(key => typeof key === 'string')))
	} catch { return {} }
}

// Todo espera a la lectura del disco, así nada de lo que se apunte antes se pierde al leerlo
const load = (): Promise<void> => {
	if (!loading) {
		loading = AsyncStorage.getItem(STORAGE_KEY).then((raw) => { lines = parse(raw) }, () => {})
	}
	return loading
}

// Fire-and-forget: si el disco falla, al menos vale para esta sesión
const save = (next: LinesByCharge) => {
	lines = Object.fromEntries(Object.entries(next).slice(-MAX_CHARGES))
	AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lines)).catch(() => {})
}

const forget = (uuid: string) => {
	save(Object.fromEntries(Object.entries(lines).filter(([key]) => key !== uuid)))
}

/**
 * Apunta las líneas que lleva un cobro recién creado.
 *
 * @param uuid - Cobro.
 * @param keys - Líneas del carrito (`cartItemKey`) que se mandaron en él.
 */
export async function rememberCartLines(uuid: string, keys: string[]): Promise<void> {
	await load()
	if (keys.length > 0) { save({ ...lines, [uuid]: keys }) }
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
	const keys = lines[uuid]
	if (!keys) { return }
	if (PAID.has(stage)) { keys.forEach(removeCartLine) }
	else if (!CLOSED.has(stage)) { return }
	forget(uuid)
}

const settlePending = async () => {
	await load()
	for (const uuid of Object.keys(lines)) {
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
