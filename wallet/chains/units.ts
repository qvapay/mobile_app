/**
 * Unidades on-chain ↔ decimal humano. Módulo PURO. Todo el cálculo de
 * cantidades va en bigint hasta el último momento: un Number pierde precisión
 * a partir de 2^53 wei (≈0.009 ETH), así que la conversión a número solo se
 * hace para VALORAR en USD, nunca para mostrar ni para firmar.
 */

/** bigint en unidades mínimas → string decimal sin ceros de cola ('1.5', '0', '0.000001'). */
export const formatUnits = (value: bigint, decimals: number): string => {
	const negative = value < 0n
	const abs = negative ? -value : value
	if (decimals === 0) return `${negative ? '-' : ''}${abs}`
	const base = 10n ** BigInt(decimals)
	const whole = abs / base
	const fraction = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '')
	return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/**
 * Decimal humano tecleado ('1', '0.5', '12,5', ' 1.000000 ') → unidades
 * mínimas. Lanza si no es un número, es negativo o trae más decimales de los
 * que admite el activo (no se redondea: en dinero, redondear es inventar).
 */
export const parseUnits = (input: string, decimals: number): bigint => {
	const text = input.trim().replace(',', '.')
	if (!/^\d*(\.\d*)?$/.test(text) || text === '' || text === '.') throw new RangeError(`units: cantidad inválida '${input}'`)
	const [whole = '', fraction = ''] = text.split('.')
	if (fraction.length > decimals) throw new RangeError(`units: máximo ${decimals} decimales`)
	return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((fraction || '0').padEnd(decimals, '0'))
}

/**
 * Recorta un decimal a `decimals` cifras redondeando HACIA ARRIBA (nunca
 * menos de lo pedido): para pagar una orden cuyo importe trae más decimales
 * de los que admite el activo. '5.1234567' con 6 → '5.123457'.
 */
export const roundUpToDecimals = (input: string, decimals: number): string => {
	const text = input.trim().replace(',', '.')
	if (!/^\d*(\.\d*)?$/.test(text) || text === '' || text === '.') throw new RangeError(`units: cantidad inválida '${input}'`)
	const [whole = '0', fraction = ''] = text.split('.')
	const kept = fraction.slice(0, decimals)
	const dropped = fraction.slice(decimals)
	let units = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((kept || '0').padEnd(decimals, '0'))
	if (/[1-9]/.test(dropped)) units += 1n
	return formatUnits(units, decimals)
}

/**
 * Cantidad para PINTAR: pocos decimales significativos según magnitud, sin
 * redondear hacia arriba (mostrar más saldo del que hay es peor que menos).
 */
export const displayAmount = (decimal: string, maxDecimals = 6): string => {
	const [whole, fraction = ''] = decimal.split('.')
	const wholeNum = Number(whole)
	const digits = Math.abs(wholeNum) >= 1000 ? 2 : Math.abs(wholeNum) >= 1 ? 4 : maxDecimals
	const trimmed = fraction.slice(0, digits).replace(/0+$/, '')
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
	if (!trimmed) {
		// Saldo real pero por debajo de lo visible: "<0.000001" en vez de un "0" engañoso
		if (wholeNum === 0 && /[1-9]/.test(fraction)) return `<0.${'0'.repeat(digits - 1)}1`
		return grouped
	}
	return `${grouped}.${trimmed}`
}
