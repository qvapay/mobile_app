/**
 * Formulario de la ficha CIP («Datos de tu cuenta» en Datos personales). PURO: espejo
 * de la validación del `cipSchema` de `app/api/user/update/route.js` en qpweb, para
 * que el 400 no llegue nunca — el backend guarda nombre y bio ANTES de validar `cip`,
 * así que un rechazo suyo dejaría el perfil a medias.
 *
 * Reglas (BSA §1022.210): una persona de EE. UU. debe dar SSN/ITIN de 9 dígitos y una
 * dirección de EE. UU. completa (calle, ciudad, estado de 2 letras, ZIP `12345` o
 * `12345-6789`, país `US`). El SSN se omite del payload cuando ya hay uno guardado y el
 * campo quedó en blanco (qpweb lo conserva); `us_person: false` lo borra.
 */

import { US_STATES, US_ZIP_REGEX } from '../enterprise/enterpriseForm'

import type { CipPayload, UserCip } from '../../../../types/domain'

export type CipForm = {
	usPerson: boolean
	/** Lo tecleado (con o sin guiones); en blanco = no tocar el guardado. */
	ssn: string
	addrLine1: string
	addrLine2: string
	addrCity: string
	addrState: string
	addrPostal: string
}

/** Campos que la pantalla puede resaltar (los `block_reason` de dato faltante apuntan aquí). */
export type CipField = 'usPerson' | 'ssn' | 'addrLine1' | 'addrCity' | 'addrState' | 'addrPostal'

/** Error de validación: el campo a resaltar y el sufijo de la clave i18n (`settings.userdata.cip.errors.<key>`). */
export type CipValidationError = { field: CipField, key: 'ssnInvalid' | 'addressRequired' | 'stateRequired' | 'zipInvalid' }

export const EMPTY_CIP_FORM: CipForm = { usPerson: false, ssn: '', addrLine1: '', addrLine2: '', addrCity: '', addrState: '', addrPostal: '' }

/**
 * Estados del selector de la ficha: los 50 + DC del registro de empresa MÁS Puerto Rico,
 * que el `cipSchema` de qpweb acepta (`scripts/shop/us-state-tax`) y el de empresa no.
 */
export const CIP_US_STATES: ReadonlyArray<{ code: string, name: string }> = [...US_STATES, { code: 'PR', name: 'Puerto Rico' }]

/** Códigos aceptados por el backend (50 estados + DC + PR). */
export const US_STATE_CODES: ReadonlySet<string> = new Set(CIP_US_STATES.map(s => s.code))

/** Largo máximo del campo SSN con sus dos guiones (`123-45-6789`). */
export const SSN_MAX_LENGTH = 11

/** El formulario que corresponde a la ficha guardada (el SSN nunca viaja: queda en blanco). */
export function cipFormFromProfile(cip: UserCip | null | undefined): CipForm {
	if (!cip) { return EMPTY_CIP_FORM }
	return {
		usPerson: cip.us_person === true,
		ssn: '',
		addrLine1: cip.addr_line1 ?? '',
		addrLine2: cip.addr_line2 ?? '',
		addrCity: cip.addr_city ?? '',
		addrState: cip.addr_state ?? '',
		addrPostal: cip.addr_postal ?? '',
	}
}

/** Solo dígitos del SSN tecleado. */
export const ssnDigits = (ssn: string): string => String(ssn ?? '').replace(/\D/g, '').slice(0, 9)

/** Formato de tecleo `123-45-6789`: dígitos con los guiones puestos (y nunca más de 9). */
export function formatSsnInput(text: string): string {
	const digits = ssnDigits(text)
	if (digits.length <= 3) { return digits }
	if (digits.length <= 5) { return `${digits.slice(0, 3)}-${digits.slice(3)}` }
	return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

/**
 * Primer error del formulario, o null si se puede guardar.
 *
 * @param form - Lo tecleado.
 * @param opts.hasSavedSsn - Ya hay un SSN en la ficha: en blanco significa "no tocar".
 */
export function validateCip(form: CipForm, { hasSavedSsn }: { hasSavedSsn: boolean }): CipValidationError | null {
	if (!form.usPerson) { return null }
	const typed = form.ssn.trim().length > 0
	if ((typed || !hasSavedSsn) && ssnDigits(form.ssn).length !== 9) { return { field: 'ssn', key: 'ssnInvalid' } }
	if (!form.addrLine1.trim()) { return { field: 'addrLine1', key: 'addressRequired' } }
	if (!form.addrCity.trim()) { return { field: 'addrCity', key: 'addressRequired' } }
	if (!US_STATE_CODES.has(form.addrState)) { return { field: 'addrState', key: 'stateRequired' } }
	if (!US_ZIP_REGEX.test(form.addrPostal.trim())) { return { field: 'addrPostal', key: 'zipInvalid' } }
	return null
}

/**
 * Objeto `cip` para `POST /user/update`. La dirección viaja ENTERA (el backend pone a
 * null lo que no llega); `ssn` solo si se tecleó; `addr_country` siempre `US`.
 */
export function buildCipPayload(form: CipForm): CipPayload {
	if (!form.usPerson) { return { us_person: false } }
	const digits = ssnDigits(form.ssn)
	return {
		us_person: true,
		...(digits ? { ssn: digits } : {}),
		addr_line1: form.addrLine1.trim(),
		addr_line2: form.addrLine2.trim(),
		addr_city: form.addrCity.trim(),
		addr_state: form.addrState,
		addr_postal: form.addrPostal.trim(),
		addr_country: 'US',
	}
}

/**
 * ¿Hay algo que mandar? Un perfil que nunca tocó la sección no debe crear una fila
 * CIP vacía; un SSN tecleado cuenta siempre como cambio.
 */
export function isCipDirty(form: CipForm, loaded: CipForm): boolean {
	if (form.ssn.trim()) { return true }
	return (['usPerson', 'addrLine1', 'addrLine2', 'addrCity', 'addrState', 'addrPostal'] as const)
		.some(key => String(form[key]).trim() !== String(loaded[key]).trim())
}
