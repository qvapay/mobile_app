/**
 * JSON que sobrevive a `bigint` (saldos y posiciones on-chain van en unidades
 * mínimas exactas). PURO — sin react-native. `JSON.stringify` revienta con un
 * bigint y `JSON.parse` no sabría devolverlo: se etiquetan como
 * `{ "$bigint": "123" }` a la ida y se reconstruyen a la vuelta.
 */

const TAG = '$bigint'

export const encodeDiskJson = (value: unknown): string =>
	JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? { [TAG]: v.toString() } : v))

export const decodeDiskJson = <T = unknown>(raw: string): T =>
	JSON.parse(raw, (_key, v) => (
		v && typeof v === 'object' && !Array.isArray(v) && typeof v[TAG] === 'string' && Object.keys(v).length === 1
			? BigInt(v[TAG])
			: v
	)) as T
