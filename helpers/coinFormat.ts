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
