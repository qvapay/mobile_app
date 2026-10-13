/**
 * Tarjeta de oferta del mercado P2P: paridad con la fila de la web.
 * @jest-environment node
 */
import {
	formatRate, formatUsd, formatCoinAmount, rateDeviation, formatDeviation,
	cardAction, viewerPays, remainingPct, activeRequirements, formatStamp,
} from './p2pOfferCard'

describe('formatos', () => {

	test('tasa con dos decimales y separador de miles; sin número, raya', () => {
		expect(formatRate(1.13)).toBe('1.13')
		expect(formatRate(1030)).toBe('1,030.00')
		expect(formatRate(null)).toBe('—')
		expect(formatRate(NaN)).toBe('—')
	})

	test('dólares con dos decimales, moneda con hasta dos', () => {
		expect(formatUsd('480')).toBe('480.00')
		expect(formatCoinAmount('1030')).toBe('1,030')
		expect(formatCoinAmount('12.345')).toBe('12.35')
	})

	test('hora dd/MM HH:mm', () => {
		const d = new Date(2026, 9, 12, 14, 5)
		expect(formatStamp(d.toISOString())).toBe('12/10 14:05')
		expect(formatStamp(null)).toBeNull()
		expect(formatStamp('nope')).toBeNull()
	})
})

describe('rateDeviation', () => {

	test('venta: una tasa baja conviene al taker (verde)', () => {
		const d = rateDeviation(1020, 1050, 'sell')
		expect(d.trend).toBe('good')
		expect(formatDeviation(d.pct)).toBe('-2.9%')
	})

	test('compra: una tasa alta conviene al taker; baja, no', () => {
		expect(rateDeviation(110, 100, 'buy').trend).toBe('good')
		expect(rateDeviation(90, 100, 'buy').trend).toBe('bad')
		expect(rateDeviation(110, 100, 'sell').trend).toBe('bad')
	})

	test('dentro de ±2 % es neutro', () => {
		expect(rateDeviation(101.5, 100, 'sell').trend).toBe('neutral')
		expect(rateDeviation(98.5, 100, 'buy').trend).toBe('neutral')
	})

	test('sin promedio o con promedio 0 no hay desviación', () => {
		expect(rateDeviation(100, undefined, 'sell')).toBeNull()
		expect(rateDeviation(100, 0, 'sell')).toBeNull()
		expect(rateDeviation(null, 100, 'sell')).toBeNull()
	})

	test('signo explícito y un decimal', () => {
		expect(formatDeviation(2.44)).toBe('+2.4%')
		expect(formatDeviation(-1.2)).toBe('-1.2%')
	})
})

describe('botón y lado del dinero', () => {

	test('abierta: el taker compra o vende, el dueño gestiona', () => {
		expect(cardAction({ status: 'open', isOwner: false, type: 'sell' })).toBe('sell')
		expect(cardAction({ status: 'open', isOwner: false, type: 'buy' })).toBe('buy')
		expect(cardAction({ status: 'open', isOwner: true, type: 'sell' })).toBe('manage')
	})

	test('manda el estado de mi orden sobre el de la oferta', () => {
		expect(cardAction({ status: 'open', myOrderStatus: 'paid', isOwner: false, type: 'sell' })).toBe('paid')
		expect(cardAction({ status: 'processing', isOwner: true, type: 'buy' })).toBe('processing')
	})

	test('en sell paga el taker; en buy, el dueño', () => {
		expect(viewerPays('sell', false)).toBe(true)
		expect(viewerPays('sell', true)).toBe(false)
		expect(viewerPays('buy', false)).toBe(false)
		expect(viewerPays('buy', true)).toBe(true)
	})
})

describe('por rango y requisitos', () => {

	test('lo que queda, acotado a 0–100', () => {
		expect(remainingPct({ amount: '1200', available_amount: '744' })).toBe(62)
		expect(remainingPct({ amount: '0', available_amount: '5' })).toBe(0)
		expect(remainingPct({ amount: '10', available_amount: '20' })).toBe(100)
	})

	test('solo los requisitos activos, en orden', () => {
		expect(activeRequirements({ min_rating: 4.5, min_completed: 10, min_trustscore: 0 })).toEqual([['min_completed', 10], ['min_rating', 4.5]])
		expect(activeRequirements({ min_completed: 0 })).toBeNull()
		expect(activeRequirements(null)).toBeNull()
	})
})
