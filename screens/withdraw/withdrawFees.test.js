/**
 * Fee math for the Withdraw screen — mirror of the server's rules in
 * `qpweb app/api/withdraw/route.js` (and the web wizard preview): threshold
 * boundary is STRICTLY ABOVE for the % branch, GOLD users pay `fee_out_gold`,
 * and `type: select` options can add a `fee_pct` surcharge on the gross.
 * @jest-environment node
 */
import { calculateFee, grossFromNet, getSelectFeePct, parseFeeOutFixed, keyFromFieldName } from './withdrawFees'

// 5% + threshold config: at/below $50 a flat $2, strictly above it 5%
const THRESHOLD_COIN = { fee_out: '5', fee_out_gold: '2', fee_out_fixed: ['50', '2'] }
// 5% + flat $1 always
const SCALAR_COIN = { fee_out: '5', fee_out_gold: '2', fee_out_fixed: 1 }
// % only
const PCT_COIN = { fee_out: '5', fee_out_gold: '2', fee_out_fixed: null }

const PROVINCE_FIELDS = [
	{ name: 'Nombre', type: 'text' },
	{
		name: 'Provincia',
		type: 'select',
		options: [
			{ value: 'La Habana', fee_pct: 0 },
			{ value: 'Holguín', fee_pct: 5 },
			{ value: 'Granma', fee_pct: '7.5' },
		],
	},
]

describe('calculateFee', () => {
	test('percent-only coin charges the rate on the gross', () => {
		expect(calculateFee(100, PCT_COIN)).toBe(5)
	})

	test('scalar fixed fee adds on top of the percent, always', () => {
		expect(calculateFee(100, SCALAR_COIN)).toBe(6)
		expect(calculateFee(10, SCALAR_COIN)).toBe(1.5)
	})

	test('threshold config: at or below the threshold only the flat fee applies', () => {
		expect(calculateFee(30, THRESHOLD_COIN)).toBe(2)
		// The boundary belongs to the fixed branch, exactly like the server
		// (`amount > threshold` switches to percent)
		expect(calculateFee(50, THRESHOLD_COIN)).toBe(2)
	})

	test('threshold config: strictly above the threshold only the percent applies', () => {
		expect(calculateFee(50.01, THRESHOLD_COIN)).toBe(2.5)
		expect(calculateFee(100, THRESHOLD_COIN)).toBe(5)
	})

	test('GOLD users pay fee_out_gold instead of fee_out', () => {
		expect(calculateFee(100, PCT_COIN, { isGold: true })).toBe(2)
		expect(calculateFee(100, THRESHOLD_COIN, { isGold: true })).toBe(2)
	})

	test('the select surcharge is a % of the gross added to the base fee', () => {
		expect(calculateFee(100, PCT_COIN, { selectFeePct: 5 })).toBe(10)
		// Fixed branch keeps the flat fee and adds the surcharge
		expect(calculateFee(40, THRESHOLD_COIN, { selectFeePct: 5 })).toBe(4)
	})

	test('fee_out_fixed arriving as a JSON string still parses (web-wizard parity)', () => {
		expect(calculateFee(30, { ...THRESHOLD_COIN, fee_out_fixed: '["50","2"]' })).toBe(2)
		expect(calculateFee(100, { ...SCALAR_COIN, fee_out_fixed: '1' })).toBe(6)
	})

	test('invalid inputs cost nothing', () => {
		expect(calculateFee(0, PCT_COIN)).toBe(0)
		expect(calculateFee('abc', PCT_COIN)).toBe(0)
		expect(calculateFee(100, null)).toBe(0)
	})
})

describe('grossFromNet (inverse)', () => {
	test('round-trips with calculateFee on the percent branch', () => {
		const gross = grossFromNet(95, PCT_COIN)
		expect(gross).toBeCloseTo(100, 6)
		expect(gross - calculateFee(gross, PCT_COIN)).toBeCloseTo(95, 2)
	})

	test('round-trips on the scalar fixed + percent branch', () => {
		const gross = grossFromNet(94, SCALAR_COIN)
		expect(gross - calculateFee(gross, SCALAR_COIN)).toBeCloseTo(94, 2)
	})

	test('below the threshold the flat fee is simply added back', () => {
		expect(grossFromNet(28, THRESHOLD_COIN)).toBe(30)
	})

	test('the threshold boundary goes to the fixed branch, like the server', () => {
		// net 47.5 → % branch would give exactly gross 50, which is NOT > 50,
		// so the fixed branch wins: 47.5 + 2 = 49.5
		expect(grossFromNet(47.5, THRESHOLD_COIN)).toBe(49.5)
	})

	test('above the threshold the percent is inverted', () => {
		expect(grossFromNet(95, THRESHOLD_COIN)).toBeCloseTo(100, 6)
	})

	test('folds the select surcharge into the effective rate', () => {
		const gross = grossFromNet(90, PCT_COIN, { selectFeePct: 5 })
		expect(gross).toBeCloseTo(100, 6)
		expect(gross - calculateFee(gross, PCT_COIN, { selectFeePct: 5 })).toBeCloseTo(90, 2)
	})

	test('GOLD rate applies to the inverse too', () => {
		expect(grossFromNet(98, PCT_COIN, { isGold: true })).toBeCloseTo(100, 6)
	})

	test('an impossible rate (>= 100%) yields 0 instead of a negative amount', () => {
		expect(grossFromNet(50, { fee_out: '100', fee_out_fixed: null })).toBe(0)
	})
})

describe('getSelectFeePct', () => {
	test('sums the fee_pct of the chosen option, matched by slug key', () => {
		const form = { [keyFromFieldName('Provincia')]: 'Holguín', nombre: 'John' }
		expect(getSelectFeePct(PROVINCE_FIELDS, form)).toBe(5)
	})

	test('string fee_pct values count too', () => {
		expect(getSelectFeePct(PROVINCE_FIELDS, { provincia: 'Granma' })).toBe(7.5)
	})

	test('no choice, unknown value or fee-free option add nothing', () => {
		expect(getSelectFeePct(PROVINCE_FIELDS, {})).toBe(0)
		expect(getSelectFeePct(PROVINCE_FIELDS, { provincia: 'Marte' })).toBe(0)
		expect(getSelectFeePct(PROVINCE_FIELDS, { provincia: 'La Habana' })).toBe(0)
		expect(getSelectFeePct(null, { provincia: 'Holguín' })).toBe(0)
	})
})

describe('parseFeeOutFixed', () => {
	test('passes through arrays and numbers, parses JSON strings, nulls the rest', () => {
		expect(parseFeeOutFixed(['50', '2'])).toEqual(['50', '2'])
		expect(parseFeeOutFixed(2)).toBe(2)
		expect(parseFeeOutFixed('["50","2"]')).toEqual(['50', '2'])
		expect(parseFeeOutFixed('not json')).toBeNull()
		expect(parseFeeOutFixed(undefined)).toBeNull()
	})
})
