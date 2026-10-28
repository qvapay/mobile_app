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
