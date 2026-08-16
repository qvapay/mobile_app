/**
 * Formateo de cifras de monedas, compartido por el selector y sus filas.
 *
 * Vive fuera del componente por Fast Refresh: un archivo que exporta cosas
 * que no son componentes obliga a recargar el módulo entero en vez de
 * preservar el estado al editar.
 */

/**
 * Cantidad de cripto con los decimales que pide su magnitud: 0.00084 BTC
 * necesita 8, pero 1.234,56 USDT con 8 decimales es ilegible.
 *
 * @param {number|string} value - Cantidad a formatear.
 * @returns {string} Cantidad lista para pintar (sin ceros de relleno).
 */
export const formatCoinAmount = (value) => {
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
 * @param {number|string} value - Precio en USD.
 * @returns {string|null} Precio con símbolo, o `null` si no hay precio válido.
 */
export const formatCoinPrice = (value) => {
	const n = Number(value)
	if (!Number.isFinite(n) || n <= 0) return null
	if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
	if (n >= 1) return '$' + n.toFixed(2)
	return '$' + n.toFixed(4)
}
