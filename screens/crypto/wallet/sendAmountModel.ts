/**
 * Cantidad de Enviar en token o en USD (conmutador estilo Phantom/Trust).
 * PURO — sin react-native. Lo que se valida y se firma SIEMPRE son unidades
 * mínimas del token; el modo USD solo cambia lo que el usuario teclea, y su
 * conversión va en bigint redondeando HACIA ABAJO: nunca se envía más de lo
 * que se pidió ni se pasa del saldo por un decimal.
 */
import { formatUnits, parseUnits } from '../../../wallet/chains/units'

export type AmountMode = 'token' | 'usd'

/** Decimales del modo USD: céntimos. */
export const USD_DECIMALS = 2

/** El precio (Number) se fija a 8 decimales para operar en bigint sin perder lo que importa. */
const PRICE_DECIMALS = 8
const PRICE_SCALE = 10n ** BigInt(PRICE_DECIMALS)

const scalePrice = (price: number): bigint | null => {
	if (!Number.isFinite(price) || price <= 0) return null
	const scaled = BigInt(Math.round(price * Number(PRICE_SCALE)))
	return scaled > 0n ? scaled : null
}

/** El conmutador solo existe para activos volátiles con precio: en una stable 1 token ≈ 1 USD. */
export const canToggleUsd = (asset: { stable: boolean }, price: number | null | undefined): boolean =>
	!asset.stable && !!price && scalePrice(price) !== null

/**
 * USD tecleado → unidades mínimas del token, hacia abajo. Lanza (como
 * `parseUnits`) si el texto no es una cantidad válida de hasta 2 decimales.
 */
export const usdToUnits = (usd: string, price: number, decimals: number): bigint => {
	const cents = parseUnits(usd, USD_DECIMALS)
	const scaled = scalePrice(price)
	if (scaled === null) throw new RangeError('sendAmount: sin precio')
	return (cents * 10n ** BigInt(decimals) * PRICE_SCALE) / (10n ** BigInt(USD_DECIMALS) * scaled)
}

/** Unidades mínimas → USD con 2 decimales, hacia abajo ('12.3', '0'): el texto del input al pasar a USD. */
export const unitsToUsdInput = (units: bigint, price: number, decimals: number): string => {
	const scaled = scalePrice(price)
	if (scaled === null || units <= 0n) return ''
	const cents = (units * scaled * 10n ** BigInt(USD_DECIMALS)) / (10n ** BigInt(decimals) * PRICE_SCALE)
	return formatUnits(cents, USD_DECIMALS)
}

/** Unidades mínimas → texto del input en modo token (exacto). */
export const unitsToTokenInput = (units: bigint, decimals: number): string => (units > 0n ? formatUnits(units, decimals) : '')

/** Texto del input en la unidad indicada a partir de unas unidades exactas. */
export const unitsToInput = (units: bigint, mode: AmountMode, price: number | null, decimals: number): string =>
	mode === 'usd' && price ? unitsToUsdInput(units, price, decimals) : unitsToTokenInput(units, decimals)
