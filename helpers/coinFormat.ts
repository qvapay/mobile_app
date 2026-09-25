/**
 * Formateo de cifras de monedas, compartido por el selector y sus filas.
 *
 * Vive fuera del componente por Fast Refresh: un archivo que exporta cosas
 * que no son componentes obliga a recargar el módulo entero en vez de
 * preservar el estado al editar.
 */

import type { Decimal } from '../types/domain'

/**
 * Cantidad de cripto con los decimales que pide su magnitud: 0.00084 BTC
 * necesita 8, pero 1.234,56 USDT con 8 decimales es ilegible.
 *
 * @param value - Cantidad a formatear.
 * @returns Cantidad lista para pintar (sin ceros de relleno).
 */
export const formatCoinAmount = (value: Decimal | null | undefined): string => {
	const n = Number(value)
	if (!Number.isFinite(n) || n <= 0) return '0'
	if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
	if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, '')
	if (n >= 0.001) return n.toFixed(6).replace(/\.?0+$/, '')
	return n.toFixed(8).replace(/\.?0+$/, '')
}

/**
 * Precio unitario. Los decimales fijos hacían ilegible tanto a BTC (truncado)
 * como a un banco (relleno de ceros).
 *
 * @param value - Precio en USD.
 * @returns Precio con símbolo, o `null` si no hay precio válido.
 */
export const formatCoinPrice = (value: Decimal | null | undefined): string | null => {
	const n = Number(value)
	if (!Number.isFinite(n) || n <= 0) return null
	if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
	if (n >= 1) return '$' + n.toFixed(2)
	return '$' + n.toFixed(4)
}

/**
 * Las condiciones de una moneda en una línea legible ("Comisión 1% · Mín 2"), en vez de las
 * cuatro columnas de jerga inglesa que había antes ("MIN IN / FEE IN / …").
 *
 * Vive aquí para que la fila del selector y la vista del activo ya elegido digan LO MISMO:
 * cuando cada una lo componía por su cuenta, acababan divergiendo.
 *
 * @param t - `t` de i18next.
 * @param coin - Moneda del catálogo.
 * @param direction - 'in' usa fee_in/min_in; 'out', los de salida.
 * @returns Trozos a unir con ' · '; vacío cuando la moneda no cobra ni exige mínimo.
 */
export const coinTerms = (
	t: (key: string, params?: Record<string, unknown>) => string,
	coin: { fee_in?: Decimal, fee_out?: Decimal, min_in?: Decimal, min_out?: Decimal },
	direction: 'in' | 'out' = 'in',
): string[] => {
	const fee = direction === 'in' ? coin.fee_in : coin.fee_out
	const min = direction === 'in' ? coin.min_in : coin.min_out
	const parts: string[] = []
	if (Number(fee) > 0) { parts.push(t('ui.coinRow.feeTerm', { fee })) }
	if (Number(min) > 0) { parts.push(t('ui.coinRow.minTerm', { min })) }
	return parts
}

/**
 * Lo que se recibiría de una moneda al cambiar `amount` dólares. 0 cuando no hay precio o
 * no hay importe: el selector entonces no enseña ninguna cifra, en vez de un '0' engañoso.
 */
export const coinConverted = (coin: { price?: Decimal }, amount: string): number => {
	const amountNum = parseFloat(amount) || 0
	const priceNum = parseFloat(String(coin.price ?? '')) || 0
	return priceNum > 0 ? amountNum / priceNum : 0
}

/**
 * El precio solo aporta cuando la moneda NO va 1:1 con el dólar: en los raíles fiat
 * (banco, Transfermóvil…) enseñar "$1.0000" era puro ruido.
 */
export const meaningfulCoinPrice = (value: Decimal | null | undefined): string | null => {
	const n = Number(value)
	return Number.isFinite(n) && n > 0 && Math.abs(n - 1) > 0.0001 ? formatCoinPrice(value) : null
}
