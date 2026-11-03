import { keyFromFieldName } from './withdrawFees'
import type { CoinWorkingField } from '../../types/domain'

/**
 * Lógica PURA de los `details` de un método de pago guardado (sin react-native:
 * se testea en node). El backend los ha mandado como array de pares (con
 * `name`/`key` y `value`/`val`) o como mapa plano `{ 'Card Number': '…' }`; el
 * formulario de retiro los quiere por `keyFromFieldName` y el payload de alta o
 * edición por el `field.name` ORIGINAL (así viajan tal cual al retiro).
 */
export type MethodDetail = { name?: string, key?: string, value?: unknown, val?: unknown }
export type RawMethodDetails = MethodDetail[] | Record<string, unknown> | null | undefined
export type MethodDetailPair = { name: string, value: string }

/** Pares `{ name, value }` siempre, vengan como vengan. */
export const normalizeMethodDetails = (raw: RawMethodDetails): MethodDetailPair[] => {
	if (Array.isArray(raw)) {
		return raw.filter(Boolean).map(d => ({ name: String(d.name ?? d.key ?? ''), value: String(d.value ?? d.val ?? '') }))
	}
	if (raw && typeof raw === 'object') return Object.entries(raw).map(([name, value]) => ({ name, value: String(value ?? '') }))
	return []
}

/** Formulario precargado: casa cada campo por nombre sin distinguir mayúsculas; sin dato, ''. */
export const detailsToForm = (raw: RawMethodDetails, fields: Pick<CoinWorkingField, 'name'>[]): Record<string, string> => {
	const pairs = normalizeMethodDetails(raw)
	const form: Record<string, string> = {}
	for (const field of fields) {
		const wanted = String(field.name).toLowerCase()
		const found = pairs.find(pair => pair.name.toLowerCase() === wanted)
		form[keyFromFieldName(field.name)] = found ? found.value : ''
	}
	return form
}

/** Payload `details`: keyed por el `field.name` original, valores sin bordes. */
export const formToDetails = (form: Record<string, string>, fields: Pick<CoinWorkingField, 'name'>[]): Record<string, string> =>
	fields.reduce<Record<string, string>>((acc, field) => {
		acc[field.name] = (form[keyFromFieldName(field.name)] ?? '').toString().trim()
		return acc
	}, {})

/**
 * Método de pago guardado (`GET /user/payment-methods`). Los detalles llegan en
 * `details` o `Details`, como array de pares o como mapa plano; `coin` es el objeto
 * Coin (null si la moneda se retiró del catálogo) o, en respuestas viejas, el tick.
 */
export type SavedPaymentMethod = {
	id?: number | string
	uuid?: string
	name?: string
	coin?: { tick?: string, name?: string, logo?: string } | string | null
	tick?: string
	ticker?: string
	details?: RawMethodDetails
	Details?: RawMethodDetails
}

/** Par etiqueta/valor de un método guardado: el backend ha usado los cuatro nombres. */
export type SavedMethodDetail = MethodDetail

/** La lista, venga pelada o envuelta en `{ methods }` según la versión del backend. */
export const unwrapMethodsPayload = (data: unknown): SavedPaymentMethod[] => {
	if (Array.isArray(data)) return data.filter(Boolean) as SavedPaymentMethod[]
	const methods = (data as { methods?: unknown } | null | undefined)?.methods
	return Array.isArray(methods) ? methods.filter(Boolean) as SavedPaymentMethod[] : []
}

/** Tick del método en minúsculas ('' si la moneda ya no existe). */
export const methodTick = (method: SavedPaymentMethod | null | undefined): string => {
	const coin = method?.coin
	const tick = (coin && typeof coin === 'object' ? coin.tick : null) || method?.tick || (typeof coin === 'string' ? coin : null) || method?.ticker
	return String(tick || '').toLowerCase()
}

/** Los métodos de UNA moneda (sin distinguir mayúsculas); sin tick, ninguno. */
export const methodsForCoin = (methods: SavedPaymentMethod[] | null | undefined, tick: string | null | undefined): SavedPaymentMethod[] => {
	const wanted = String(tick || '').toLowerCase()
	if (!wanted) return []
	return (methods || []).filter(method => methodTick(method) === wanted)
}
