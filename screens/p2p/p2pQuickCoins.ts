/**
 * Chips de moneda de la barra del mercado P2P (PURO, sin react-native).
 *
 * La fila de chips es el patrón de Binance/OKX: las monedas que más se operan a un toque,
 * sin abrir el selector. Se compone con la moneda elegida (si vino del selector o de un
 * enlace y no está entre las rápidas), las últimas que eligió el usuario en el selector
 * (las guarda QPCoinPicker bajo `RECENT_COINS_KEY`) y las populares de relleno.
 */

export type QuickCoin = { tick: string, label: string }

/** Clave de AsyncStorage con los ticks recientes del selector (la escribe QPCoinPicker). */
export const RECENT_COINS_KEY = 'qp_recent_p2p_coins'

/** Populares de relleno, en el orden en que se enseñan. */
export const DEFAULT_POPULAR_COINS: QuickCoin[] = [
	{ tick: 'BANK_CUP', label: 'CUP' },
	{ tick: 'BANK_MLC', label: 'MLC' },
	{ tick: 'CLASICA', label: 'Clásica' },
	{ tick: 'ETECSA', label: 'ETECSA' },
]

/** Tope de chips: más no caben sin scroll largo y el selector ya está a un toque. */
export const MAX_QUICK_COINS = 6

/**
 * Elegida → recientes → populares, sin repetir y con tope.
 *
 * @param selected - Moneda activa del filtro (o null).
 * @param recents - Ticks recientes del selector, del más nuevo al más viejo.
 * @param defaults - Populares de relleno.
 * @param max - Tope de chips.
 */
export function composeQuickCoins(
	selected: { tick: string, name?: string } | null,
	recents: string[],
	defaults: QuickCoin[] = DEFAULT_POPULAR_COINS,
	max: number = MAX_QUICK_COINS,
): QuickCoin[] {
	const out: QuickCoin[] = []
	const push = (tick: string, label: string) => {
		if (!tick || out.length >= max || out.some(c => c.tick === tick)) { return }
		out.push({ tick, label })
	}
	const labelFor = (tick: string) => defaults.find(d => d.tick === tick)?.label ?? tick
	if (selected?.tick) { push(selected.tick, labelFor(selected.tick)) }
	for (const tick of recents) { push(tick, labelFor(tick)) }
	for (const coin of defaults) { push(coin.tick, coin.label) }
	return out
}
