/**
 * Pure form logic for the in-app enterprise registration wizard — mirrors the
 * server-side rules in qpweb's `lib/company-fiscal.js` (CCO 2026-08-14):
 * US → EIN + entity type + inc. state + registered address; CU → NIT;
 * rest → generic tax id. Sanctioned jurisdictions are excluded from the
 * country list (the server rejects them anyway). Una empresa declara además a
 * sus socios (espejo de `lib/company-owners.js`): en Cuba todos los de la
 * escritura y al menos uno; fuera de Cuba solo quienes tengan 25 % o más, y la
 * lista puede ir vacía. La rama «cuenta propia» (`orgKind: 'tcp'`, espejo de
 * `lib/company-tcp.js`) es solo para Cuba: NIT obligatorio, sin socios y
 * documento opcional. Free of React Native imports
 * so it runs under `@jest-environment node` (see keypadAmount.js) — the i18n
 * singleton is RN-free too, and the localized validation messages resolve via
 * `i18n.t()` EN CALL TIME (never at module scope) so language switches apply.
 */

import i18n from '../../../../i18n'
import { countries } from '../../../../labels/countries'

// Espejo de DEFAULT_ISO2 en qpweb lib/sanctioned-jurisdictions.js — países
// excluidos del selector (Cuba y Venezuela NO están: licencias CACR / SDN dirigido)
const SANCTIONED_ISO2 = new Set(['AF', 'BY', 'IQ', 'IR', 'KP', 'LY', 'MM', 'SD', 'SO', 'SS', 'SY', 'YE'])

// Lista de países elegibles para constitución de empresa: el dataset de la app
// (labels/countries) deduplicado por código ISO-2 y sin jurisdicciones sancionadas
// (una sola pasada; el Set de deduplicación muere con la IIFE en vez de
// quedarse vivo a nivel de módulo)
export const COMPANY_COUNTRIES: { name: string, code: string }[] = (() => {
	const seenCodes = new Set<string>()
	const eligible: { name: string, code: string }[] = []
	for (const { name, code } of countries) {
		if (SANCTIONED_ISO2.has(code) || seenCodes.has(code)) { continue }
		seenCodes.add(code)
		eligible.push({ name, code })
	}
	return eligible.sort((a, b) => a.name.localeCompare(b.name))
})()

// Rangos de empleados — los values viajan tal cual al endpoint (mismos que el wizard web)
export const EMPLOYEE_RANGES = [
	{ value: '1-10', label: '1–10' },
	{ value: '11-50', label: '11–50' },
	{ value: '51-200', label: '51–200' },
	{ value: '201-500', label: '201–500' },
	{ value: '500+', label: '500+' },
]

export const US_ENTITY_TYPES = ['LLC', 'C-Corp', 'S-Corp', 'Partnership', 'Sole Proprietorship', 'Nonprofit']

export const US_STATES = [
	{ code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
	{ code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
	{ code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
	{ code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
	{ code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
	{ code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
	{ code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
	{ code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
	{ code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
	{ code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
	{ code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
	{ code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
	{ code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
	{ code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
	{ code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
	{ code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
	{ code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
]

// Mismos regexes que el server (lib/company-fiscal.js)
export const EIN_REGEX = /^\d{2}-?\d{7}$/
export const NIT_REGEX = /^\d{11}$/
export const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Tope del documento, mismo que el server (register-company.js)
const MAX_FILE_BYTES = 10 * 1024 * 1024

// Espejo de lib/company-owners.js en qpweb
export const MAX_COMPANY_OWNERS = 20
export const INTL_OWNER_MIN_PCT = 25

/** Qué se registra: empresa o trabajador por cuenta propia (TCP, figura cubana). */
export type OrgKind = 'business' | 'tcp'

// Espejo de TCP_COUNTRY en qpweb lib/company-tcp.js: el TCP no elige país
export const TCP_COUNTRY = 'CU'

// Espejo de TCP_ENTITY_TYPE en qpweb lib/company-tcp.js
const TCP_ENTITY_TYPE = 'TCP'

/** Fila del listado de socios. `id` solo identifica la fila en pantalla: no viaja al servidor. */
export type OwnerRow = { id: number, name: string, pct: string, email: string, username: string }

/** Campos editables de una fila de socio. */
export type OwnerField = Exclude<keyof OwnerRow, 'id'>

/** Formulario completo del wizard (todo son strings, incluso lo opcional, salvo la lista de socios). */
export type EnterpriseForm = {
	orgKind: OrgKind
	companyName: string
	activity: string
	employeeCount: string
	/** ISO-2 del país de constitución. */
	country: string
	taxId: string
	entityType: string
	incState: string
	addrLine1: string
	addrCity: string
	addrState: string
	addrZip: string
	owners: OwnerRow[]
	directorName: string
	email: string
}

/** Documento elegido en el picker (solo se leen nombre y tamaño). */
export type StatutesFile = { name?: string | null, size?: number | null } | null

// El listado parte de una fila, como el wizard web
const EMPTY_OWNER: OwnerRow = { id: 0, name: '', pct: '', email: '', username: '' }

// Estado inicial del formulario del wizard
export const EMPTY_FORM: EnterpriseForm = {
	orgKind: 'business',
	companyName: '',
	activity: '',
	employeeCount: '',
	country: '',
	taxId: '',
	entityType: '',
	incState: '',
	addrLine1: '',
	addrCity: '',
	addrState: '',
	addrZip: '',
	owners: [EMPTY_OWNER],
	directorName: '',
	email: '',
}

// Campos fiscales que se resetean al cambiar el país de constitución. Los socios no:
// son las mismas personas, y la regla del país nuevo se valida al continuar (igual que en la web)
export const EMPTY_FISCAL: Partial<EnterpriseForm> = { taxId: '', entityType: '', incState: '', addrLine1: '', addrCity: '', addrState: '', addrZip: '' }

/**
 * Cambia lo que se registra. Cada rama tiene sus propios datos fiscales, así
 * que al cambiar se vacían siempre, aunque el país coincida: de TCP a empresa
 * no debe quedar Cuba preseleccionada sin que nadie la haya elegido, ni el NIT.
 * Los socios también: un TCP no tiene. Nombre, actividad y contacto valen para
 * las dos ramas y se conservan.
 * @param form
 * @param orgKind - Rama elegida.
 * @returns El mismo form si la rama no cambia; si no, uno nuevo limpio.
 */
export const withOrgKind = (form: EnterpriseForm, orgKind: OrgKind): EnterpriseForm => {
	if (form.orgKind === orgKind) { return form }
	return { ...form, ...EMPTY_FISCAL, owners: EMPTY_FORM.owners, orgKind, country: orgKind === 'tcp' ? TCP_COUNTRY : '' }
}

/**
 * Cambia un campo de una fila de socio.
 * @param form
 * @param id - Fila.
 * @param field - Campo.
 * @param value - Texto tecleado.
 * @returns Un form nuevo.
 */
export const withOwnerField = (form: EnterpriseForm, id: number, field: OwnerField, value: string): EnterpriseForm => ({
	...form,
	owners: form.owners.map((owner) => (owner.id === id ? { ...owner, [field]: value } : owner)),
})

/**
 * Añade una fila vacía, hasta el tope del servidor.
 * @param form
 * @returns Un form nuevo, o el mismo si ya está en el tope.
 */
export const withOwnerAdded = (form: EnterpriseForm): EnterpriseForm => {
	if (form.owners.length >= MAX_COMPANY_OWNERS) { return form }
	const id = Math.max(...form.owners.map((owner) => owner.id)) + 1
	return { ...form, owners: [...form.owners, { ...EMPTY_OWNER, id }] }
}

/**
 * Quita una fila. La última se queda: el listado nunca se pinta vacío.
 * @param form
 * @param id - Fila.
 * @returns Un form nuevo, o el mismo si solo queda esa fila.
 */
export const withOwnerRemoved = (form: EnterpriseForm, id: number): EnterpriseForm => {
	if (form.owners.length <= 1) { return form }
	return { ...form, owners: form.owners.filter((owner) => owner.id !== id) }
}

// ¿La fila está totalmente vacía? Se descarta en silencio, como en el servidor
const isOwnerRowEmpty = ({ name, pct, email, username }: OwnerRow) => !name.trim() && !pct.trim() && !email.trim() && !username.trim()

// El teclado decimal escribe coma en un teléfono en español, y el servidor espera punto.
// Texto ilegible → NaN, que la validación rechaza
const parseOwnerPct = (text: string): number | null => {
	const value = text.trim().replace(',', '.')
	return value === '' ? null : Math.round(Number(value) * 100) / 100
}

// Filas con datos, normalizadas como las guarda el servidor (sin el `id` de pantalla)
const normalizedOwners = (rows: OwnerRow[]) => rows.filter((row) => !isOwnerRowEmpty(row)).map((row) => ({
	name: row.name.trim(),
	pct: parseOwnerPct(row.pct),
	email: row.email.trim().toLowerCase() || null,
	username: row.username.trim().replace(/^@/, '') || null,
}))

/**
 * Valida el listado de socios — espejo de validateCompanyOwners en qpweb. En
 * Cuba manda la escritura: al menos un socio y el porcentaje es opcional. Fuera
 * de Cuba el 25 % define quién entra en la lista, así que hace falta saberlo.
 * @param form
 * @returns Mensaje de error (localizado) o null si es válido.
 */
const validateOwners = ({ owners: rows, country }: EnterpriseForm): string | null => {
	const owners = normalizedOwners(rows)
	const isCuba = country === 'CU'
	if (isCuba && owners.length === 0) { return i18n.t('settings.enterprise.validation.ownersCubaRequired') }
	for (const { name, pct, email } of owners) {
		if (name.length < 3) { return i18n.t('settings.enterprise.validation.ownerName') }
		if (pct !== null && !(pct > 0 && pct <= 100)) { return i18n.t('settings.enterprise.validation.ownerPct', { name }) }
		if (!isCuba && pct === null) { return i18n.t('settings.enterprise.validation.ownerPctRequired', { name }) }
		if (!isCuba && pct !== null && pct < INTL_OWNER_MIN_PCT) { return i18n.t('settings.enterprise.validation.ownerPctMin', { name, min: INTL_OWNER_MIN_PCT }) }
		if (email && !EMAIL_REGEX.test(email)) { return i18n.t('settings.enterprise.validation.ownerEmail', { name }) }
	}
	const total = owners.reduce((sum, { pct }) => sum + (pct ?? 0), 0)
	if (total > 100.01) { return i18n.t('settings.enterprise.validation.ownersTotal') }
	return null
}

/**
 * Valida el paso Empresa (nombre, actividad, empleados).
 * @param form
 * @returns Mensaje de error (localizado) o null si es válido.
 */
export const validateCompanyStep = (form: EnterpriseForm): string | null => {
	const isTcp = form.orgKind === 'tcp'
	if (form.companyName.trim().length < 2) { return isTcp ? i18n.t('settings.enterprise.validation.tcpBusinessName') : i18n.t('settings.enterprise.validation.companyName') }
	if (form.activity.trim().length < 3) { return isTcp ? i18n.t('settings.enterprise.validation.tcpActivity') : i18n.t('settings.enterprise.validation.activity') }
	if (!EMPLOYEE_RANGES.some((r) => r.value === form.employeeCount)) { return i18n.t('settings.enterprise.validation.employeeCount') }
	return null
}

/**
 * Valida el paso Fiscal — espejo del bloque fiscalError del wizard web
 * (y de validateCompanyFiscal en el server): primero los datos fiscales, luego
 * los socios, que van en el mismo paso.
 * @param form
 * @returns Mensaje de error (localizado) o null si es válido.
 */
export const validateFiscalStep = (form: EnterpriseForm): string | null => {
	// Un TCP no elige país ni tiene socios: el NIT es lo único que hay que contrastar
	if (form.orgKind === 'tcp') {
		return NIT_REGEX.test(form.taxId.trim().replace(/\s/g, '')) ? null : i18n.t('settings.enterprise.validation.nit')
	}
	if (!form.country) { return i18n.t('settings.enterprise.validation.country') }
	if (form.country === 'US') {
		if (!EIN_REGEX.test(form.taxId.trim().replace(/\s/g, ''))) { return i18n.t('settings.enterprise.validation.ein') }
		if (!US_ENTITY_TYPES.includes(form.entityType)) { return i18n.t('settings.enterprise.validation.entityType') }
		if (!US_STATES.some((s) => s.code === form.incState)) { return i18n.t('settings.enterprise.validation.incState') }
		if (form.addrLine1.trim().length < 3) { return i18n.t('settings.enterprise.validation.addrLine1') }
		if (form.addrCity.trim().length < 2) { return i18n.t('settings.enterprise.validation.addrCity') }
		if (!US_STATES.some((s) => s.code === form.addrState)) { return i18n.t('settings.enterprise.validation.addrState') }
		if (!US_ZIP_REGEX.test(form.addrZip.trim())) { return i18n.t('settings.enterprise.validation.addrZip') }
	} else if (form.country === 'CU') {
		if (!NIT_REGEX.test(form.taxId.trim().replace(/\s/g, ''))) { return i18n.t('settings.enterprise.validation.nit') }
	} else if (form.taxId.trim().length < 3) {
		return i18n.t('settings.enterprise.validation.taxId')
	}
	return validateOwners(form)
}

/**
 * Valida el paso Contacto y estatutos (director, email, PDF). En un TCP el
 * documento es opcional, pero si lo adjunta rige el mismo tope de tamaño.
 * @param form
 * @param file - Documento elegido en el picker.
 * @returns Mensaje de error (localizado) o null si es válido.
 */
export const validateContactStep = (form: EnterpriseForm, file: StatutesFile): string | null => {
	const isTcp = form.orgKind === 'tcp'
	if (form.directorName.trim().length < 3) { return isTcp ? i18n.t('settings.enterprise.validation.tcpHolderName') : i18n.t('settings.enterprise.validation.directorName') }
	if (!EMAIL_REGEX.test(form.email.trim())) { return i18n.t('settings.enterprise.validation.email') }
	if (!file && !isTcp) { return i18n.t('settings.enterprise.validation.statutesPdf') }
	if (file?.size && file.size > MAX_FILE_BYTES) { return i18n.t('settings.enterprise.validation.fileTooLarge') }
	return null
}

/**
 * Aplana el formulario a los campos multipart que espera el endpoint —
 * solo viajan los campos fiscales del país elegido (mismo criterio que el
 * wizard web). Un TCP lleva `orgKind` y Cuba fija, sin socios; una empresa no
 * lleva `orgKind` (el server la asume por defecto) y sí `owners`, un JSON que
 * puede ser `[]` fuera de Cuba.
 *
 * @param form
 * @returns Campos listos para FormData.
 */
export const buildRegisterFields = (form: EnterpriseForm): Record<string, string> => {
	const fields: Record<string, string> = {
		directorName: form.directorName.trim(),
		email: form.email.trim(),
		companyName: form.companyName.trim(),
		activity: form.activity.trim(),
		employeeCount: form.employeeCount,
		country: form.country,
		taxId: form.taxId.trim(),
	}
	if (form.orgKind === 'tcp') {
		fields.orgKind = 'tcp'
		fields.country = TCP_COUNTRY
		return fields
	}
	fields.owners = JSON.stringify(normalizedOwners(form.owners))
	if (form.country === 'US') {
		fields.entityType = form.entityType
		fields.incState = form.incState
		fields.addrLine1 = form.addrLine1.trim()
		fields.addrCity = form.addrCity.trim()
		fields.addrState = form.addrState
		fields.addrZip = form.addrZip.trim()
	}
	return fields
}

/**
 * Clave de i18n de la fila «Estatutos» del panel Empresa. `entity_type` se lee
 * de forma tolerante: qpweb lo devuelve en `GET /user/company` desde la 4.4.14,
 * y sin él un TCP sin documento sigue diciendo «No enviados», que es cierto.
 * @param company
 * @param company.statutes_sent - Si la solicitud lleva documento.
 * @param company.entity_type - Figura guardada en `companies.entity_type`.
 * @returns Clave de `settings.enterprise.details`.
 */
export const statutesRowKey = ({ statutes_sent, entity_type }: { statutes_sent?: boolean, entity_type?: string | null }): string => {
	if (statutes_sent) { return 'settings.enterprise.details.statutesSent' }
	if (entity_type === TCP_ENTITY_TYPE) { return 'settings.enterprise.details.statutesNotRequired' }
	return 'settings.enterprise.details.statutesNotSent'
}
