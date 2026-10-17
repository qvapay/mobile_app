/**
 * @jest-environment node
 *
 * Cartera de xStocks con precios REALES de Jupiter (`/price/v3`, 2026-10-14). Lo que no se
 * puede romper: el valor en USD se calcula sobre el saldo CRUDO con el precio por cruda, y las
 * acciones que se enseñan llevan el multiplicador de dividendos vigente.
 */
import { buildPosition, buildPositions, dayChangeUsd, rawForUsd, sortByLiquidity, summarizePortfolio, toQuote } from './xstocksModel'
import { XSTOCKS, xStockByUnderlying } from '../../../wallet/xstocks'

const NOW = 1_800_000_000
const NVDAX = xStockByUnderlying('NVDA')
const TSLAX = xStockByUnderlying('TSLA')

// Respuesta real de /price/v3 para NVDAx (Scaled UI) y TSLAx (multiplicador 1)
const NVDAX_ENTRY = {
	usdPrice: 218.84963482908142,
	priceChange24h: -4.338750765583009,
	liquidity: 3331893.772749723,
	scaledUiConfig: { multiplier: 1.0009180758490996, newMultiplier: 1.001701196801074, usdPricePrescaled: 219.22194112776887 },
}
const TSLAX_ENTRY = { usdPrice: 364.2158172732573, priceChange24h: -2.838858160221298, liquidity: 1485437.405173608 }
const NVDAX_SCALED = { multiplier: '1.0009180758490996', newMultiplier: '1.001701196801074', effectiveAt: 1789000200 }

describe('toQuote', () => {

	test('con Scaled UI usa el precio por cruda de Jupiter', () => {
		expect(toQuote(NVDAX_ENTRY, NVDAX_SCALED, NOW)).toEqual({ price: 218.84963482908142, rawPrice: 219.22194112776887, change24h: -4.338750765583009, liquidity: 3331893.772749723 })
	})

	test('sin precio por cruda lo deriva con el multiplicador de la cadena', () => {
		const quote = toQuote({ usdPrice: 200 }, NVDAX_SCALED, NOW)
		expect(quote.rawPrice).toBeCloseTo(200 * 1.001701196801074, 9)
		expect(toQuote({ usdPrice: 300 }, null, NOW).rawPrice).toBe(300)
	})

	test('sin precio válido no hay cotización', () => {
		expect(toQuote(undefined, null, NOW)).toBeNull()
		expect(toQuote({ usdPrice: 0 }, null, NOW)).toBeNull()
		expect(toQuote({ usdPrice: 10, priceChange24h: null }, null, NOW).change24h).toBeNull()
	})
})

describe('posiciones', () => {

	test('acciones escaladas y valor sobre el crudo (dan lo mismo por los dos caminos)', () => {
		const quote = toQuote(NVDAX_ENTRY, NVDAX_SCALED, NOW)
		const position = buildPosition(NVDAX, 200_000_000n, quote, NVDAX_SCALED, NOW) // 2 crudas
		expect(position.shares).toBe('2.00340239')
		expect(position.value).toBeCloseTo(2 * 219.22194112776887, 9)
		// acciones × precio por acción ≈ crudas × precio por cruda (Jupiter redondea su propio multiplicador)
		expect(Number(position.shares) * quote.price).toBeCloseTo(position.value, 0)
		expect(position.dayChange).toBeCloseTo(dayChangeUsd(position.value, -4.338750765583009), 9)
	})

	test('el cambio del día en USD sale del valor ACTUAL', () => {
		// 110 hoy tras +10% → ayer valía 100 → +10 USD
		expect(dayChangeUsd(110, 10)).toBeCloseTo(10, 9)
		expect(dayChangeUsd(90, -10)).toBeCloseTo(-10, 9)
	})

	test('una fila por xStock; el resumen solo suma lo que se tiene', () => {
		const positions = buildPositions({
			balances: { [`solana:${NVDAX.mint}`]: '100000000', [`solana:${TSLAX.mint}`]: '50000000' },
			quotes: { [NVDAX.mint]: toQuote(NVDAX_ENTRY, NVDAX_SCALED, NOW), [TSLAX.mint]: toQuote(TSLAX_ENTRY, null, NOW) },
			scaledUi: { [NVDAX.mint]: NVDAX_SCALED },
			nowSeconds: NOW,
		})
		expect(positions).toHaveLength(XSTOCKS.length)
		const summary = summarizePortfolio(positions)
		expect(summary.held.map(p => p.stock.symbol)).toEqual(['TSLAx', 'NVDAx'])
		expect(summary.value).toBeCloseTo(219.22194112776887 + 0.5 * 364.2158172732573, 6)
		expect(summary.dayChange).toBeLessThan(0)
		expect(summary.dayChangePct).toBeLessThan(0)
		expect(summary.dayChangePct).toBeGreaterThan(-4.34)
		expect(summarizePortfolio(buildPositions({ balances: {}, quotes: {}, scaledUi: {}, nowSeconds: NOW }))).toMatchObject({ value: 0, dayChange: 0, dayChangePct: 0, held: [] })
	})

	test('populares por liquidez, sin cotización al final', () => {
		const positions = buildPositions({
			balances: {},
			quotes: { [NVDAX.mint]: toQuote(NVDAX_ENTRY, NVDAX_SCALED, NOW), [TSLAX.mint]: toQuote(TSLAX_ENTRY, null, NOW) },
			scaledUi: {},
			nowSeconds: NOW,
		})
		expect(sortByLiquidity(positions).slice(0, 2).map(p => p.stock.symbol)).toEqual(['NVDAx', 'TSLAx'])
	})
})

describe('vender por importe', () => {

	test('USD → crudas truncando y sin pasar del saldo', () => {
		const quote = toQuote(TSLAX_ENTRY, null, NOW)
		// 0,1 acción exacta y un pelo menos: trunca, nunca redondea hacia arriba
		expect(rawForUsd(36.42158172732573, quote, 1_000_000_000n)).toBe(10_000_000n)
		expect(rawForUsd(36.4215, quote, 1_000_000_000n)).toBe(BigInt(Math.floor((36.4215 / quote.rawPrice) * 1e8)))
		expect(rawForUsd(10_000, quote, 5_000_000n)).toBe(5_000_000n)
		expect(rawForUsd(0, quote, 5_000_000n)).toBe(0n)
	})
})
