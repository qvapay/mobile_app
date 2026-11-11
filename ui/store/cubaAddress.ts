/**
 * Reglas PURAS de las direcciones de envío en Cuba y de las tiendas que entregan a domicilio
 * (tiendas de proveedor del marketplace). Espejo de qpweb:
 *
 *   - `scripts/marketplace/supplier/rules.js`: `isCubanIdentification`, `municipalityCovered`,
 *     `mergeDeliveryMunicipalities`, `supplierAddressIssue`, `supplierNeedsIdentification`.
 *   - `scripts/marketplace/validation.js` (`internationalAddressSchema`, rama CU): municipio
 *     de la lista cerrada de la provincia y carnet obligatorio.
 *
 * Si cambia una regla allí, cambia aquí. Sin react-native: se testea con
 * `@jest-environment node`. Los mensajes salen de i18n en CALL TIME.
 */
import i18n from '../../i18n'
import { CU_PROVINCES, CUBA_MUNICIPALITIES } from './cubaGeo'

/** Dígitos del carnet de identidad cubano. */
export const CU_ID_LENGTH = 11

/** Dígitos mínimos del teléfono del destinatario (un móvil cubano tiene 8). */
export const CU_PHONE_MIN_DIGITS = 8

/** Info pública de proveedor de un producto (`product.supplier` de `GET /shop/products`). */
export type SupplierInfo = {
	balance_only?: boolean
	/** 'CU' = entrega a domicilio en Cuba (municipio + carnet); 'US' = solo direcciones de EE. UU. */
	ship_country?: 'CU' | 'US' | string | null
	/** `{ [provincia]: [municipios canónicos] }` en las tiendas que entregan en Cuba; null en las demás. */
	delivery_municipalities?: Record<string, string[]> | null
}

/** Lo que estas reglas leen de una dirección (guardada o el formulario). */
export type CubaAddressLike = {
	country?: string | null
	state?: string | null
	city?: string | null
	identification?: string | null
}

/** "Camagüey " → "camaguey": el `norm` de qpweb (NFD, sin diacríticos, minúsculas, espacios). */
export const normPlace = (s: unknown): string => String(s ?? '')
	.normalize('NFD').replace(/[̀-ͯ]/g, '')
	.toLowerCase().trim().replace(/\s+/g, ' ')

const upper = (s: unknown): string => String(s ?? '').trim().toUpperCase()

/** ¿La dirección es de Cuba? */
export const isCubaAddress = (addr: { country?: string | null } | null | undefined): boolean => upper(addr?.country) === 'CU'

export const isCubanProvince = (code: string | null | undefined): boolean => CU_PROVINCES.some(p => p.code === upper(code))

/** Nombre de la provincia, o el código tal cual si no es una de Cuba. */
export const provinceName = (code: string | null | undefined): string => CU_PROVINCES.find(p => p.code === upper(code))?.name || String(code ?? '')

/** Municipios canónicos de una provincia ([] si el código no es de Cuba). */
export const municipalitiesOf = (code: string | null | undefined): readonly string[] => CUBA_MUNICIPALITIES[upper(code)] || []

/**
 * Nombre canónico del municipio si `name` es uno de la provincia (sin acentos ni mayúsculas,
 * como compara el servidor), o null. Una dirección vieja con el municipio escrito a mano lo
 * recupera así; si no casa, hay que elegirlo de la lista.
 */
export const canonicalMunicipality = (code: string | null | undefined, name: string | null | undefined): string | null => {
	const n = normPlace(name)
	if (!n) return null
	return municipalitiesOf(code).find(m => normPlace(m) === n) || null
}

// --- Carnet ---------------------------------------------------------------------

/**
 * Lo que guarda el campo del carnet: solo dígitos y como mucho 11. Un pegado como
 * «CI: 870213 32646» queda en `87021332646`. El servidor guarda el texto tal cual llega,
 * así que solo viajan los dígitos.
 */
export const normalizeIdentification = (raw: unknown): string => String(raw ?? '').replace(/\D/g, '').slice(0, CU_ID_LENGTH)

/**
 * Por qué el carnet no vale: `short` (no son 11 dígitos) o `date` (los dígitos 3-4 no son un
 * mes o los 5-6 no son un día). El dígito de control no se valida (no es público).
 */
export const identificationProblem = (raw: unknown): null | 'short' | 'date' => {
	const d = String(raw ?? '').replace(/\D/g, '')
	if (d.length !== CU_ID_LENGTH) return 'short'
	const mm = Number(d.slice(2, 4))
	const dd = Number(d.slice(4, 6))
	return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 ? null : 'date'
}

/** CI cubano: 11 dígitos con mes y día válidos en las posiciones 3-6. */
export const isCubanIdentification = (raw: unknown): boolean => identificationProblem(raw) === null

/** Mensaje del problema del carnet para el formulario (null si es válido). */
export const identificationMessage = (raw: unknown): string | null => {
	const problem = identificationProblem(raw)
	if (problem === 'date') return i18n.t('ui.newAddressForm.errors.idDate')
	if (problem === 'short') {
		const missing = CU_ID_LENGTH - String(raw ?? '').replace(/\D/g, '').length
		return i18n.t('ui.newAddressForm.errors.idShort', { count: Math.max(1, missing) })
	}
	return null
}

/** Dígitos del teléfono (el servidor admite el campo vacío, pero el repartidor lo usa). */
export const phoneDigits = (raw: unknown): number => String(raw ?? '').replace(/\D/g, '').length

// --- Tiendas que entregan en Cuba ------------------------------------------------

/** La tienda de proveedor pide carnet (y atestación OFAC a un US person) solo si entrega en Cuba. */
export const supplierNeedsIdentification = (info: SupplierInfo | null | undefined): boolean => !!info && upper(info.ship_country) !== 'US'

/**
 * ¿La dirección cae en un municipio que entrega el producto? Sin mapa = sin restricción por
 * municipio. Nombres sin acentos ni mayúsculas.
 */
export const municipalityCovered = (municipalities: Record<string, string[]> | null | undefined, addr: CubaAddressLike | null | undefined): boolean => {
	if (!municipalities) return true
	if (!isCubaAddress(addr)) return false
	const list = municipalities[upper(addr?.state)] || []
	const m = normPlace(addr?.city)
	return list.some(name => normPlace(name) === m)
}

/**
 * Municipios comunes a VARIOS productos (el carrito): intersección por provincia. Las entradas
 * null (productos sin entrega por municipio) se ignoran; sin ninguna ⇒ null. Una provincia sin
 * municipio común desaparece del resultado.
 */
export const mergeDeliveryMunicipalities = (list: (Record<string, string[]> | null | undefined)[]): Record<string, string[]> | null => {
	const maps = (list || []).filter((m): m is Record<string, string[]> => !!m && typeof m === 'object')
	if (!maps.length) return null
	const out: Record<string, string[]> = {}
	for (const [code, names] of Object.entries(maps[0])) {
		const common = (names || []).filter(name => maps.every(m => (m[code] || []).some(other => normPlace(other) === normPlace(name))))
		if (common.length) out[code] = common
	}
	return out
}

/**
 * Por qué esta dirección no sirve para el producto de una tienda de proveedor (null = sirve).
 * Tienda de EE. UU.: dirección en EE. UU. Tienda de Cuba: municipio cubierto y carnet válido.
 * Mismas frases que la web.
 */
export const supplierAddressIssue = (info: SupplierInfo | null | undefined, addr: CubaAddressLike | null | undefined): string | null => {
	if (!info || !addr) return null
	if (upper(info.ship_country) === 'US') return upper(addr.country) === 'US' ? null : i18n.t('ui.cubaAddress.issues.usOnly')
	if (!municipalityCovered(info.delivery_municipalities, addr)) {
		const city = String(addr.city ?? '').trim()
		return city ? i18n.t('ui.cubaAddress.issues.municipality', { municipality: city }) : i18n.t('ui.cubaAddress.issues.municipalityUnknown')
	}
	if (!isCubanIdentification(addr.identification)) return i18n.t('ui.cubaAddress.issues.identification')
	return null
}

/**
 * ¿Una dirección cubana guardada necesita completarse antes de servir para una entrega a
 * domicilio? Sin carnet válido o con un municipio que no es de la lista (direcciones viejas de
 * la web). Una dirección de otro país nunca: no se edita desde aquí.
 */
export const cubaAddressNeedsCompletion = (addr: CubaAddressLike | null | undefined): boolean => {
	if (!isCubaAddress(addr)) return false
	return !isCubanIdentification(addr?.identification) || !isCubanProvince(addr?.state) || !canonicalMunicipality(addr?.state, addr?.city)
}
