/**
 * Entrega de efectivo por zonas — espejo de `qpweb scripts/cash-delivery/rules.js`
 * y de la suma del fee en `app/api/withdraw/route.js`.
 * @jest-environment node
 */
import {
	cashFieldNames, cashZoneModeFor, hasCashZoneFields, findZone, provinceOptions, municipalitiesOf,
	zoneMarginPct, zoneSurchargePct, zoneCharge, calculateCashFee, grossFromNetCash, meetsZoneMinimum,
	etaLabel, etaParts, normalizePlace,
} from './cashZones'
import { getSelectFeePct } from './withdrawFees'

const FIELDS = [
	{ name: 'Nombre y Apellidos', type: 'text' },
	{ name: 'Provincia', type: 'select', options: [{ value: 'Villa Clara', fee_pct: 5 }, { value: 'La Habana', fee_pct: 0 }] },
	{ name: 'Municipio', type: 'text' },
]

const zone = (over = {}) => ({
	id: '1', coin_tick: 'USDCASH', province_code: 'VCL', province_name: 'Villa Clara', municipality: 'Santa Clara',
	is_capital: true, provider_pct: 3, margin_pct: null, min_usd: 50, small_flat_usd: 4,
	eta_min_hours: 24, eta_max_hours: 48, home_delivery: true, route: 'p2p', enabled: true, ...over,
})

const ZONES = [
	zone(),
	zone({ id: '2', municipality: 'Camajuaní', is_capital: false, provider_pct: 6, margin_pct: 2, small_flat_usd: null, eta_max_hours: 144, home_delivery: false }),
	zone({ id: '3', province_code: 'HAB', province_name: 'La Habana', municipality: 'Plaza de la Revolución' }),
	zone({ id: '4', province_code: 'HAB', province_name: 'La Habana', municipality: 'Cerrado', enabled: false }),
]

// fee_out 0 y sin fijo: el fee total es solo el cargo de zona
const CASH = { fee_out: '0', fee_out_gold: '0', fee_out_fixed: null }
// Con fee base: 1 % de la moneda
const CASH_BASE = { fee_out: '1', fee_out_gold: '0.5', fee_out_fixed: null }

describe('campos y modo', () => {
	test('provincia = primer select, municipio = campo con "municip"', () => {
		expect(cashFieldNames(FIELDS)).toEqual({ provinceField: 'Provincia', municipalityField: 'Municipio' })
		expect(hasCashZoneFields(FIELDS)).toBe(true)
		expect(hasCashZoneFields([{ name: 'Wallet', type: 'text' }])).toBe(false)
	})

	test('sin zonas o sin campos ⇒ null (comportamiento previo)', () => {
		expect(cashZoneModeFor({ coin: 'USDCASH', margin_pct: 1, zones: [] }, FIELDS)).toBeNull()
		expect(cashZoneModeFor(null, FIELDS)).toBeNull()
		expect(cashZoneModeFor({ coin: 'X', margin_pct: 1, zones: ZONES }, [{ name: 'Provincia', type: 'select' }])).toBeNull()
	})

	test('modo activo: zonas habilitadas + margen global', () => {
		const mode = cashZoneModeFor({ coin: 'USDCASH', margin_pct: 1.5, zones: ZONES }, FIELDS)
		expect(mode.provinceField).toBe('Provincia')
		expect(mode.municipalityField).toBe('Municipio')
		expect(mode.globalMarginPct).toBe(1.5)
		expect(mode.zones).toHaveLength(3)
	})
})

describe('búsqueda de zonas', () => {
	test('casa sin acentos ni mayúsculas, por nombre o código de provincia', () => {
		expect(findZone(ZONES, { province: 'villa clara', municipality: 'CAMAJUANI ' }).id).toBe('2')
		expect(findZone(ZONES, { province: 'VCL', municipality: 'Santa Clara' }).id).toBe('1')
		expect(findZone(ZONES, { province: 'Villa Clara', municipality: 'Remedios' })).toBeNull()
		expect(findZone(ZONES, { province: '', municipality: 'Santa Clara' })).toBeNull()
		expect(normalizePlace('  Güira   de Melena ')).toBe('guira de melena')
	})

	test('provincias únicas y municipios de una provincia (solo habilitadas)', () => {
		expect(provinceOptions(ZONES)).toEqual(['Villa Clara', 'La Habana'])
		expect(municipalitiesOf(ZONES, 'La Habana').map(z => z.municipality)).toEqual(['Plaza de la Revolución'])
		expect(municipalitiesOf(ZONES, '')).toEqual([])
	})
})

describe('cargo de zona', () => {
	test('margen: el de la zona o, si es null, el global', () => {
		expect(zoneMarginPct(zone(), 1)).toBe(1)
		expect(zoneMarginPct(zone({ margin_pct: 0 }), 1)).toBe(0)
		expect(zoneMarginPct(zone({ margin_pct: 2 }), 1)).toBe(2)
		expect(zoneSurchargePct(zone(), 1)).toBe(4)
	})

	test('tramo fijo bajo el umbral: max(bruto × pct, fija)', () => {
		// 100 × 3 % = 3 < 4 ⇒ 4; margen 1 % = 1
		expect(zoneCharge({ zone: zone(), amountUsd: 100, globalMarginPct: 1 })).toEqual({ providerCharge: 4, margin: 1, total: 5, marginPct: 1, flatApplied: true })
	})

	test('porcentaje por encima: 3 % + 1 %', () => {
		expect(zoneCharge({ zone: zone(), amountUsd: 500, globalMarginPct: 1 })).toEqual({ providerCharge: 15, margin: 5, total: 20, marginPct: 1, flatApplied: false })
	})

	test('sin tarifa fija ⇒ solo porcentaje, redondeo a centavos', () => {
		expect(zoneCharge({ zone: ZONES[1], amountUsd: 123.45, globalMarginPct: 1 })).toEqual({ providerCharge: 7.41, margin: 2.47, total: 9.88, marginPct: 2, flatApplied: false })
	})

	test('sin zona o sin importe ⇒ 0', () => {
		expect(zoneCharge({ zone: null, amountUsd: 100 }).total).toBe(0)
		expect(zoneCharge({ zone: zone(), amountUsd: 0 }).total).toBe(0)
	})
})

describe('fee total', () => {
	test('base + cargo de zona', () => {
		const fee = calculateCashFee(500, CASH_BASE, { zone: zone(), globalMarginPct: 1 })
		expect(fee).toEqual({ base: 5, zone: { providerCharge: 15, margin: 5, total: 20, marginPct: 1, flatApplied: false }, total: 25 })
	})

	test('GOLD paga su tarifa base', () => {
		expect(calculateCashFee(500, CASH_BASE, { isGold: true, zone: zone(), globalMarginPct: 1 }).total).toBe(22.5)
	})

	test('sin zona = calculateFee de siempre', () => {
		expect(calculateCashFee(200, CASH_BASE).total).toBe(2)
	})

	test('el fee_pct del select de provincia se ignora en modo zonas', () => {
		const form = { provincia: 'Villa Clara' }
		expect(getSelectFeePct(FIELDS, form)).toBe(5)
		expect(getSelectFeePct(FIELDS, form, 'Provincia')).toBe(0)
	})
})

describe('bruto desde neto (bisección)', () => {
	test('vuelve al neto pedido, al centavo superior', () => {
		for (const net of [10, 50, 96, 100, 480, 1234.56]) {
			const gross = grossFromNetCash(net, CASH_BASE, { zone: zone(), globalMarginPct: 1 })
			const delivered = gross - calculateCashFee(gross, CASH_BASE, { zone: zone(), globalMarginPct: 1 }).total
			expect(delivered).toBeGreaterThanOrEqual(net - 0.01)
			// un centavo menos ya no alcanza (o queda dentro del redondeo)
			const less = gross - 0.01
			expect(less - calculateCashFee(less, CASH_BASE, { zone: zone(), globalMarginPct: 1 }).total).toBeLessThan(net + 0.01)
		}
	})

	test('tramo fijo: 95 netos piden 100 brutos (4 fijo + 1 margen)', () => {
		expect(grossFromNetCash(95, CASH, { zone: zone(), globalMarginPct: 1 })).toBe(100)
	})

	test('sin moneda o neto inválido ⇒ 0', () => {
		expect(grossFromNetCash(10, null, { zone: zone() })).toBe(0)
		expect(grossFromNetCash(0, CASH, { zone: zone() })).toBe(0)
	})
})

describe('mínimo y plazo', () => {
	test('el mínimo se mide sobre lo entregado', () => {
		expect(meetsZoneMinimum(zone(), 50)).toBe(true)
		expect(meetsZoneMinimum(zone(), 49.99)).toBe(false)
		expect(meetsZoneMinimum(null, 1000)).toBe(false)
	})

	test('≤ 72 h en horas, más en días', () => {
		expect(etaLabel(zone())).toBe('24–48 h')
		expect(etaLabel(zone({ eta_min_hours: 48, eta_max_hours: 72 }))).toBe('48–72 h')
		expect(etaLabel(zone({ eta_min_hours: 48, eta_max_hours: 144 }))).toBe('2–6 días')
		expect(etaLabel(zone({ eta_min_hours: 6, eta_max_hours: 96 }), 'days')).toBe('1–4 days')
		expect(etaParts(zone({ eta_min_hours: 6, eta_max_hours: 96 }))).toEqual({ unit: 'days', min: 1, max: 4 })
	})
})
