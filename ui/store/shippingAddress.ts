import i18n from '../../i18n'
import { US_STATES } from '../../screens/store/assisted/assistedConstants'
import {
	CU_PHONE_MIN_DIGITS,
	canonicalMunicipality,
	identificationMessage,
	isCubaAddress,
	isCubanProvince,
	normalizeIdentification,
	phoneDigits,
	provinceName,
} from './cubaAddress'

/** País de una dirección que se puede crear desde la app. */
export type AddressCountry = 'US' | 'CU'

/**
 * Saved shipping address as returned by `GET /user/shipping-addresses` (only the fields the
 * UI reads). Cuba: `state` is the province code, `city` the canonical municipality name,
 * `identification` the recipient's 11-digit ID card and no `postal_code`.
 */
export type ShippingAddress = {
	uuid: string
	label?: string | null
	is_default?: boolean | number | null
	recipient_name: string
	phone?: string | null
	identification?: string | null
	line1: string
	line2?: string | null
	city: string
	state: string
	postal_code?: string | null
	country?: string | null
}

/**
 * One-line summary of a shipping address, for cards and confirm modals. US: «Name — street,
 * city, ST 33033». Cuba: «Name — street, municipality, province», with no postal code. Never
 * prints a missing field (a Cuban address used to read «…, LHA null»).
 *
 * @param a - Saved address or the form values (with `country`).
 * @returns Human-readable summary.
 */
export const formatAddress = (a: Partial<Omit<ShippingAddress, 'uuid'>> & { uuid?: string }): string => {
	const region = isCubaAddress(a)
		? joinParts([a.city, a.state ? provinceName(a.state) : ''], ', ')
		: joinParts([a.city, joinParts([a.state, a.postal_code], ' ')], ', ')
	const place = joinParts([a.line1, a.line2, region], ', ')
	const name = String(a.recipient_name ?? '').trim()
	return name && place ? `${name} — ${place}` : name || place
}

/** Joins the non-empty parts (null, undefined and blanks are skipped). */
const joinParts = (parts: (string | null | undefined)[], separator: string): string =>
	parts.map(s => String(s ?? '').trim()).filter(Boolean).join(separator)

/** Controlled form values of a shipping address (both countries share the shape). */
export type AddressForm = {
	recipient_name: string
	phone: string
	/** Carnet del destinatario (solo Cuba): dígitos, como mucho 11. */
	identification: string
	line1: string
	line2: string
	city: string
	state: string
	postal_code: string
}

/** Nombre histórico: la compra asistida solo crea direcciones de EE. UU. */
export type UsAddressForm = AddressForm

export const EMPTY_ADDRESS_FORM: AddressForm = { recipient_name: '', phone: '', identification: '', line1: '', line2: '', city: '', state: '', postal_code: '' }

export const EMPTY_US_ADDRESS: UsAddressForm = EMPTY_ADDRESS_FORM

const ZIP_REGEX = /^\d{5}(-\d{4})?$/

/**
 * Validates a new US shipping-address form. Los mensajes se resuelven con
 * `i18n.t()` en call time (idioma activo al validar, no al importar).
 *
 * @param form - Form values (EMPTY_US_ADDRESS shape).
 * @returns Localized error message, or null when valid.
 */
export function validateUsAddress(form: UsAddressForm): string | null {
	if (form.recipient_name.trim().length < 2) return i18n.t('ui.newAddressForm.errors.recipientName')
	if (form.line1.trim().length < 3) return i18n.t('ui.newAddressForm.errors.line1')
	if (form.city.trim().length < 2) return i18n.t('ui.newAddressForm.errors.city')
	if (!US_STATES.some(s => s.code === form.state)) return i18n.t('ui.newAddressForm.errors.state')
	if (!ZIP_REGEX.test(form.postal_code.trim())) return i18n.t('ui.newAddressForm.errors.postalCode')
	return null
}

/**
 * Validates a Cuban shipping-address form with the server's rules (`internationalAddressSchema`,
 * CU branch): province code, a municipality from that province's closed list, street, and the
 * recipient's ID card. The phone is optional for the server, but the courier calls it, so the
 * form asks for at least 8 digits. Same order as the fields on screen.
 *
 * @param form - Form values.
 * @returns Localized error message, or null when valid.
 */
export function validateCubaAddress(form: AddressForm): string | null {
	if (form.recipient_name.trim().length < 2) return i18n.t('ui.newAddressForm.errors.recipientName')
	if (phoneDigits(form.phone) < CU_PHONE_MIN_DIGITS) return i18n.t('ui.newAddressForm.errors.phoneCuba')
	if (!isCubanProvince(form.state)) return i18n.t('ui.newAddressForm.errors.province')
	if (!canonicalMunicipality(form.state, form.city)) return i18n.t('ui.newAddressForm.errors.municipality')
	if (form.line1.trim().length < 3) return i18n.t('ui.newAddressForm.errors.line1Cuba')
	return identificationMessage(form.identification)
}

/**
 * Validates the form for its country.
 *
 * @param form - Form values.
 * @param country - Country the form is filling.
 * @returns Localized error message, or null when valid.
 */
export const validateAddress = (form: AddressForm, country: AddressCountry): string | null => (country === 'CU' ? validateCubaAddress(form) : validateUsAddress(form))

/** Body de `POST /user/shipping-addresses` (y del `PATCH` al completar una dirección). */
export type AddressBody = {
	recipient_name: string
	phone: string | null
	line1: string
	line2: string | null
	city: string
	state: string
	country: AddressCountry
	postal_code?: string
	identification?: string
}

/**
 * Backend payload for `shopApi.createShippingAddress` from a validated form. Cuba sends the
 * canonical municipality name, the province code and only the ID card's digits, with no postal
 * code; the US keeps its ZIP and never sends an ID card.
 *
 * @param form - Validated form values.
 * @param country - Address country.
 * @returns Address body.
 */
export function buildAddressBody(form: AddressForm, country: AddressCountry = 'US'): AddressBody {
	const base = {
		recipient_name: form.recipient_name.trim(),
		phone: form.phone.trim() || null,
		line1: form.line1.trim(),
		line2: form.line2.trim() || null,
	}
	if (country === 'CU') {
		return {
			...base,
			city: canonicalMunicipality(form.state, form.city) || form.city.trim(),
			state: form.state.trim().toUpperCase(),
			country: 'CU',
			identification: normalizeIdentification(form.identification),
		}
	}
	return { ...base, city: form.city.trim(), state: form.state, postal_code: form.postal_code.trim(), country: 'US' }
}

/**
 * Form values to complete a saved Cuban address: its data, with the municipality only when it
 * is canonical (an old one typed by hand has to be picked from the list again) and the ID card
 * reduced to digits.
 *
 * @param a - Saved Cuban address.
 * @returns Prefilled form.
 */
export function formFromSavedAddress(a: ShippingAddress): AddressForm {
	const state = isCubanProvince(a.state) ? String(a.state).trim().toUpperCase() : ''
	return {
		recipient_name: a.recipient_name || '',
		phone: a.phone || '',
		identification: normalizeIdentification(a.identification),
		line1: a.line1 || '',
		line2: a.line2 || '',
		city: (state && canonicalMunicipality(state, a.city)) || '',
		state,
		postal_code: '',
	}
}
