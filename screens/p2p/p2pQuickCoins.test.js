/**
 * Chips de moneda de la barra del P2P: elegida → recientes → populares, sin repetir.
 * @jest-environment node
 */
import { composeQuickCoins, DEFAULT_POPULAR_COINS, MAX_QUICK_COINS } from './p2pQuickCoins'

const ticks = (coins) => coins.map(c => c.tick)

test('sin elegida ni recientes salen las primeras populares, hasta el tope', () => {
	expect(composeQuickCoins(null, [])).toEqual(DEFAULT_POPULAR_COINS.slice(0, MAX_QUICK_COINS))
	expect(ticks(composeQuickCoins(null, []))).toEqual(['BANK_CUP', 'BANK_MLC'])
})

test('la elegida va primero y no se repite aunque sea popular', () => {
	expect(ticks(composeQuickCoins({ tick: 'ETECSA' }, []))).toEqual(['ETECSA', 'BANK_CUP'])
	expect(ticks(composeQuickCoins({ tick: 'BANK_MLC' }, []))).toEqual(['BANK_MLC', 'BANK_CUP'])
})

test('una elegida fuera de las populares (del selector o de un enlace) entra con su tick de etiqueta', () => {
	const out = composeQuickCoins({ tick: 'USDT', name: 'Tether' }, [])
	expect(out[0]).toEqual({ tick: 'USDT', label: 'USDT' })
	expect(ticks(out)).toEqual(['USDT', 'BANK_CUP'])
})

test('las recientes van entre la elegida y las populares, con la etiqueta corta si son populares', () => {
	const out = composeQuickCoins(null, ['BTC', 'BANK_MLC'])
	expect(ticks(out)).toEqual(['BTC', 'BANK_MLC'])
	expect(out[1].label).toBe('MLC')
	expect(ticks(composeQuickCoins({ tick: 'ETH' }, ['BTC']))).toEqual(['ETH', 'BTC'])
	expect(ticks(composeQuickCoins(null, ['BTC']))).toEqual(['BTC', 'BANK_CUP'])
})

test('tope de chips y ticks vacíos ignorados', () => {
	const out = composeQuickCoins({ tick: 'A' }, ['', 'B', 'C', 'D', 'E', 'F', 'G'])
	expect(out).toHaveLength(MAX_QUICK_COINS)
	expect(ticks(out)).toEqual(['A', 'B'])
})
