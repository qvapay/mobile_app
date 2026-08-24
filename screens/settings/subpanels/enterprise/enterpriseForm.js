/**
 * Pure form logic for the in-app enterprise registration wizard — mirrors the
 * server-side rules in qpweb's `lib/company-fiscal.js` (CCO 2026-08-14):
 * US → EIN + entity type + inc. state + registered address; CU → NIT + REEUP;
 * rest → generic tax id. Sanctioned jurisdictions are excluded from the
 * country list (the server rejects them anyway). Free of React Native imports
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
const seenCodes = new Set()
export const COMPANY_COUNTRIES = countries
	.filter((c) => {
		if (SANCTIONED_ISO2.has(c.code) || seenCodes.has(c.code)) { return false }
		seenCodes.add(c.code)
		return true
	})
	.map(({ name, code }) => ({ name, code }))
	.sort((a, b) => a.name.localeCompare(b.name))

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
export const REEUP_REGEX = /^[A-Za-z0-9./-]{4,20}$/
export const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Estado inicial del formulario del wizard
export const EMPTY_FORM = {
	companyName: '',
	activity: '',
	employeeCount: '',
	country: '',
	taxId: '',
	reeup: '',
	entityType: '',
	incState: '',
	addrLine1: '',
	addrCity: '',
	addrState: '',
	addrZip: '',
	directorName: '',
	email: '',
}

// Campos fiscales que se resetean al cambiar el país de constitución
export const EMPTY_FISCAL = { taxId: '', reeup: '', entityType: '', incState: '', addrLine1: '', addrCity: '', addrState: '', addrZip: '' }

/**
 * Valida el paso Empresa (nombre, actividad, empleados).
 * @param {object} form
 * @returns {string|null} Mensaje de error (localizado) o null si es válido.
 */
export const validateCompanyStep = (form) => {
	if (form.companyName.trim().length < 2) { return i18n.t('settings.enterprise.validation.companyName') }
	if (form.activity.trim().length < 3) { return i18n.t('settings.enterprise.validation.activity') }
	if (!EMPLOYEE_RANGES.some((r) => r.value === form.employeeCount)) { return i18n.t('settings.enterprise.validation.employeeCount') }
	return null
}

/**
 * Valida el paso Fiscal — espejo del bloque fiscalError del wizard web
 * (y de validateCompanyFiscal en el server).
 * @param {object} form
 * @returns {string|null} Mensaje de error (localizado) o null si es válido.
 */
export const validateFiscalStep = (form) => {
	if (!form.country) { return i18n.t('settings.enterprise.validation.country') }
	if (form.country === 'US') {
		if (!EIN_REGEX.test(form.taxId.trim().replace(/\s/g, ''))) { return i18n.t('settings.enterprise.validation.ein') }
		if (!US_ENTITY_TYPES.includes(form.entityType)) { return i18n.t('settings.enterprise.validation.entityType') }
		if (!US_STATES.some((s) => s.code === form.incState)) { return i18n.t('settings.enterprise.validation.incState') }
		if (form.addrLine1.trim().length < 3) { return i18n.t('settings.enterprise.validation.addrLine1') }
		if (form.addrCity.trim().length < 2) { return i18n.t('settings.enterprise.validation.addrCity') }
		if (!US_STATES.some((s) => s.code === form.addrState)) { return i18n.t('settings.enterprise.validation.addrState') }
		if (!US_ZIP_REGEX.test(form.addrZip.trim())) { return i18n.t('settings.enterprise.validation.addrZip') }
		return null
	}
	if (form.country === 'CU') {
		if (!NIT_REGEX.test(form.taxId.trim().replace(/\s/g, ''))) { return i18n.t('settings.enterprise.validation.nit') }
		if (!REEUP_REGEX.test(form.reeup.trim())) { return i18n.t('settings.enterprise.validation.reeup') }
		return null
	}
	if (form.taxId.trim().length < 3) { return i18n.t('settings.enterprise.validation.taxId') }
	return null
}

/**
 * Valida el paso Contacto y estatutos (director, email, PDF).
 * @param {object} form
 * @param {{ name?: string, size?: number }|null} file - Documento elegido en el picker.
 * @returns {string|null} Mensaje de error (localizado) o null si es válido.
 */
export const validateContactStep = (form, file) => {
	if (form.directorName.trim().length < 3) { return i18n.t('settings.enterprise.validation.directorName') }
	if (!EMAIL_REGEX.test(form.email.trim())) { return i18n.t('settings.enterprise.validation.email') }
	if (!file) { return i18n.t('settings.enterprise.validation.statutesPdf') }
	if (file.size && file.size > 10 * 1024 * 1024) { return i18n.t('settings.enterprise.validation.fileTooLarge') }
	return null
}

/**
 * Aplana el formulario a los campos multipart que espera el endpoint —
 * solo viajan los campos fiscales del país elegido (mismo criterio que el
 * wizard web).
 *
 * @param {object} form
 * @returns {Object<string, string>} Campos listos para FormData.
 */
export const buildRegisterFields = (form) => {
	const fields = {
		directorName: form.directorName.trim(),
		email: form.email.trim(),
		companyName: form.companyName.trim(),
		activity: form.activity.trim(),
		employeeCount: form.employeeCount,
		country: form.country,
		taxId: form.taxId.trim(),
	}
	if (form.country === 'CU') { fields.reeup = form.reeup.trim() }
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
