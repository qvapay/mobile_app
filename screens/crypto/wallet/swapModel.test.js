/**
 * @jest-environment node
 *
 * Lógica pura del Swap: saneado del importe, máximo movible, chips de porcentaje, prioridad
 * del botón y línea de tiempo del estado.
 */
import { buildSwapForm, floorCents, maxSwapAmount, percentAmount, sanitizeAmountInput, swapTimeline } from './swapModel'

const PAIR = { id: 'QVAPAY:QUSD_STACKS', enabled: true, min: 1, max: 5000, rate: 1, fee_bps: 0, network: 'stacks', asset: 'SP1.QUSD::QUSD', asset_name: 'QUSD' }
const form = (over = {}) => buildSwapForm({ direction: 'out', amountText: '5', pair: PAIR, payBalance: 120.5, limitAvailable: 100, walletReady: true, loading: false, ...over })

describe('sanitizeAmountInput', () => {
	test('coma a punto, un solo punto, 2 decimales, sin ceros a la izquierda ni letras', () => {
		expect(sanitizeAmountInput('12,5')).toBe('12.5')
		expect(sanitizeAmountInput('1.2.3')).toBe('1.23')
		expect(sanitizeAmountInput('1.234')).toBe('1.23')
		expect(sanitizeAmountInput('007')).toBe('7')
		expect(sanitizeAmountInput('0.05')).toBe('0.05')
		expect(sanitizeAmountInput('.5')).toBe('0.5')
		expect(sanitizeAmountInput('$ 10abc')).toBe('10')
		expect(sanitizeAmountInput('')).toBe('')
	})
})

describe('máximo y porcentajes', () => {
	test('el máximo es el menor de saldo, tope del par y cupo del día, truncado a centavos', () => {
		expect(maxSwapAmount({ payBalance: 120.559, pair: PAIR, limitAvailable: null })).toBe(120.55)
		expect(maxSwapAmount({ payBalance: 120.5, pair: PAIR, limitAvailable: 100 })).toBe(100)
		expect(maxSwapAmount({ payBalance: 9999, pair: { ...PAIR, max: 50 }, limitAvailable: null })).toBe(50)
		expect(maxSwapAmount({ payBalance: 10, pair: null, limitAvailable: null })).toBe(0)
		expect(floorCents(0.1 + 0.2)).toBe(0.3)
	})

	test('chips 25/50/75/MAX truncan hacia abajo; sin máximo no rellenan', () => {
		expect(percentAmount(40, 25)).toBe('10.00')
		expect(percentAmount(33.33, 50)).toBe('16.66')
		expect(percentAmount(33.33, 100)).toBe('33.33')
		expect(percentAmount(0, 50)).toBe('')
	})
})

describe('botón principal', () => {
	test('prioridad: cargando → no disponible → wallet → importe → saldo → mínimo → máximo → límite → revisar', () => {
		expect(form({ loading: true }).cta).toBe('loading')
		expect(form({ pair: null }).cta).toBe('unavailable')
		expect(form({ pair: { ...PAIR, enabled: false } }).cta).toBe('unavailable')
		expect(form({ walletReady: false }).cta).toBe('walletNotRegistered')
		expect(form({ amountText: '' }).cta).toBe('enterAmount')
		expect(form({ amountText: '0.00' }).cta).toBe('enterAmount')
		expect(form({ amountText: '121' })).toMatchObject({ cta: 'insufficient', ctaParams: { symbol: 'USD' } })
		expect(form({ direction: 'in', amountText: '41', payBalance: 40 })).toMatchObject({ cta: 'insufficient', ctaParams: { symbol: 'QUSD' } })
		expect(form({ amountText: '0.5' })).toMatchObject({ cta: 'belowMin', ctaParams: { amount: '1.00' } })
		expect(form({ amountText: '60', pair: { ...PAIR, max: 50 } })).toMatchObject({ cta: 'aboveMax', ctaParams: { amount: '50.00' } })
		expect(form({ amountText: '100.01' })).toMatchObject({ cta: 'overLimit', ctaParams: { amount: '100.00' } })
		expect(form({ amountText: '100', limitAvailable: 100 }).cta).toBe('review')
		expect(form({ amountText: '1000', payBalance: 2000, limitAvailable: null }).canReview).toBe(true)
	})

	test('1:1 sin comisión recibe lo mismo; con comisión y tasa se descuenta y convierte', () => {
		expect(form({ amountText: '25.5' })).toMatchObject({ amount: '25.50', value: 25.5, receive: 25.5, fee: 0 })
		expect(form({ amountText: '100', payBalance: 500, limitAvailable: null, pair: { ...PAIR, fee_bps: 50, rate: 0.5 } })).toMatchObject({ fee: 0.5, receive: 49.75 })
	})
})

describe('línea de tiempo', () => {
	test('cada estado del backend cae en su paso; los terminales malos marcan dónde', () => {
		expect(swapTimeline(undefined)).toEqual({ active: 0, failedAt: null })
		expect(swapTimeline('pending')).toEqual({ active: 1, failedAt: null })
		expect(swapTimeline('sent')).toEqual({ active: 2, failedAt: null })
		expect(swapTimeline('completed')).toEqual({ active: 3, failedAt: null })
		expect(swapTimeline('refunded')).toEqual({ active: 2, failedAt: 2 })
	})
})
