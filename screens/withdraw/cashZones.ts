/**
 * Entrega de efectivo por zona (USDCASH hoy, CUPCASH después) — espejo de las
 * reglas del servidor (`qpweb scripts/cash-delivery/rules.js` + `app/api/withdraw/route.js`)
 * para que la app cotice EXACTAMENTE el fee que cobra el backend.
 *
 * Contrato: `GET /withdraw/cash-zones?coin=TICK` → `{ coin, margin_pct, zones[] }`.
 * Zonas vacías ⇒ la moneda no va por zonas y todo sigue como antes.
 *
 * El modo por zonas solo se activa si hay zonas Y el `working_data` de la moneda
 * tiene provincia (el PRIMER campo `type: 'select'`) y municipio (el campo cuyo
 * nombre contiene "municip"). En ese modo:
 * - el `fee_pct` del select de provincia se IGNORA;
 * - el cargo de zona se suma al fee base: `max(bruto × provider_pct, small_flat_usd)`
 *   + `bruto × margen` (cada parte a centavos);
 * - lo ENTREGADO (bruto − fee total) debe ser ≥ `min_usd` (si no, 400 `CASH_BELOW_MIN`).
 */

import { rawFee } from './withdrawFees'
import type { FeeCoin, FeeOptions } from './withdrawFees'
import type { CashZone, CashZonesPayload, CoinWorkingField, Decimal } from '../../types/domain'

export type { CashZone, CashZonesPayload }

/** Nombres ORIGINALES (de `working_data`) de los campos de provincia y municipio. */
export type CashFieldNames = { provinceField: string | null, municipalityField: string | null }

/** Modo por zonas activo para una moneda. */
export type CashZoneMode = {
	zones: CashZone[]
	globalMarginPct: number
	provinceField: string
	municipalityField: string
}

/** Desglose del cargo de zona sobre el bruto. */
export type ZoneCharge = {
	providerCharge: number
	margin: number
	total: number
	marginPct: number
	/** El cargo del proveedor es la tarifa FIJA de la zona (montos pequeños), no su %. */
	flatApplied: boolean
}

/** Desglose del fee total de un retiro (base + select + zona). */
export type CashFeeBreakdown = { base: number, zone: ZoneCharge, total: number }

/** Errores del servidor del modo por zonas. */
export const CASH_ERRORS = Object.freeze({ ZONE_UNAVAILABLE: 'CASH_ZONE_UNAVAILABLE', BELOW_MIN: 'CASH_BELOW_MIN' })

/** Margen de QvaPay por defecto (el servidor manda el vigente en `margin_pct`). */
export const DEFAULT_MARGIN_PCT = 1

/** Días tras los que una entrega asignada se puede cancelar (copy del aviso). */
export const CASH_CANCEL_AFTER_DAYS = 6

const cents = (n: number): number => Math.round(Number(n) * 100) / 100
const num = (v: unknown, fallback = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : fallback }
const isBlank = (v: unknown): boolean => v === null || v === undefined || v === ''

/** "Güira de Melena " → "guira de melena": sin acentos, mayúsculas ni dobles espacios. */
export const normalizePlace = (s: unknown): string => String(s ?? '')
	.normalize('NFD').replace(/[̀-ͯ]/g, '')
	.toLowerCase().replace(/\s+/g, ' ').trim()

/** Provincia = primer `select`; municipio = campo cuyo nombre contiene "municip". */
export function cashFieldNames(workingFields: CoinWorkingField[] | null | undefined): CashFieldNames {
	const fields = Array.isArray(workingFields) ? workingFields : []
	const provinceField = fields.find(f => f?.type === 'select')?.name || null
	const municipalityField = fields.find(f => /municip/i.test(String(f?.name || '')))?.name || null
	return { provinceField, municipalityField }
}

/** ¿El formulario de la moneda podría ir por zonas? (decide si vale la pena pedirlas) */
export const hasCashZoneFields = (workingFields: CoinWorkingField[] | null | undefined): boolean => {
	const { provinceField, municipalityField } = cashFieldNames(workingFields)
	return !!provinceField && !!municipalityField
}

/**
 * Modo por zonas de una moneda, o null (comportamiento previo) si no hay zonas
 * habilitadas o el formulario no tiene provincia + municipio.
 */
export function cashZoneModeFor(payload: CashZonesPayload | null | undefined, workingFields: CoinWorkingField[] | null | undefined): CashZoneMode | null {
	const zones = (Array.isArray(payload?.zones) ? payload!.zones : []).filter(z => z && z.enabled !== false)
	if (!zones.length) return null
	const { provinceField, municipalityField } = cashFieldNames(workingFields)
	if (!provinceField || !municipalityField) return null
	return { zones, globalMarginPct: num(payload?.margin_pct, DEFAULT_MARGIN_PCT), provinceField, municipalityField }
}

/** Zona por provincia (código o nombre) + municipio, sin acentos ni mayúsculas. */
export function findZone(zones: CashZone[] | null | undefined, { province, municipality }: { province?: string | null, municipality?: string | null }): CashZone | null {
	const p = normalizePlace(province)
	const m = normalizePlace(municipality)
	if (!p || !m) return null
	return (zones || []).find(z =>
		(normalizePlace(z.province_code) === p || normalizePlace(z.province_name) === p) &&
		normalizePlace(z.municipality) === m,
	) || null
}

/** Provincias únicas (por nombre) de las zonas habilitadas, en el orden del servidor. */
export function provinceOptions(zones: CashZone[] | null | undefined): string[] {
	const seen = new Set<string>()
	const out: string[] = []
	for (const z of zones || []) {
		if (z.enabled === false) continue
		const key = normalizePlace(z.province_name)
		if (!key || seen.has(key)) continue
		seen.add(key)
		out.push(z.province_name)
	}
	return out
}

/** Zonas habilitadas de una provincia. */
export const municipalitiesOf = (zones: CashZone[] | null | undefined, province: string | null | undefined): CashZone[] => {
	const p = normalizePlace(province)
	if (!p) return []
	return (zones || []).filter(z => z.enabled !== false && (normalizePlace(z.province_name) === p || normalizePlace(z.province_code) === p))
}

/** Margen efectivo de una zona: el suyo o, si es null, el global. */
export const zoneMarginPct = (zone: CashZone | null | undefined, globalMarginPct: Decimal = DEFAULT_MARGIN_PCT): number =>
	isBlank(zone?.margin_pct) ? num(globalMarginPct, DEFAULT_MARGIN_PCT) : num(zone!.margin_pct)

/** Recargo % nominal de la zona (proveedor + margen) para la etiqueta del municipio. */
export const zoneSurchargePct = (zone: CashZone, globalMarginPct: Decimal = DEFAULT_MARGIN_PCT): number =>
	Math.round((num(zone.provider_pct) + zoneMarginPct(zone, globalMarginPct)) * 100) / 100

/** Cargo de zona sobre el BRUTO del retiro (se suma al fee base de la moneda). */
export function zoneCharge({ zone, amountUsd, globalMarginPct = DEFAULT_MARGIN_PCT }: { zone: CashZone | null | undefined, amountUsd: Decimal | null | undefined, globalMarginPct?: Decimal }): ZoneCharge {
	const amount = num(amountUsd)
	if (!zone || amount <= 0) return { providerCharge: 0, margin: 0, total: 0, marginPct: 0, flatApplied: false }
	const flat = isBlank(zone.small_flat_usd) ? 0 : num(zone.small_flat_usd)
	const pctCharge = amount * num(zone.provider_pct) / 100
	const providerCharge = cents(Math.max(pctCharge, flat))
	const marginPct = zoneMarginPct(zone, globalMarginPct)
	const margin = cents(amount * marginPct / 100)
	return { providerCharge, margin, total: cents(providerCharge + margin), marginPct, flatApplied: flat > 0 && flat > pctCharge }
}

/** Opciones de fee con la zona elegida. */
export type CashFeeOptions = FeeOptions & { zone?: CashZone | null, globalMarginPct?: Decimal }

/**
 * Fee total con desglose: base de la moneda (+ % de selects, sin el de provincia en
 * modo zonas) + cargo de zona — misma suma y redondeo que el servidor.
 */
export function calculateCashFee(amount: Decimal | null | undefined, coin: FeeCoin | null | undefined, { isGold = false, selectFeePct = 0, zone = null, globalMarginPct = DEFAULT_MARGIN_PCT }: CashFeeOptions = {}): CashFeeBreakdown {
	// Igual que quoteWithdrawFee del servidor: se suma el fee base SIN redondear y se
	// redondea solo el total (redondear antes desviaba 1 centavo en casos de medio centavo).
	const raw = rawFee(amount, coin, { isGold, selectFeePct })
	const charge = coin ? zoneCharge({ zone, amountUsd: amount, globalMarginPct }) : zoneCharge({ zone: null, amountUsd: 0 })
	return { base: cents(raw), zone: charge, total: cents(raw + charge.total) }
}

/**
 * Inverso por bisección (el tramo fijo de la zona rompe la fórmula cerrada): el bruto
 * mínimo que entrega `netUsd`, redondeado hacia arriba a centavos — igual que el wizard web.
 */
export function grossFromNetCash(netUsd: Decimal | null | undefined, coin: FeeCoin | null | undefined, opts: CashFeeOptions = {}): number {
	const net = num(netUsd)
	if (!coin || net <= 0) return 0
	let lo = net
	let hi = net * 2 + 100
	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2
		if (mid - calculateCashFee(mid, coin, opts).total < net) lo = mid
		else hi = mid
	}
	return Math.ceil(hi * 100) / 100
}

/** ¿Lo entregado alcanza el mínimo de la zona? */
export const meetsZoneMinimum = (zone: CashZone | null | undefined, receiveUsd: Decimal | null | undefined): boolean =>
	!!zone && num(receiveUsd) >= num(zone.min_usd)

/** Plazo de entrega estructurado (la pantalla lo traduce). */
export type EtaParts = { unit: 'hours' | 'days', min: number, max: number }

/** ≤ 72 h se dice en horas; si no, en días (mínimo 1). */
export function etaParts(zone: Pick<CashZone, 'eta_min_hours' | 'eta_max_hours'> | null | undefined): EtaParts {
	const lo = num(zone?.eta_min_hours, 24)
	const hi = num(zone?.eta_max_hours, 48)
	if (hi <= 72) return { unit: 'hours', min: lo, max: hi }
	return { unit: 'days', min: Math.max(1, Math.round(lo / 24)), max: Math.round(hi / 24) }
}

/** "24–48 h" · "2–6 días" (el sufijo de días es configurable para el i18n). */
export function etaLabel(zone: Pick<CashZone, 'eta_min_hours' | 'eta_max_hours'> | null | undefined, daysWord = 'días'): string {
	const { unit, min, max } = etaParts(zone)
	return unit === 'hours' ? `${min}–${max} h` : `${min}–${max} ${daysWord}`
}

/** "4" · "3.5": porcentaje sin ceros de sobra. */
export const formatPct = (pct: number): string => String(Math.round(pct * 100) / 100)

/** Lo que la fila de una provincia cuenta de un vistazo. */
export type ProvinceSummary = {
	name: string
	/** Código corto del servidor ("LHA", "VCL"): el monograma de la fila. */
	code: string
	municipalities: number
	/** La zona más rápida (menor plazo máximo): su plazo es el "desde" de la provincia. */
	fastest: CashZone
	minPct: number
	maxPct: number
}

/** Resumen por provincia (en el orden del servidor) para el selector de destino. */
export function provinceSummaries(zones: CashZone[] | null | undefined, globalMarginPct: Decimal = DEFAULT_MARGIN_PCT): ProvinceSummary[] {
	return provinceOptions(zones).map((name) => {
		const list = municipalitiesOf(zones, name)
		const pcts = list.map(z => zoneSurchargePct(z, globalMarginPct))
		const fastest = list.reduce((best, z) => (num(z.eta_max_hours, 48) < num(best.eta_max_hours, 48) ? z : best), list[0])
		return {
			name,
			code: String(list[0]?.province_code || '').toUpperCase(),
			municipalities: list.length,
			fastest,
			minPct: Math.min(...pcts),
			maxPct: Math.max(...pcts),
		}
	})
}

/** Municipios de una provincia con la cabecera primero (el resto, en el orden del servidor). */
export const sortedMunicipalities = (zones: CashZone[] | null | undefined, province: string | null | undefined): CashZone[] => {
	const list = municipalitiesOf(zones, province)
	return [...list.filter(z => z.is_capital), ...list.filter(z => !z.is_capital)]
}
