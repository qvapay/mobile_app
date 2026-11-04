/**
 * Chips de moneda de la barra del P2P: elegida → recientes → populares, sin repetir.
 * @jest-environment node
 */
import { composeQuickCoins, DEFAULT_POPULAR_COINS, MAX_QUICK_COINS } from './p2pQuickCoins'

const ticks = (coins) => coins.map(c => c.tick)

test('sin elegida ni recientes salen las populares tal cual', () => {
	expect(composeQuickCoins(null, [])).toEqual(DEFAULT_POPULAR_COINS)
})

test('la elegida va primero y no se repite aunque sea popular', () => {
	expect(ticks(composeQuickCoins({ tick: 'ETECSA' }, []))).toEqual(['ETECSA', 'BANK_CUP', 'BANK_MLC', 'CLASICA'])
})

test('una elegida fuera de las populares (del selector o de un enlace) entra con su tick de etiqueta', () => {
	const out = composeQuickCoins({ tick: 'USDT', name: 'Tether' }, [])
	expect(out[0]).toEqual({ tick: 'USDT', label: 'USDT' })
	expect(out).toHaveLength(5)
})

test('las recientes van entre la elegida y las populares, con la etiqueta corta si son populares', () => {
	const out = composeQuickCoins(null, ['BTC', 'BANK_MLC'])
	expect(ticks(out)).toEqual(['BTC', 'BANK_MLC', 'BANK_CUP', 'CLASICA', 'ETECSA'])
	expect(out[1].label).toBe('MLC')
})

test('tope de chips y ticks vacíos ignorados', () => {
	const out = composeQuickCoins({ tick: 'A' }, ['', 'B', 'C', 'D', 'E', 'F', 'G'])
	expect(out).toHaveLength(MAX_QUICK_COINS)
	expect(ticks(out)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
})
