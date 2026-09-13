/**
 * Formateo de dinero de la wallet. PURO (Intl de Hermes, sin react-native):
 * USD siempre con símbolo y agrupación en-US, igual que el resto de la app
 * cripto (ExploreRow, CoinDetail).
 */

/** USD con 2 decimales; con `compactSmall`, precios < $1 con 4 cifras (TRX $0.3405). */
export const formatUsd = (value: number, { compactSmall = false }: { compactSmall?: boolean } = {}): string => {
	const digits = compactSmall && Math.abs(value) > 0 && Math.abs(value) < 1 ? 4 : 2
	return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

/** Dirección larga recortada por el centro: `TUEZSd…hGWYdH`. */
export const shortAddress = (address: string | null | undefined, head = 6, tail = 6): string => {
	if (!address) return ''
	return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`
}
